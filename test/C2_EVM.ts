import { expect } from 'chai';
import hre from 'hardhat';

describe('C2_EVM', function () {
  let c2evm: any;
  let owner: any, recipient: any, otherAccount: any;
  let ethers: any;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, recipient, otherAccount] = await ethers.getSigners();

    const C2Evm = await ethers.getContractFactory('C2Evm');
    c2evm = await C2Evm.deploy();
  });

  describe('Transfer', function () {
    it('Should transfer ETH and emit T event', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.5');

      const initialBalance = await ethers.provider.getBalance(recipient.address);

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, 'T')
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount);

      const finalBalance = await ethers.provider.getBalance(recipient.address);
      expect(finalBalance - initialBalance).to.equal(transferAmount);
    });

    it('Should track cumulative payments correctly', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.3');

      await c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });

      let paid = await c2evm.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount);

      await c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });

      paid = await c2evm.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount * 2n);
    });

    it('Should increment nonce correctly', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, 'T')
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount);

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, 'T')
        .withArgs(l2LinkedId, 1n, recipient.address, transferAmount);

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, 'T')
        .withArgs(l2LinkedId, 2n, recipient.address, transferAmount);

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, 'T')
        .withArgs(l2LinkedId, 3n, recipient.address, transferAmount);

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, 'T')
        .withArgs(l2LinkedId, 4n, recipient.address, transferAmount);
    });

    it('Should revert on zero address recipient', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethers.ZeroAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(c2evm, 'E1');
    });

    it('Should revert on contract address as recipient', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, await c2evm.getAddress(), {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(c2evm, 'E1');
    });

    it('Should revert on zero payment', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: 0,
        })
      ).to.be.revertedWithCustomError(c2evm, 'E2');
    });

    it('Should revert on payment exceeding maxAllowedPayment', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('0.5');
      const transferAmount = ethers.parseEther('0.3');

      await c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(c2evm, 'E3');
    });
  });

  describe('PaidFor', function () {
    it('Should return 0 for unused l2LinkedId and recipient', async function () {
      const l2LinkedId = 1n;

      const paid = await c2evm.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(0n);
    });

    it('Should track payments separately for different l2LinkedIds', async function () {
      const l2LinkedId1 = 1n;
      const l2LinkedId2 = 2n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      await c2evm.transfer(l2LinkedId1, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });

      await c2evm.transfer(l2LinkedId2, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });

      const paid1 = await c2evm.paidFor(l2LinkedId1, recipient.address);
      const paid2 = await c2evm.paidFor(l2LinkedId2, recipient.address);

      expect(paid1).to.equal(transferAmount);
      expect(paid2).to.equal(transferAmount);
    });
  });

  describe('Gas Usage', function () {
    it('Should report gas usage for different operations', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      const tx1 = await c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });
      const receipt1 = await tx1.wait();
      console.log('Gas used (cold storage):', receipt1?.gasUsed);

      const tx2 = await c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });
      const receipt2 = await tx2.wait();
      console.log('Gas used (warm storage):', receipt2?.gasUsed);

      const tx3 = await c2evm.transfer(2n, maxAllowedPayment, recipient.address, {
        value: transferAmount,
      });
      const receipt3 = await tx3.wait();
      console.log('Gas used (new storage slot):', receipt3?.gasUsed);
    });
  });
});
