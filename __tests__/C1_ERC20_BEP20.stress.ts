import { expect } from 'chai';
import hre from 'hardhat';
import { formatEther, parseEther } from 'ethers';
import type { C1Erc20Bep20, MockERC20 } from '../types/ethers-contracts/index.js';

describe('C1_ERC20_BEP20 Stress Tests', function () {
  this.timeout(120000); // 2 minutes timeout

  let c1erc20: any;
  let mockToken: any;
  let owner: any, signers: any[];
  let ethers: any;

  const MAX_NONCE = 1_000_000n;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, ...signers] = await ethers.getSigners();

    // Deploy mock token
    const MockToken = await ethers.getContractFactory('MockERC20');
    mockToken = await MockToken.deploy('Mock Token', 'MTK');

    // Deploy main contract
    const C1Erc20Bep20Factory = await ethers.getContractFactory('C1Erc20Bep20');
    c1erc20 = await C1Erc20Bep20Factory.deploy(await mockToken.getAddress());

    // Mint tokens and approve
    const mintAmount = parseEther('1000000');
    await mockToken.mint(owner.address, mintAmount);
    await mockToken.approve(await c1erc20.getAddress(), mintAmount);

    console.log(`Minted ${formatEther(mintAmount)} tokens to ${owner.address}`);
  });

  interface TestResult {
    gasUsed: bigint[];
    avgGas: bigint;
    minGas: bigint;
    maxGas: bigint;
    totalCost: bigint;
    successRate: number;
    totalTransferred: bigint;
  }

  async function runScenario(
    c1erc20: C1Erc20Bep20,
    mockToken: MockERC20,
    scenario: {
      name: string;
      value: bigint;
      iterations: number;
    },
    signers: any[]
  ): Promise<TestResult> {
    const gasUsed: bigint[] = [];
    let successCount = 0;
    let totalCost = 0n;
    let totalTransferred = 0n;

    console.log(`\nExecuting ${scenario.name}:`);

    for (let i = 0; i < scenario.iterations; i++) {
      const recipient = signers[(i % (signers.length - 1)) + 1];
      const l2LinkedId = BigInt(i + 1);
      const maxAllowedPayment = scenario.value * 2n;

      try {
        const tx = await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, scenario.value, '0x', [], {
          gasLimit: 200000,
        });

        const receipt = await tx.wait();
        if (receipt?.gasUsed) {
          gasUsed.push(receipt.gasUsed);
          successCount++;
          totalCost += receipt.gasUsed * receipt.gasPrice;
          totalTransferred += scenario.value;
        }
      } catch (e) {
        console.error(`Failed at iteration ${i} in ${scenario.name}:`, e);
      }
    }
    console.log('\n');

    return {
      gasUsed,
      avgGas: gasUsed.length > 0 ? gasUsed.reduce((a, b) => a + b, 0n) / BigInt(gasUsed.length) : 0n,
      minGas: gasUsed.length > 0 ? gasUsed.reduce((a, b) => (a < b ? a : b)) : 0n,
      maxGas: gasUsed.length > 0 ? gasUsed.reduce((a, b) => (a > b ? a : b)) : 0n,
      totalCost,
      successRate: (successCount / scenario.iterations) * 100,
      totalTransferred,
    };
  }

  describe('Stress Testing', function () {
    it('Should handle various transfer scenarios', async function () {
      const scenarios = [
        {
          name: 'Micro Transfers',
          value: parseEther('0.0001'),
          iterations: 10_000,
        },
        {
          name: 'Small Transfers',
          value: parseEther('0.001'),
          iterations: 5_000,
        },
        {
          name: 'Medium Transfers',
          value: parseEther('0.01'),
          iterations: 1_000,
        },
      ];

      for (const scenario of scenarios) {
        const results = await runScenario(
          c1erc20 as unknown as C1Erc20Bep20,
          mockToken as unknown as MockERC20,
          scenario,
          signers
        );

        console.log(`\nResults for ${scenario.name}:`);
        console.log(`Average gas used: ${results.avgGas.toString()}`);
        console.log(`Min gas used: ${results.minGas.toString()}`);
        console.log(`Max gas used: ${results.maxGas.toString()}`);
        console.log(`Total gas cost: ${formatEther(results.totalCost)} ETH`);
        console.log(`Total transferred: ${formatEther(results.totalTransferred)} tokens`);
        console.log(`Success rate: ${results.successRate}%`);
        console.log(`Gas variance: ${Number(results.maxGas - results.minGas)} units`);
      }
    });

    it('Should handle concurrent transfers', async function () {
      const concurrentPromises: Array<Promise<void>> = [];
      const concurrentGasUsed: bigint[] = [];
      const iterations = 15;
      const value = parseEther('0.001');

      console.log('\nTesting Concurrent Transfers:');

      for (let i = 0; i < iterations; i++) {
        const recipient = signers[(i % (signers.length - 1)) + 1];
        const l2LinkedId = BigInt(i + 100);
        const maxAllowedPayment = value * 2n;

        concurrentPromises.push(
          (async () => {
            try {
              const tx = await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, value, '0x', [], {
                gasLimit: 200000,
              });
              const receipt = await tx.wait();
              if (receipt?.gasUsed) {
                concurrentGasUsed.push(receipt.gasUsed);
              }
            } catch (e) {
              console.error(`Concurrent transfer failed at ${i}:`, e);
            }
          })()
        );
      }

      await Promise.all(concurrentPromises);

      if (concurrentGasUsed.length > 0) {
        const avgGas = concurrentGasUsed.reduce((a, b) => a + b, 0n) / BigInt(concurrentGasUsed.length);
        const minGas = concurrentGasUsed.reduce((a, b) => (a < b ? a : b));
        const maxGas = concurrentGasUsed.reduce((a, b) => (a > b ? a : b));
        const successRate = (concurrentGasUsed.length / iterations) * 100;

        console.log('\nConcurrent Transfer Results:');
        console.log(`Average gas used: ${avgGas.toString()}`);
        console.log(`Min gas used: ${minGas.toString()}`);
        console.log(`Max gas used: ${maxGas.toString()}`);
        console.log(`Success rate: ${successRate}%`);
        console.log(`Gas variance: ${Number(maxGas - minGas)} units`);
      }
    });

    it('Should handle rapid sequential transfers', async function () {
      const rapidGasUsed: bigint[] = [];
      const iterations = 25;
      const value = parseEther('0.001');
      let successCount = 0;

      console.log('\nTesting Rapid Sequential Transfers:');

      for (let i = 0; i < iterations; i++) {
        const recipient = signers[1]; // Use same recipient for rapid transfers
        const l2LinkedId = BigInt(i + 200);
        const maxAllowedPayment = value * 2n;

        try {
          const tx = await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, value, '0x', [], {
            gasLimit: 200000,
          });
          const receipt = await tx.wait();
          if (receipt?.gasUsed) {
            rapidGasUsed.push(receipt.gasUsed);
            successCount++;
          }
        } catch (e) {
          console.error(`Rapid transfer failed at ${i}:`, e);
        }
      }

      if (rapidGasUsed.length > 0) {
        const avgGas = rapidGasUsed.reduce((a, b) => a + b, 0n) / BigInt(rapidGasUsed.length);
        const minGas = rapidGasUsed.reduce((a, b) => (a < b ? a : b));
        const maxGas = rapidGasUsed.reduce((a, b) => (a > b ? a : b));
        const successRate = (successCount / iterations) * 100;

        console.log('\nRapid Transfer Results:');
        console.log(`Average gas used: ${avgGas.toString()}`);
        console.log(`Min gas used: ${minGas.toString()}`);
        console.log(`Max gas used: ${maxGas.toString()}`);
        console.log(`Success rate: ${successRate}%`);
        console.log(`Gas variance: ${Number(maxGas - minGas)} units`);
      }
    });
  });
});
