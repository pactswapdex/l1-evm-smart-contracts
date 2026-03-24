import { expect } from 'chai';
import hre from 'hardhat';

describe('C1_ERC20_BEP20 - Fee Distribution Tests', function () {
  let c1erc20: any;
  let mockToken: any;
  let owner: any, recipient: any, feeAddr1: any, feeAddr2: any, feeAddr3: any;
  let ethers: any;

  const MAX_NONCE = 100n;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, recipient, feeAddr1, feeAddr2, feeAddr3] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory('MockERC20');
    mockToken = await MockToken.deploy('Mock Token', 'MTK');

    const C1Erc20Bep20 = await ethers.getContractFactory('C1Erc20Bep20');
    c1erc20 = await C1Erc20Bep20.deploy(await mockToken.getAddress());

    // Mint and approve a large amount
    const mintAmount = ethers.parseEther('10000');
    await mockToken.mint(owner.address, mintAmount);
    await mockToken.approve(await c1erc20.getAddress(), mintAmount);
  });

  describe('Single Fee Recipient', function () {
    it('Should distribute fee and remainder correctly', async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('10');
      const totalAmount = ethers.parseEther('1');
      const feeAmount = ethers.parseEther('0.1');
      const expectedRecipientAmount = totalAmount - feeAmount;

      const recipientBefore = await mockToken.balanceOf(recipient.address);
      const feeBefore = await mockToken.balanceOf(feeAddr1.address);
      const senderBefore = await mockToken.balanceOf(owner.address);

      // Act
      await c1erc20.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, totalAmount, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }]
      );

      // Assert
      expect(await mockToken.balanceOf(recipient.address) - recipientBefore).to.equal(expectedRecipientAmount);
      expect(await mockToken.balanceOf(feeAddr1.address) - feeBefore).to.equal(feeAmount);
      expect(senderBefore - await mockToken.balanceOf(owner.address)).to.equal(totalAmount);
    });

    it('Should emit FeePaid event with correct args', async function () {
      const l2LinkedId = 1n;
      const feeAmount = ethers.parseEther('0.05');

      await expect(
        c1erc20.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
          [{ recipient: feeAddr1.address, amount: feeAmount }]
        )
      )
        .to.emit(c1erc20, 'FeePaid')
        .withArgs(l2LinkedId, feeAddr1.address, feeAmount);
    });

    it('Should emit Transfer event with recipient amount (not total)', async function () {
      const l2LinkedId = 1n;
      const totalAmount = ethers.parseEther('1');
      const feeAmount = ethers.parseEther('0.2');
      const expectedRecipientAmount = totalAmount - feeAmount;

      await expect(
        c1erc20.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, totalAmount, '0x',
          [{ recipient: feeAddr1.address, amount: feeAmount }]
        )
      )
        .to.emit(c1erc20, 'Transfer')
        .withArgs(l2LinkedId, 0n, recipient.address, expectedRecipientAmount, '0x');
    });
  });

  describe('Multiple Fee Recipients', function () {
    it('Should distribute fees to multiple recipients correctly', async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('10');
      const totalAmount = ethers.parseEther('2');
      const fee1 = ethers.parseEther('0.1');
      const fee2 = ethers.parseEther('0.15');
      const fee3 = ethers.parseEther('0.05');
      const totalFees = fee1 + fee2 + fee3;
      const expectedRecipientAmount = totalAmount - totalFees;

      const recipientBefore = await mockToken.balanceOf(recipient.address);
      const fee1Before = await mockToken.balanceOf(feeAddr1.address);
      const fee2Before = await mockToken.balanceOf(feeAddr2.address);
      const fee3Before = await mockToken.balanceOf(feeAddr3.address);

      // Act
      await c1erc20.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, totalAmount, '0x',
        [
          { recipient: feeAddr1.address, amount: fee1 },
          { recipient: feeAddr2.address, amount: fee2 },
          { recipient: feeAddr3.address, amount: fee3 },
        ]
      );

      // Assert
      expect(await mockToken.balanceOf(recipient.address) - recipientBefore).to.equal(expectedRecipientAmount);
      expect(await mockToken.balanceOf(feeAddr1.address) - fee1Before).to.equal(fee1);
      expect(await mockToken.balanceOf(feeAddr2.address) - fee2Before).to.equal(fee2);
      expect(await mockToken.balanceOf(feeAddr3.address) - fee3Before).to.equal(fee3);
    });

    it('Should emit FeePaid for each fee recipient', async function () {
      const l2LinkedId = 1n;
      const fee1 = ethers.parseEther('0.1');
      const fee2 = ethers.parseEther('0.2');

      const tx = await c1erc20.connect(owner).transfer(
        l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
        [
          { recipient: feeAddr1.address, amount: fee1 },
          { recipient: feeAddr2.address, amount: fee2 },
        ]
      );

      await expect(tx).to.emit(c1erc20, 'FeePaid').withArgs(l2LinkedId, feeAddr1.address, fee1);
      await expect(tx).to.emit(c1erc20, 'FeePaid').withArgs(l2LinkedId, feeAddr2.address, fee2);
    });
  });

  describe('Sender Token Accounting — No Tokens Lost', function () {
    it('Should pull exactly totalAmount from sender (recipient + all fees)', async function () {
      const totalAmount = ethers.parseEther('3');
      const fee1 = ethers.parseEther('0.5');
      const fee2 = ethers.parseEther('0.3');

      const senderBefore = await mockToken.balanceOf(owner.address);

      await c1erc20.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, totalAmount, '0x',
        [
          { recipient: feeAddr1.address, amount: fee1 },
          { recipient: feeAddr2.address, amount: fee2 },
        ]
      );

      const senderAfter = await mockToken.balanceOf(owner.address);
      expect(senderBefore - senderAfter).to.equal(totalAmount, 'Sender must lose exactly totalAmount');
    });

    it('Contract should hold zero tokens after transfer', async function () {
      await c1erc20.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('2'), '0x',
        [{ recipient: feeAddr1.address, amount: ethers.parseEther('0.5') }]
      );

      const contractBalance = await mockToken.balanceOf(await c1erc20.getAddress());
      expect(contractBalance).to.equal(0n, 'Contract must hold zero tokens');
    });
  });

  describe('paidFor Tracks Only Recipient Amount', function () {
    it('Should record only recipient portion, not fees', async function () {
      const l2LinkedId = 1n;
      const totalAmount = ethers.parseEther('1');
      const feeAmount = ethers.parseEther('0.3');
      const expectedRecipientAmount = totalAmount - feeAmount;

      await c1erc20.connect(owner).transfer(
        l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, totalAmount, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }]
      );

      const paidAmount = await c1erc20.paidFor(l2LinkedId, recipient.address);
      expect(paidAmount).to.equal(expectedRecipientAmount, 'paidFor must exclude fees');
    });

    it('Should accumulate recipient-only amounts across multiple transfers', async function () {
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('10');
      const feeAmount = ethers.parseEther('0.1');

      // Transfer 1: 1 token total, 0.1 fee → 0.9 recorded
      await c1erc20.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }]
      );

      // Transfer 2: 0.5 token total, 0.1 fee → 0.4 recorded
      await c1erc20.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, ethers.parseEther('0.5'), '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }]
      );

      const paidAmount = await c1erc20.paidFor(l2LinkedId, recipient.address);
      expect(paidAmount).to.equal(ethers.parseEther('1.3')); // 0.9 + 0.4
    });
  });

  describe('maxPayment Applies to Recipient Amount Only', function () {
    it('Should allow transfer when recipient amount is within max but total exceeds it', async function () {
      // maxPayment = 0.8, amount = 1, fee = 0.3 → recipient = 0.7 < 0.8 ✓
      const tx = await c1erc20.connect(owner).transfer(
        1n, ethers.parseEther('0.8'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
        [{ recipient: feeAddr1.address, amount: ethers.parseEther('0.3') }]
      );
      await tx.wait();

      const paidAmount = await c1erc20.paidFor(1n, recipient.address);
      expect(paidAmount).to.equal(ethers.parseEther('0.7'));
    });

    it('Should revert when recipient amount exceeds max', async function () {
      // maxPayment = 0.5, amount = 1, fee = 0.1 → recipient = 0.9 > 0.5 ✗
      await expect(
        c1erc20.connect(owner).transfer(
          1n, ethers.parseEther('0.5'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
          [{ recipient: feeAddr1.address, amount: ethers.parseEther('0.1') }]
        )
      ).to.be.revertedWithCustomError(c1erc20, 'ExceedsMaxPayment');
    });
  });

  describe('Validation Errors', function () {
    it('Should revert if fee recipient is zero address', async function () {
      await expect(
        c1erc20.connect(owner).transfer(
          1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
          [{ recipient: ethers.ZeroAddress, amount: ethers.parseEther('0.1') }]
        )
      ).to.be.revertedWithCustomError(c1erc20, 'InvalidFeeRecipient');
    });

    it('Should revert if amount equals total fees (nothing for recipient)', async function () {
      await expect(
        c1erc20.connect(owner).transfer(
          1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
          [{ recipient: feeAddr1.address, amount: ethers.parseEther('1') }]
        )
      ).to.be.revertedWithCustomError(c1erc20, 'InsufficientAmountForFees');
    });

    it('Should revert if amount is less than total fees', async function () {
      await expect(
        c1erc20.connect(owner).transfer(
          1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
          [
            { recipient: feeAddr1.address, amount: ethers.parseEther('0.6') },
            { recipient: feeAddr2.address, amount: ethers.parseEther('0.5') },
          ]
        )
      ).to.be.revertedWithCustomError(c1erc20, 'InsufficientAmountForFees');
    });
  });

  describe('Nonce and Fee Interaction', function () {
    it('Should increment nonce correctly when fees are present', async function () {
      const l2LinkedId = 1n;
      const feeAmount = ethers.parseEther('0.05');
      const fees = [{ recipient: feeAddr1.address, amount: feeAmount }];

      await expect(
        c1erc20.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x', fees
        )
      ).to.emit(c1erc20, 'Transfer').withArgs(l2LinkedId, 0n, recipient.address, ethers.parseEther('0.95'), '0x');

      await expect(
        c1erc20.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x', fees
        )
      ).to.emit(c1erc20, 'Transfer').withArgs(l2LinkedId, 1n, recipient.address, ethers.parseEther('0.95'), '0x');

      const nonce = await c1erc20.getNonce(l2LinkedId);
      expect(nonce).to.equal(2n);
    });

    it('Should respect maxNonce with fees', async function () {
      const l2LinkedId = 1n;
      const maxNonce = 1n;
      const fees = [{ recipient: feeAddr1.address, amount: ethers.parseEther('0.05') }];

      await c1erc20.connect(owner).transfer(
        l2LinkedId, ethers.parseEther('10'), maxNonce, recipient.address, ethers.parseEther('1'), '0x', fees
      );

      await expect(
        c1erc20.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), maxNonce, recipient.address, ethers.parseEther('1'), '0x', fees
        )
      ).to.be.revertedWithCustomError(c1erc20, 'ExceedsMaxNonce');
    });
  });

  describe('Edge Cases', function () {
    it('Should handle minimum recipient amount (1 unit) with large fees', async function () {
      const totalAmount = ethers.parseEther('1');
      const feeAmount = totalAmount - 1n; // leave exactly 1 unit for recipient

      const tx = await c1erc20.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, totalAmount, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }]
      );
      await tx.wait();

      const paidAmount = await c1erc20.paidFor(1n, recipient.address);
      expect(paidAmount).to.equal(1n);
    });

    it('Should handle same address for fee recipient and main recipient', async function () {
      const totalAmount = ethers.parseEther('1');
      const feeAmount = ethers.parseEther('0.2');
      const expectedRecipientToken = totalAmount; // 0.8 as recipient + 0.2 as fee

      const recipientBefore = await mockToken.balanceOf(recipient.address);

      await c1erc20.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, totalAmount, '0x',
        [{ recipient: recipient.address, amount: feeAmount }]
      );

      const recipientAfter = await mockToken.balanceOf(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(expectedRecipientToken);

      // But paidFor only records the recipient portion
      const paidAmount = await c1erc20.paidFor(1n, recipient.address);
      expect(paidAmount).to.equal(totalAmount - feeAmount);
    });
  });
});
