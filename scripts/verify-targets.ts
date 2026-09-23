import '@nomicfoundation/hardhat-ethers';
import hre, { network } from 'hardhat';
import fs from 'fs';
import path from 'path';
import { verifyContract } from '@nomicfoundation/hardhat-verify/verify';
import colors from 'ansi-colors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Contracts to verify (in lowercase for proper comparison).
// The script only verifies addresses that also exist in deployments/<network>_*.
// Run once per network: `--network bsc` and `--network arbitrum`.
const TARGET_ADDRESSES = [
  ''.toLowerCase()
];

async function main() {
  const { networkName } = await network.connect();
  console.log(colors.cyan.bold(`\n🔍 Starting contract verification for network: ${networkName}\n`));

  const deploymentsRoot = path.join(__dirname, '../deployments');
  if (!fs.existsSync(deploymentsRoot)) {
    console.error(colors.red('deployments/ folder not found.'));
    return;
  }

  // Find deployment folders that match the current network (e.g., polygon_1.0.2)
  const networkDirs = fs.readdirSync(deploymentsRoot).filter(dir => dir.startsWith(`${networkName}_`));
  
  if (networkDirs.length === 0) {
    console.log(colors.yellow(`No deployments found for network ${networkName}`));
    return;
  }

  let foundCount = 0;

  for (const dir of networkDirs) {
    const deployDir = path.join(deploymentsRoot, dir);
    const contractDirs = fs.readdirSync(deployDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const contractDir of contractDirs) {
      const deploymentPath = path.join(deployDir, contractDir, 'deployment.json');
      if (fs.existsSync(deploymentPath)) {
        const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        
        if (deploymentData.address && TARGET_ADDRESSES.includes(deploymentData.address.toLowerCase())) {
          foundCount++;
          console.log(colors.blue(`Found target contract in ${dir}/${contractDir}: ${deploymentData.address}`));
          console.log(colors.gray(`Constructor arguments: ${JSON.stringify(deploymentData.constructorArgs)}`));
          
          try {
            console.log(colors.white(`Starting verification...`));
            await verifyContract(
              {
                address: deploymentData.address,
                constructorArgs: deploymentData.constructorArgs,
                provider: 'etherscan',
                force: true, // Force verification even if it might be already verified
              },
              hre
            );
            console.log(colors.green(`✓ Successfully verified ${deploymentData.address}\n`));
          } catch (error: any) {
            console.error(colors.yellow(`⚠ Verification failed for ${deploymentData.address}:`));
            console.error(error.message || error);
            console.log('\n');
          }
        }
      }
    }
  }

  if (foundCount === 0) {
    console.log(colors.yellow(`No deployment information found for these addresses in deployments/ for network ${networkName}.`));
  } else {
    console.log(colors.green.bold('Finished.\n'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
