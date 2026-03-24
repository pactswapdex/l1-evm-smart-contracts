import '@nomicfoundation/hardhat-ethers';
import hre, { network } from 'hardhat';
import { verifyContract } from '@nomicfoundation/hardhat-verify/verify';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import colors from 'ansi-colors';
import packageJson from '../package.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { ethers, networkName } = await network.connect();

const delayBeforVerify = 1000 * 12 * 2; // 2 blocks, 12 sec per block

interface DeploymentInfo {
  name: string;
  address: string;
  constructorArgs: any[];
  abi: any;
  bytecode: string;
  deploymentHash: string;
}

async function main() {
  console.log(colors.cyan.bold('\n🚀 Starting deployment process...\n'));

  const deployDir = path.join(__dirname, `../deployments/token/${networkName}_${packageJson.version}`);
  fs.mkdirSync(deployDir, { recursive: true });

  const deployments: DeploymentInfo[] = [];

  const contracts = [
    {
      name: 'PactSwapToken',
      args: ['PactSwap', 'PS', (100 * 10 ** 18).toString()],
    },
  ];

  const deploy = async (contract: (typeof contracts)[0], index: number, retries: number) => {
    try {
      const factory = await ethers.getContractFactory(contract.name);
      console.log('contract', contract.name, contract.args);
      const instance = await factory.deploy(...contract.args);
      const tx = instance.deploymentTransaction();
      await instance.waitForDeployment();

      deployments.push({
        name: contract.name,
        address: await instance.getAddress(),
        constructorArgs: contract.args,
        abi: JSON.parse(JSON.stringify(factory.interface.formatJson())),
        bytecode: factory.bytecode,
        deploymentHash: tx?.hash || '',
      });
    } catch (error) {
      console.error(error);
      if (retries > 0) {
        await deploy(contract, index, retries - 1);
      }
    }
  };

  for (const [index, contract] of contracts.entries()) {
    await deploy(contract, index, 5);
  }

  await generateDeploymentDocs(deployDir, deployments);

  if (!['l1a', 'l1b'].includes(networkName)) {
    await sleep(delayBeforVerify);
    await verifyDeployments(deployments);
  }

  console.log('\n✨ Deployment completed successfully!\n');
}

async function verifyDeployments(deployments: DeploymentInfo[]) {
  console.log(colors.cyan.bold('\n🔍 Verifying contracts...\n'));
  console.log('\n\n');
  for (const deployment of deployments) {
    await verifyContract(
      {
        address: deployment.address,
        constructorArgs: deployment.constructorArgs,
        provider: 'etherscan',
        force: true,
      },
      hre
    );
  }
}

async function generateDeploymentDocs(deployDir: string, deployments: DeploymentInfo[]) {
  const networkInfo = await ethers.provider.getNetwork();
  const chainId = networkInfo.chainId;
  const blockNumber = await ethers.provider.getBlockNumber();

  let readme = `# Deployment Information\n\n`;
  readme += `**Network:** ${networkName}\n`;
  readme += `**Chain ID:** ${chainId}\n`;
  readme += `**Block Number:** ${blockNumber}\n`;
  readme += `**Timestamp:** ${new Date().toISOString()}\n\n`;

  readme += `## Deployed Contracts\n\n`;
  readme += `| Contract | Address | Constructor Args | Deployment Hash |\n`;
  readme += `|----------|----------|-----------------|----------------|\n`;

  deployments.forEach((d) => {
    readme += `| ${d.name} | \`${d.address}\` | ${JSON.stringify(d.constructorArgs)} | ${d.deploymentHash} |\n`;
  });

  fs.writeFileSync(path.join(deployDir, 'README.md'), readme);

  for (const deployment of deployments) {
    const contractDir = path.join(deployDir, deployment.name);
    fs.mkdirSync(contractDir, { recursive: true });

    fs.writeFileSync(path.join(contractDir, 'abi.json'), JSON.stringify(deployment.abi, null, 2));

    const deployInfo = {
      network: networkName,
      chainId: chainId.toString(),
      address: deployment.address,
      constructorArgs: deployment.constructorArgs,
      deploymentHash: deployment.deploymentHash,
      blockNumber: blockNumber,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(contractDir, 'deployment.json'), JSON.stringify(deployInfo, null, 2));

    fs.writeFileSync(path.join(contractDir, 'bytecode.txt'), deployment.bytecode);

    const tsInterface = generateTypeScriptInterface(deployment.name, deployment.abi);
    fs.writeFileSync(path.join(contractDir, 'interface.ts'), tsInterface);

    const signatures = generateAbiSignatures(deployment.abi);
    fs.writeFileSync(path.join(contractDir, 'abi.txt'), signatures);

    const eventSignatures = generateEventSignatures(deployment.abi);
    fs.writeFileSync(path.join(contractDir, 'events.txt'), eventSignatures);
  }

  generateIndexFile(deployDir, deployments);
}

