import hre from 'hardhat';
import { formatEther, parseEther } from 'ethers';

describe('C1_EVM Stress Tests', function () {
  this.timeout(60000);

  let c1evm: any;
  let owner: any, signers: any[];
  let ethers: any;

  const MAX_NONCE = 1_000_000n;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, ...signers] = await ethers.getSigners();
    const C1Evm = await ethers.getContractFactory('C1Evm');
    c1evm = await C1Evm.deploy();

    const initialBalance = await owner.provider.getBalance(owner.address);
    console.log(`Initial balance: ${formatEther(initialBalance)} ETH`);
  });

  describe('Multiple Transfers Stress Test', function () {
    it('Should handle multiple transfers with different scenarios', async function () {
      const initialBalance = await owner.provider.getBalance(owner.address);

      const scenarios = [
        { name: 'Micro Transfers', value: parseEther('0.000001'), iterations: 10_000 },
        { name: 'Small Transfers', value: parseEther('0.0001'), iterations: 5_000 },
        { name: 'Medium Transfers', value: parseEther('0.001'), iterations: 1_000 },
      ];

      const results: {
        [key: string]: {
          gasUsed: bigint[];
          avgGas: bigint;
          minGas: bigint;
          maxGas: bigint;
          totalCost: bigint;
          successRate: number;
        };
      } = {};

      for (const scenario of scenarios) {
        console.log(`\nTesting ${scenario.name}:`);
        const gasUsed: bigint[] = [];
        let successCount = 0;
        let totalSpent = 0n;

        for (let i = 0; i < scenario.iterations; i++) {
          // Check if we have enough balance for next transfer
          const estimatedCost = scenario.value + parseEther('0.0001'); // value + estimated gas cost
          if (totalSpent + estimatedCost >= initialBalance) {
            console.log(`Stopping ${scenario.name} at iteration ${i} due to low balance`);
            break;
          }

          const recipient = signers[(i % (signers.length - 1)) + 1];
          const l2LinkedId = BigInt(i + 1);
          const maxAllowedPayment = scenario.value * 2n;

          try {
            const tx = await c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
              value: scenario.value,
              gasLimit: 100000,
            });
            const receipt = await tx.wait();
            if (receipt?.gasUsed) {
              gasUsed.push(receipt.gasUsed);
              successCount++;
              totalSpent += scenario.value + BigInt(receipt.gasUsed) * receipt.gasPrice;
            }
          } catch (e) {
            console.error(`Failed at iteration ${i}:`, (e as Error).message);
          }
        }

        if (gasUsed.length > 0) {
          const avgGas = gasUsed.reduce((a, b) => a + b, 0n) / BigInt(gasUsed.length);
          const minGas = gasUsed.reduce((a, b) => (a < b ? a : b));
          const maxGas = gasUsed.reduce((a, b) => (a > b ? a : b));
          const totalCost = gasUsed.reduce((a, b) => a + b, 0n);
          const successRate = (successCount / scenario.iterations) * 100;

          results[scenario.name] = {
            gasUsed,
            avgGas,
            minGas,
            maxGas,
            totalCost,
            successRate,
          };

          console.log(`Results for ${scenario.name}:`);
          console.log(`Average gas used: ${avgGas.toString()}`);
          console.log(`Min gas used: ${minGas.toString()}`);
          console.log(`Max gas used: ${maxGas.toString()}`);
          console.log(`Total gas cost: ${formatEther(totalCost)} ETH`);
          console.log(`Success rate: ${successRate}%`);
          console.log(`Total spent: ${formatEther(totalSpent)} ETH`);
        }
      }

      // Concurrent transfers with smaller values and fewer iterations
      console.log('\nTesting Concurrent Transfers:');
      const concurrentPromises: Array<Promise<void>> = [];
      const concurrentIterations = 10;
      const concurrentGasUsed: bigint[] = [];
      const concurrentValue = parseEther('0.0001');

      for (let i = 0; i < concurrentIterations; i++) {
        const recipient = signers[(i % (signers.length - 1)) + 1];
        const l2LinkedId = BigInt(i + 100);
        const maxAllowedPayment = concurrentValue * 2n;

        concurrentPromises.push(
          (async () => {
            try {
              const tx = await c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
                value: concurrentValue,
                gasLimit: 100000,
              });
              const receipt = await tx.wait();
              if (receipt?.gasUsed) {
                concurrentGasUsed.push(receipt.gasUsed);
              }
            } catch (e) {
              console.error(`Concurrent transfer failed at ${i}:`, (e as Error).message);
            }
          })()
        );
      }

      await Promise.all(concurrentPromises);

      if (concurrentGasUsed.length > 0) {
        const avgConcurrentGas = concurrentGasUsed.reduce((a, b) => a + b, 0n) / BigInt(concurrentGasUsed.length);
        const minConcurrentGas = concurrentGasUsed.reduce((a, b) => (a < b ? a : b));
        const maxConcurrentGas = concurrentGasUsed.reduce((a, b) => (a > b ? a : b));
        const successRateConcurrent = (concurrentGasUsed.length / concurrentIterations) * 100;

        console.log('\nConcurrent Transfer Results:');
        console.log(`Average gas used: ${avgConcurrentGas.toString()}`);
        console.log(`Min gas used: ${minConcurrentGas.toString()}`);
        console.log(`Max gas used: ${maxConcurrentGas.toString()}`);
        console.log(`Success rate: ${successRateConcurrent}%`);
      }
    });
  });
});
