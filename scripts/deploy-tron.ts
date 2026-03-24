import fs from 'fs';
import path from 'path';
import { keccak256, toUtf8Bytes } from 'ethers';
import colors from 'ansi-colors';
import cliProgress from 'cli-progress';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
//  DEPLOYMENT CONFIGURATION — edit this section before running
// ============================================================

/** Which contract types to deploy */
const DEPLOY = {
  C1_EVM: false,
  C1_ERC20: true,
  C2_EVM: true,
  C2_ERC20: true,
};

/**
 * Token addresses for ERC20 contracts on Tron.
 * Uses Tron base58 address format.
 */
const TOKENS: { name: string; address: string }[] = [{ name: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' }];

/** Fee limit per deployment in SUN (1 TRX = 1,000,000 SUN) */
const FEE_LIMIT = 5_000_000_000; // 5000 TRX

/** Percentage of energy costs paid by contract caller (vs. contract owner) */
const USER_FEE_PERCENTAGE = 100;

/** Maximum energy the contract owner will consume per call */
const ORIGIN_ENERGY_LIMIT = 10_000_000;

// ============================================================
//  END OF CONFIGURATION
// ============================================================

const NETWORK_NAME = 'tron';
const TRON_FULL_HOST = process.env.TRON_FULL_HOST || 'https://api.trongrid.io';
const TRON_PRIVATE_KEY = process.env.TRON_PRIVATE_KEY?.replace('0x', '');
console.log('TRON_PRIVATE_KEY', TRON_PRIVATE_KEY);
const TRON_API_KEY = process.env.TRON_API_KEY;

if (!TRON_PRIVATE_KEY) {
  console.error(colors.red('\nError: TRON_PRIVATE_KEY is not set in .env\n'));
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8'));

//c1evm - TL8GBALPSow3APFGxEsM81hvkiQ9tvwtYd

// ============================================================
//  Artifact loading from Hardhat compilation output
// ============================================================

interface HardhatArtifact {
  contractName: string;
  abi: any[];
  bytecode: string;
}

const ARTIFACT_MAP: Record<string, string> = {
  C1Evm: 'contracts/C1_EVM.sol/C1Evm.json',
  C2Evm: 'contracts/C2_EVM.sol/C2Evm.json',
  C1Erc20Bep20: 'contracts/C1_ERC20_BEP20.sol/C1Erc20Bep20.json',
  C2Erc20Bep20: 'contracts/C2_ERC20_BEP20.sol/C2Erc20Bep20.json',
};

function loadArtifact(contractName: string): HardhatArtifact {
  const relPath = ARTIFACT_MAP[contractName];
  if (!relPath) throw new Error(`Unknown contract: ${contractName}`);
  const fullPath = path.join(__dirname, '../artifacts', relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Artifact not found: ${fullPath}\nRun \`yarn compile\` (hardhat compile) first.`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

// ============================================================
//  Types
// ============================================================

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

// ============================================================
//  Contract list builder
// ============================================================

function buildContractList(): ContractToDeploy[] {
  const contracts: ContractToDeploy[] = [];

  if (DEPLOY.C1_EVM) {
    contracts.push({ name: 'C1Evm', label: 'C1_EVM', args: [] });
  }
  if (DEPLOY.C2_EVM) {
    contracts.push({ name: 'C2Evm', label: 'C2_EVM', args: [] });
  }

  if (DEPLOY.C1_ERC20 || DEPLOY.C2_ERC20) {
    if (TOKENS.length === 0) {
      throw new Error('C1_ERC20 or C2_ERC20 is enabled but no tokens configured in TOKENS array.');
    }

    for (const token of TOKENS) {
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

// ============================================================
//  Deploy logic
// ============================================================

async function deployContract(tronWeb: any, contract: ContractToDeploy): Promise<DeploymentInfo> {
  const artifact = loadArtifact(contract.name);

  const tx = await tronWeb.transactionBuilder.createSmartContract(
    {
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      feeLimit: FEE_LIMIT,
      callValue: 0,
      userFeePercentage: USER_FEE_PERCENTAGE,
      originEnergyLimit: ORIGIN_ENERGY_LIMIT,
      parameters: contract.args,
    },
    tronWeb.defaultAddress.hex
  );

  const signedTx = await tronWeb.trx.sign(tx);
  const receipt = await tronWeb.trx.sendRawTransaction(signedTx);

  if (!receipt.result) {
    throw new Error(`Broadcast failed for ${contract.label}: ${JSON.stringify(receipt)}`);
  }

  const txHash = tx.txID;
  const contractAddressHex = tx.contract_address;
  const contractAddress = tronWeb.address.fromHex(contractAddressHex);

  return {
    name: contract.name,
    label: contract.label,
    address: contractAddress,
    constructorArgs: contract.args,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    deploymentHash: txHash,
  };
}

async function deployWithRetries(
  tronWeb: any,
  contract: ContractToDeploy,
  retries: number
): Promise<DeploymentInfo | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await deployContract(tronWeb, contract);
    } catch (error) {
      if (attempt < retries) {
        console.error(
          colors.yellow(
            `\n  Warning: ${contract.label} deploy failed (attempt ${attempt + 1}/${retries + 1}), retrying...`
          )
        );
        await sleep(3000);
      } else {
        console.error(colors.red(`\n  Error: ${contract.label} deploy failed after ${retries + 1} attempts:`));
        console.error(error);
        return null;
      }
    }
  }
  return null;
}

// ============================================================
//  Documentation generation (mirrors deploy.ts output)
// ============================================================

function generateDeploymentDocs(deployDir: string, deployments: DeploymentInfo[]) {
  let readme = `# Deployment Information\n\n`;
  readme += `**Network:** ${NETWORK_NAME}\n\n`;

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

    const abiData = typeof deployment.abi === 'string' ? deployment.abi : JSON.stringify(deployment.abi, null, 2);
    fs.writeFileSync(path.join(contractDir, 'abi.json'), abiData);

    const deployInfo = {
      network: NETWORK_NAME,
      address: deployment.address,
      constructorArgs: deployment.constructorArgs,
      deploymentHash: deployment.deploymentHash,
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

  const parsed = typeof abi === 'string' ? JSON.parse(abi) : abi;

  parsed.forEach((item: any) => {
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
    const key = d.label.replace(/[^a-zA-Z0-9_]/g, '_');
    indexContent += `export const ${key}Address = '${d.address}';\n`;
    indexContent += `export const ${key}ABI = require('./${d.label}/abi.json');\n`;
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
  const parsed = typeof abi === 'string' ? JSON.parse(abi) : abi;

  parsed.forEach((item: any) => {
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
  const parsed = typeof abi === 'string' ? JSON.parse(abi) : abi;

  parsed.forEach((item: any) => {
    if (item.type === 'event') {
      const eventName = item.name;
      const inputs = item.inputs.map((input: any) => input.type).join(',');
      const signature = `${eventName}(${inputs})`;

      const hash = keccak256(toUtf8Bytes(signature));

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

// ============================================================
//  Main
// ============================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Dynamic import — tronweb is a CJS package, handle both default export shapes
  const tronwebModule = await import('tronweb');
  const TronWeb = tronwebModule.TronWeb ?? tronwebModule.default?.TronWeb ?? tronwebModule.default;

  const headers: Record<string, string> = {};
  if (TRON_API_KEY) {
    headers['TRON-PRO-API-KEY'] = TRON_API_KEY;
  }

  const tronWeb = new TronWeb({
    fullHost: TRON_FULL_HOST,
    headers,
    privateKey: TRON_PRIVATE_KEY,
  });

  const contracts = buildContractList();

  if (contracts.length === 0) {
    console.log(colors.yellow('\n  Nothing to deploy — all contract types are disabled.\n'));
    return;
  }

  console.log(colors.cyan.bold('\n  Starting Tron deployment...\n'));
  console.log(colors.white(`   Network:   ${colors.bold(NETWORK_NAME)}`));
  console.log(colors.white(`   Host:      ${colors.bold(TRON_FULL_HOST)}`));
  console.log(colors.white(`   Contracts: ${colors.bold(String(contracts.length))}`));
  console.log(colors.white(`   Deployer:  ${colors.bold(String(tronWeb.defaultAddress.base58 || ''))}`));
  console.log();

  for (const c of contracts) {
    const argsStr = c.args.length ? ` (${c.args.join(', ')})` : '';
    console.log(colors.gray(`   - ${c.label}${argsStr}`));
  }
  console.log();

  const deployDir = path.join(__dirname, `../deployments/${NETWORK_NAME}_${packageJson.version}`);
  fs.mkdirSync(deployDir, { recursive: true });

  const deployments: DeploymentInfo[] = [];

  const progressBar = new cliProgress.SingleBar({
    format: '{bar} | {percentage}% | {task}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    clearOnComplete: false,
  });

  progressBar.start(100, 0, { task: 'Deploying contracts' });

  for (const [index, contract] of contracts.entries()) {
    const result = await deployWithRetries(tronWeb, contract, 5);
    if (result) {
      deployments.push(result);
    }
    progressBar.update(((index + 1) / contracts.length) * 100, {
      task: `Deployed ${contract.label}`,
    });
  }

  progressBar.update(50, { task: 'Generating documentation' });
  generateDeploymentDocs(deployDir, deployments);
  progressBar.update(100, { task: 'Documentation generated' });

  progressBar.stop();

  console.log(colors.green.bold('\n  Deployment completed!\n'));
  console.log(colors.white.bold('   Deployed contracts:'));
  for (const d of deployments) {
    console.log(colors.white(`   ${d.label}: ${colors.cyan(d.address)}`));
  }
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