function generateTypeScriptInterface(contractName: string, abi: any[]): string {
  let ts = `// Generated TypeScript Interface for ${contractName}\n\n`;
  ts += `export interface I${contractName} {\n`;

  const proceededAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;

  proceededAbi.forEach((item: any) => {
    if (item.type === 'function') {
      const inputs = item.inputs
        .map((input: any) => `${input.name}: ${convertSolidityTypeToTS(input.type)}`)
        .join(', ');

      const outputs = item.outputs.map((output: any) => convertSolidityTypeToTS(output.type)).join(' | ');

      ts += `  ${item.name}(${inputs}): Promise<${outputs || 'void'}>;\n`;
    }
  });

  ts += `}\n`;
  return ts;
}

function generateIndexFile(deployDir: string, deployments: DeploymentInfo[]) {
  let indexContent = `// Generated index file for contract deployments\n\n`;

  deployments.forEach((d) => {
    indexContent += `export const ${d.name}Address = '${d.address}';\n`;
    indexContent += `export const ${d.name}ABI = require('./${d.name}/abi.json');\n`;
  });

  indexContent += `\nexport const deploymentInfo = {\n`;
  deployments.forEach((d) => {
    indexContent += `  ${d.name}: {\n`;
    indexContent += `    address: '${d.address}',\n`;
    indexContent += `    abi: require('./${d.name}/abi.json'),\n`;
    indexContent += `  },\n`;
  });
  indexContent += `};\n`;

  fs.writeFileSync(path.join(deployDir, 'index.ts'), indexContent);
}

function convertSolidityTypeToTS(solidityType: string): string {
  if (solidityType.includes('uint')) return 'string';
  if (solidityType.includes('int')) return 'string';
  if (solidityType.includes('bool')) return 'boolean';
  if (solidityType.includes('address')) return 'string';
  if (solidityType.includes('bytes')) return 'string';
  if (solidityType.includes('string')) return 'string';
  return 'any';
}

function generateAbiSignatures(abi: any[]): string {
  let signatures = '';

  const proceededAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;

  proceededAbi.forEach((item: any) => {
    if (item.type === 'function') {
      const inputs = item.inputs
        .map((input: any) => `${input.type}${input.indexed ? ' indexed' : ''} ${input.name}`)
        .join(', ');

      signatures += `function ${item.name}(${inputs})`;

      if (item.outputs && item.outputs.length > 0) {
        const outputs = item.outputs
          .map((output: any) => `${output.type}${output.name ? ' ' + output.name : ''}`)
          .join(', ');
        signatures += ` returns (${outputs})`;
      }

      signatures += ';\n';
    } else if (item.type === 'event') {
      signatures += `event ${item.name}(`;
      signatures += item.inputs
        .map((input: any) => `${input.type}${input.indexed ? ' indexed' : ''} ${input.name}`)
        .join(', ');
      signatures += ');\n';
    } else if (item.type === 'error') {
      signatures += `error ${item.name}(`;
      signatures += item.inputs.map((input: any) => `${input.type} ${input.name}`).join(', ');
      signatures += ');\n';
    }
  });

  return signatures;
}

function generateEventSignatures(abi: any[]): string {
  let signatures = '';

  const proceededAbi = typeof abi === 'string' ? JSON.parse(abi) : abi;

  proceededAbi.forEach((item: any) => {
    if (item.type === 'event') {
      // Create the event signature string
      const eventName = item.name;
      const inputs = item.inputs.map((input: any) => input.type).join(',');
      const signature = `${eventName}(${inputs})`;

      // Calculate the hash
      const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));

      // Format the output
      signatures += `Event: ${eventName}\n`;
      signatures += `Signature: ${signature}\n`;
      signatures += `Topic Hash: ${hash}\n`;

      // Add indexed parameters if any
      const indexedParams = item.inputs
        .filter((input: any) => input.indexed)
        .map((input: any) => `${input.type} ${input.name} (indexed)`)
        .join('\n  ');

      if (indexedParams) {
        signatures += `Indexed Parameters:\n  ${indexedParams}\n`;
      }

      signatures += '\n';
    }
  });

  return signatures;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

function sleep(delayBeforVerify: number) {
  return new Promise((resolve) => setTimeout(resolve, delayBeforVerify));
}
