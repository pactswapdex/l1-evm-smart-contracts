import '@nomicfoundation/hardhat-ethers';
import hre, { network } from 'hardhat';
import fs from 'fs';
import path from 'path';
import cliProgress from 'cli-progress';
import { verifyContract } from '@nomicfoundation/hardhat-verify/verify';
import colors from 'ansi-colors';
import packageJson from '../package.json' with { type: 'json' };
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
//  DEPLOYMENT CONFIGURATION — edit this section before running
// ============================================================

/** Verify contracts on block explorer after deployment */
const VERIFY_CONTRACTS = true;

/** Which contract types to deploy */
const DEPLOY = {
  C1_EVM: true,
  C1_ERC20: true,
  C2_EVM: true,
  C2_ERC20: true,
};

/**
 * Token addresses for ERC20 contracts, per network.
 * One contract instance is deployed per token per enabled ERC20 contract type.
 *
 * Example: deploying to "bsc" with C1_ERC20 = true, C2_ERC20 = true
 * and 2 tokens → 4 contracts total.
 */
const TOKENS: Record<string, { name: string; address: string }[]> = {
  mainnet: [
    { name: 'WCWEB', address: '0x505B5eDa5E25a67E1c24A2BF1a527Ed9eb88Bf04' },
    { name: 'USDC', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
    { name: 'USDT', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
    { name: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
    { name: 'USD1', address: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d' },
  ],
  bsc: [
    // { name: 'USD1', address: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d' },
    // { name: 'USDC', address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' },
    { name: 'USDT', address: '0x55d398326f99059fF775485246999027B3197955' },
    // { name: 'WBTC', address: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c' },
  ],
  polygon: [{ name: 'USDT', address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F' }],
  holesky: [{ name: 'TEST', address: '0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034' }],
  l1a: [{ name: 'L1A_TOKEN', address: '0x9596261b59746D4fb1D1475491Def89325842868' }],
  l1b: [{ name: 'L1B_TOKEN', address: '0x6e00389D89B8A85cAc7f0891300E28020D868F52' }],
};

// ============================================================
//  END OF CONFIGURATION
// ============================================================

const { ethers, networkName } = await network.connect();

const DELAY_BEFORE_VERIFY_MS = 1000 * 12 * 2; // ~2 blocks at 12s each

interface DeploymentInfo {
  name: string;
  label: string;
  address: string;
  constructorArgs: any[];
  abi: any;
  bytecode: string;
  deploymentHash: string;
}

interface ContractToDeploy {
  name: string;
  label: string;
  args: any[];
}

function buildContractList(): ContractToDeploy[] {
  const contracts: ContractToDeploy[] = [];

  if (DEPLOY.C1_EVM) {
    contracts.push({ name: 'C1Evm', label: 'C1_EVM', args: [] });
  }
  if (DEPLOY.C2_EVM) {
    contracts.push({ name: 'C2Evm', label: 'C2_EVM', args: [] });
  }

  if (DEPLOY.C1_ERC20 || DEPLOY.C2_ERC20) {
    const networkTokens = TOKENS[networkName];
    if (!networkTokens || networkTokens.length === 0) {
      throw new Error(
        `DEPLOY.C1_ERC20 or C2_ERC20 is enabled but no tokens configured for network "${networkName}". ` +
          `Add entries to TOKENS["${networkName}"] in deploy.ts`
      );
    }

    for (const token of networkTokens) {
      if (DEPLOY.C1_ERC20) {
        contracts.push({
          name: 'C1Erc20Bep20',
          label: `C1_ERC20_${token.name}`,
          args: [token.address],
        });
      }
      if (DEPLOY.C2_ERC20) {
        contracts.push({
          name: 'C2Erc20Bep20',
          label: `C2_ERC20_${token.name}`,
          args: [token.address],
        });
      }
    }
  }

  return contracts;
}

async function main() {
  const contracts = buildContractList();

  if (contracts.length === 0) {
    console.log(colors.yellow('\n⚠  Nothing to deploy — all contract types are disabled.\n'));
    return;
  }

  console.log(colors.cyan.bold('\n🚀 Starting deployment process...\n'));
  console.log(colors.white(`   Network:   ${colors.bold(networkName)}`));
  console.log(colors.white(`   Contracts: ${colors.bold(String(contracts.length))}`));
  console.log(colors.white(`   Verify:    ${colors.bold(VERIFY_CONTRACTS ? 'yes' : 'no')}`));
  console.log();

  for (const c of contracts) {
    const argsStr = c.args.length ? ` (${c.args.join(', ')})` : '';
    console.log(colors.gray(`   • ${c.label}${argsStr}`));
  }
  console.log();

  const deployDir = path.join(__dirname, `../deployments/${networkName}_${packageJson.version}`);
  fs.mkdirSync(deployDir, { recursive: true });

  const deployments: DeploymentInfo[] = [];

  const progressBar = new cliProgress.SingleBar({
    format: '{bar} | {percentage}% | {task}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    clearOnComplete: false,
  });

  progressBar.start(100, 0, { task: 'Deploying contracts' });

  for (const [index, contract] of contracts.entries()) {
    const result = await deployWithRetries(contract, 5);
    if (result) {
      deployments.push(result);
    }
    progressBar.update(((index + 1) / contracts.length) * 100, {
      task: `Deployed ${contract.label}`,
    });
  }

  progressBar.update(0, { task: 'Generating documentation' });
  await generateDeploymentDocs(deployDir, deployments);
  progressBar.update(100, { task: 'Documentation generated' });

  if (VERIFY_CONTRACTS) {
    progressBar.update(0, { task: 'Waiting before verification...' });
    await sleep(DELAY_BEFORE_VERIFY_MS);
    progressBar.update(0, { task: 'Verifying contracts' });
    await verifyDeployments(deployments);
    progressBar.update(100, { task: 'Verification complete' });
  }

  progressBar.stop();

  console.log(colors.green.bold('\n✨ Deployment completed successfully!\n'));
  console.log(colors.white.bold('   Deployed contracts:'));
  for (const d of deployments) {
    console.log(colors.white(`   ${d.label}: ${colors.cyan(d.address)}`));
  }
  console.log();
}

async function deployWithRetries(contract: ContractToDeploy, retries: number): Promise<DeploymentInfo | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const factory = await ethers.getContractFactory(contract.name);
      const instance = await factory.deploy(...contract.args);
      const tx = instance.deploymentTransaction();
      await instance.waitForDeployment();

      return {
        name: contract.name,
        label: contract.label,
        address: await instance.getAddress(),
        constructorArgs: contract.args,
        abi: JSON.parse(JSON.stringify(factory.interface.formatJson())),
        bytecode: factory.bytecode,
        deploymentHash: tx?.hash || '',
      };
    } catch (error) {
      if (attempt < retries) {
        console.error(
          colors.yellow(`\n⚠  ${contract.label} deploy failed (attempt ${attempt + 1}/${retries + 1}), retrying...`)
        );
      } else {
        console.error(colors.red(`\n✗  ${contract.label} deploy failed after ${retries + 1} attempts:`));
        console.error(error);
        return null;
      }
    }
  }
  return null;
}

async function verifyDeployments(deployments: DeploymentInfo[]) {
  console.log(colors.cyan.bold('\n🔍 Verifying contracts...\n'));
  for (const deployment of deployments) {
    try {
      await verifyContract(
        {
          address: deployment.address,
          constructorArgs: deployment.constructorArgs,
          provider: 'etherscan',
          force: true,
        },
        hre
      );
      console.log(colors.green(`   ✓ ${deployment.label} verified`));
    } catch (error) {
      console.error(colors.yellow(`   ⚠ ${deployment.label} verification failed:`), error);
    }
  }
}

// ============================================================
//  Documentation generation (unchanged)
// ============================================================

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
  readme += `| Contract | Label | Address | Constructor Args | Deployment Hash |\n`;
  readme += `|----------|-------|----------|-----------------|----------------|\n`;

  deployments.forEach((d) => {
    readme += `| ${d.name} | ${d.label} | \`${d.address}\` | ${JSON.stringify(d.constructorArgs)} | ${d.deploymentHash} |\n`;
  });

  fs.writeFileSync(path.join(deployDir, 'README.md'), readme);

  for (const deployment of deployments) {
    const contractDir = path.join(deployDir, deployment.label);
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
    indexContent += `export const ${d.label.replace(/[^a-zA-Z0-9_]/g, '_')}Address = '${d.address}';\n`;
    indexContent += `export const ${d.label.replace(/[^a-zA-Z0-9_]/g, '_')}ABI = require('./${d.label}/abi.json');\n`;
  });

  indexContent += `\nexport const deploymentInfo = {\n`;
  deployments.forEach((d) => {
    const key = d.label.replace(/[^a-zA-Z0-9_]/g, '_');
    indexContent += `  ${key}: {\n`;
    indexContent += `    address: '${d.address}',\n`;
    indexContent += `    abi: require('./${d.label}/abi.json'),\n`;
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
      const eventName = item.name;
      const inputs = item.inputs.map((input: any) => input.type).join(',');
      const signature = `${eventName}(${inputs})`;

      const hash = ethers.keccak256(ethers.toUtf8Bytes(signature));

      signatures += `Event: ${eventName}\n`;
      signatures += `Signature: ${signature}\n`;
      signatures += `Topic Hash: ${hash}\n`;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
