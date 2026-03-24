import { expect } from 'chai';
import hre from 'hardhat';

describe('C1_EVM - Fee Distribution Tests', function () {
  let c1evm: any;
  let ethRejector: any;
  let owner: any, recipient: any, feeAddr1: any, feeAddr2: any, feeAddr3: any;
  let ethers: any;

  const MAX_NONCE = 100n;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, recipient, feeAddr1, feeAddr2, feeAddr3] = await ethers.getSigners();

    const C1Evm = await ethers.getContractFactory('C1Evm');
    c1evm = await C1Evm.deploy();

    const EthRejector = await ethers.getContractFactory('EthRejector');
    ethRejector = await EthRejector.deploy();
  });

  describe('Single Fee Recipient', function () {
    it('Should distribute fee and remainder correctly', async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('10');
      const totalValue = ethers.parseEther('1');       // msg.value
      const feeAmount = ethers.parseEther('0.1');      // 10% fee
      const expectedRecipientAmount = totalValue - feeAmount; // 0.9 ETH

      const recipientBefore = await ethers.provider.getBalance(recipient.address);
      const feeBefore = await ethers.provider.getBalance(feeAddr1.address);

      // Act
      await c1evm.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }],
        { value: totalValue }
      );

      // Assert
      const recipientAfter = await ethers.provider.getBalance(recipient.address);
      const feeAfter = await ethers.provider.getBalance(feeAddr1.address);

      expect(recipientAfter - recipientBefore).to.equal(expectedRecipientAmount);
      expect(feeAfter - feeBefore).to.equal(feeAmount);
    });

    it('Should emit FeePaid event with correct args', async function () {
      const l2LinkedId = 1n;
      const feeAmount = ethers.parseEther('0.05');

      await expect(
        c1evm.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          [{ recipient: feeAddr1.address, amount: feeAmount }],
          { value: ethers.parseEther('1') }
        )
      )
        .to.emit(c1evm, 'FeePaid')
        .withArgs(l2LinkedId, feeAddr1.address, feeAmount);
    });

    it('Should emit Transfer event with recipient amount (not total)', async function () {
      const l2LinkedId = 1n;
      const totalValue = ethers.parseEther('1');
      const feeAmount = ethers.parseEther('0.2');
      const expectedRecipientAmount = totalValue - feeAmount;

      await expect(
        c1evm.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          [{ recipient: feeAddr1.address, amount: feeAmount }],
          { value: totalValue }
        )
      )
        .to.emit(c1evm, 'Transfer')
        .withArgs(l2LinkedId, 0n, recipient.address, expectedRecipientAmount, '0x');
    });
  });

  describe('Multiple Fee Recipients', function () {
    it('Should distribute fees to multiple recipients correctly', async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('10');
      const totalValue = ethers.parseEther('2');
      const fee1 = ethers.parseEther('0.1');
      const fee2 = ethers.parseEther('0.15');
      const fee3 = ethers.parseEther('0.05');
      const totalFees = fee1 + fee2 + fee3; // 0.3 ETH
      const expectedRecipientAmount = totalValue - totalFees; // 1.7 ETH

      const recipientBefore = await ethers.provider.getBalance(recipient.address);
      const fee1Before = await ethers.provider.getBalance(feeAddr1.address);
      const fee2Before = await ethers.provider.getBalance(feeAddr2.address);
      const fee3Before = await ethers.provider.getBalance(feeAddr3.address);

      // Act
      await c1evm.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x',
        [
          { recipient: feeAddr1.address, amount: fee1 },
          { recipient: feeAddr2.address, amount: fee2 },
          { recipient: feeAddr3.address, amount: fee3 },
        ],
        { value: totalValue }
      );

      // Assert
      expect(await ethers.provider.getBalance(recipient.address) - recipientBefore).to.equal(expectedRecipientAmount);
      expect(await ethers.provider.getBalance(feeAddr1.address) - fee1Before).to.equal(fee1);
      expect(await ethers.provider.getBalance(feeAddr2.address) - fee2Before).to.equal(fee2);
      expect(await ethers.provider.getBalance(feeAddr3.address) - fee3Before).to.equal(fee3);
    });

    it('Should emit FeePaid for each fee recipient', async function () {
      const l2LinkedId = 1n;
      const fee1 = ethers.parseEther('0.1');
      const fee2 = ethers.parseEther('0.2');

      const tx = await c1evm.connect(owner).transfer(
        l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
        [
          { recipient: feeAddr1.address, amount: fee1 },
          { recipient: feeAddr2.address, amount: fee2 },
        ],
        { value: ethers.parseEther('1') }
      );

      await expect(tx).to.emit(c1evm, 'FeePaid').withArgs(l2LinkedId, feeAddr1.address, fee1);
      await expect(tx).to.emit(c1evm, 'FeePaid').withArgs(l2LinkedId, feeAddr2.address, fee2);
    });
  });

  describe('Balance Accounting — No Dust Left', function () {
    it('Should leave zero balance in contract after transfer with fees', async function () {
      const totalValue = ethers.parseEther('3');
      const fee1 = ethers.parseEther('0.5');
      const fee2 = ethers.parseEther('0.3');

      await c1evm.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
        [
          { recipient: feeAddr1.address, amount: fee1 },
          { recipient: feeAddr2.address, amount: fee2 },
        ],
        { value: totalValue }
      );

      const contractBalance = await ethers.provider.getBalance(await c1evm.getAddress());
      expect(contractBalance).to.equal(0n, 'Contract must hold zero ETH after transfer');
    });

    it('Should leave zero balance in contract after transfer without fees', async function () {
      await c1evm.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
        [],
        { value: ethers.parseEther('1') }
      );

      const contractBalance = await ethers.provider.getBalance(await c1evm.getAddress());
      expect(contractBalance).to.equal(0n);
    });
  });

  describe('paidFor Tracks Only Recipient Amount', function () {
    it('Should record only recipient portion, not fees', async function () {
      const l2LinkedId = 1n;
      const totalValue = ethers.parseEther('1');
      const feeAmount = ethers.parseEther('0.3');
      const expectedRecipientAmount = totalValue - feeAmount;

      await c1evm.connect(owner).transfer(
        l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }],
        { value: totalValue }
      );

      const paidAmount = await c1evm.paidFor(l2LinkedId, recipient.address);
      expect(paidAmount).to.equal(expectedRecipientAmount, 'paidFor must exclude fees');
    });

    it('Should accumulate recipient-only amounts across multiple transfers', async function () {
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('10');
      const feeAmount = ethers.parseEther('0.1');

      // Transfer 1: 1 ETH total, 0.1 fee → 0.9 recorded
      await c1evm.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }],
        { value: ethers.parseEther('1') }
      );

      // Transfer 2: 0.5 ETH total, 0.1 fee → 0.4 recorded
      await c1evm.connect(owner).transfer(
        l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }],
        { value: ethers.parseEther('0.5') }
      );

      const paidAmount = await c1evm.paidFor(l2LinkedId, recipient.address);
      expect(paidAmount).to.equal(ethers.parseEther('1.3')); // 0.9 + 0.4
    });
  });

  describe('maxPayment Applies to Recipient Amount Only', function () {
    it('Should allow transfer when recipient amount is within max but total exceeds it', async function () {
      // maxPayment = 0.8, msg.value = 1 ETH, fee = 0.3 → recipient = 0.7 < 0.8 ✓
      const tx = await c1evm.connect(owner).transfer(
        1n, ethers.parseEther('0.8'), MAX_NONCE, recipient.address, '0x',
        [{ recipient: feeAddr1.address, amount: ethers.parseEther('0.3') }],
        { value: ethers.parseEther('1') }
      );
      await tx.wait();

      const paidAmount = await c1evm.paidFor(1n, recipient.address);
      expect(paidAmount).to.equal(ethers.parseEther('0.7'));
    });

    it('Should revert when recipient amount exceeds max even if total is fine', async function () {
      // maxPayment = 0.5, msg.value = 1 ETH, fee = 0.1 → recipient = 0.9 > 0.5 ✗
      await expect(
        c1evm.connect(owner).transfer(
          1n, ethers.parseEther('0.5'), MAX_NONCE, recipient.address, '0x',
          [{ recipient: feeAddr1.address, amount: ethers.parseEther('0.1') }],
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(c1evm, 'ExceedsMaxPayment');
    });
  });

  describe('Validation Errors', function () {
    it('Should revert if fee recipient is zero address', async function () {
      await expect(
        c1evm.connect(owner).transfer(
          1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          [{ recipient: ethers.ZeroAddress, amount: ethers.parseEther('0.1') }],
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(c1evm, 'InvalidFeeRecipient');
    });

    it('Should revert if msg.value equals total fees (nothing for recipient)', async function () {
      await expect(
        c1evm.connect(owner).transfer(
          1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          [{ recipient: feeAddr1.address, amount: ethers.parseEther('1') }],
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(c1evm, 'InsufficientAmountForFees');
    });

    it('Should revert if msg.value is less than total fees', async function () {
      await expect(
        c1evm.connect(owner).transfer(
          1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          [
            { recipient: feeAddr1.address, amount: ethers.parseEther('0.6') },
            { recipient: feeAddr2.address, amount: ethers.parseEther('0.5') },
          ],
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(c1evm, 'InsufficientAmountForFees');
    });

    it('Should revert if fee transfer fails (EthRejector)', async function () {
      const rejectorAddress = await ethRejector.getAddress();

      await expect(
        c1evm.connect(owner).transfer(
          1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          [{ recipient: rejectorAddress, amount: ethers.parseEther('0.1') }],
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(c1evm, 'TransferFailed');
    });
  });

  describe('Nonce and Fee Interaction', function () {
    it('Should increment nonce correctly when fees are present', async function () {
      const l2LinkedId = 1n;
      const feeAmount = ethers.parseEther('0.05');
      const fees = [{ recipient: feeAddr1.address, amount: feeAmount }];

      await expect(
        c1evm.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          fees, { value: ethers.parseEther('1') }
        )
      ).to.emit(c1evm, 'Transfer').withArgs(l2LinkedId, 0n, recipient.address, ethers.parseEther('0.95'), '0x');

      await expect(
        c1evm.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
          fees, { value: ethers.parseEther('1') }
        )
      ).to.emit(c1evm, 'Transfer').withArgs(l2LinkedId, 1n, recipient.address, ethers.parseEther('0.95'), '0x');

      const nonce = await c1evm.getNonce(l2LinkedId);
      expect(nonce).to.equal(2n);
    });

    it('Should respect maxNonce with fees', async function () {
      const l2LinkedId = 1n;
      const maxNonce = 1n;
      const fees = [{ recipient: feeAddr1.address, amount: ethers.parseEther('0.05') }];

      await c1evm.connect(owner).transfer(
        l2LinkedId, ethers.parseEther('10'), maxNonce, recipient.address, '0x',
        fees, { value: ethers.parseEther('1') }
      );

      await expect(
        c1evm.connect(owner).transfer(
          l2LinkedId, ethers.parseEther('10'), maxNonce, recipient.address, '0x',
          fees, { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(c1evm, 'ExceedsMaxNonce');
    });
  });

  describe('Edge Cases', function () {
    it('Should handle minimum recipient amount (1 wei) with large fees', async function () {
      const totalValue = ethers.parseEther('1');
      const feeAmount = totalValue - 1n; // leave exactly 1 wei for recipient

      const tx = await c1evm.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
        [{ recipient: feeAddr1.address, amount: feeAmount }],
        { value: totalValue }
      );
      await tx.wait();

      const paidAmount = await c1evm.paidFor(1n, recipient.address);
      expect(paidAmount).to.equal(1n);
    });

    it('Should handle same address for fee recipient and main recipient', async function () {
      const totalValue = ethers.parseEther('1');
      const feeAmount = ethers.parseEther('0.2');
      const expectedTotal = totalValue; // recipient gets 0.8 + 0.2 fee = 1 ETH total

      const recipientBefore = await ethers.provider.getBalance(recipient.address);

      await c1evm.connect(owner).transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
        [{ recipient: recipient.address, amount: feeAmount }],
        { value: totalValue }
      );

      const recipientAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(expectedTotal);

      // But paidFor only records the recipient portion
      const paidAmount = await c1evm.paidFor(1n, recipient.address);
      expect(paidAmount).to.equal(totalValue - feeAmount);
    });
  });
});
