import { expect } from 'chai';
import hre from 'hardhat';

describe('C1_ERC20_BEP20', function () {
  let c1erc20: any;
  let mockToken: any;
  let owner: any, recipient: any, otherAccount: any;
  let ethers: any;

  const MAX_NONCE = 100n;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, recipient, otherAccount] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory('MockERC20');
    mockToken = await MockToken.deploy('Mock Token', 'MTK');

    // Deploy C1Erc20Bep20 contract
    const C1Erc20Bep20 = await ethers.getContractFactory('C1Erc20Bep20');
    c1erc20 = await C1Erc20Bep20.deploy(await mockToken.getAddress());

    // Mint tokens to owner and approve spending
    const mintAmount = ethers.parseEther('1000');
    await mockToken.mint(owner.address, mintAmount);
    await mockToken.approve(await c1erc20.getAddress(), mintAmount);
  });

  describe('Deployment', function () {
    it('Should set the correct token address', async function () {
      expect(await c1erc20.token()).to.equal(await mockToken.getAddress());
    });

    it('Should revert on zero token address', async function () {
      const C1Erc20Bep20 = await ethers.getContractFactory('C1Erc20Bep20');
      await expect(C1Erc20Bep20.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(C1Erc20Bep20, 'ZeroTokenAddress');
    });
  });

  describe('Transfer', function () {
    it('Should transfer tokens and emit Transfer event', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.5');
      const data = '0x';

      const initialBalance = await mockToken.balanceOf(recipient.address);

      await expect(c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, data, []))
        .to.emit(c1erc20, 'Transfer')
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount, data);

      expect(await mockToken.balanceOf(recipient.address)).to.equal(initialBalance + transferAmount);
    });

    it('Should track cumulative payments correctly', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.3');

      await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', []);

      let paid = await c1erc20.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount);

      await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', []);

      paid = await c1erc20.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount * 2n);
    });

    it('Should revert on payment below minimum', async function () {
      await expect(
        c1erc20.transfer(1n, ethers.parseEther('1'), MAX_NONCE, recipient.address, 0, '0x', [])
      ).to.be.revertedWithCustomError(c1erc20, 'InsufficientAmountForFees');
    });

    it('Should revert on zero recipient address', async function () {
      await expect(
        c1erc20.transfer(1n, ethers.parseEther('1'), MAX_NONCE, ethers.ZeroAddress, ethers.parseEther('0.1'), '0x', [])
      ).to.be.revertedWithCustomError(c1erc20, 'InvalidRecipientOrAmount');
    });

    it('Should revert when exceeding maxAllowedPayment', async function () {
      const maxAllowedPayment = ethers.parseEther('0.5');
      const transferAmount = ethers.parseEther('0.3');

      await c1erc20.transfer(1n, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', []);

      await expect(
        c1erc20.transfer(1n, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', [])
      ).to.be.revertedWithCustomError(c1erc20, 'ExceedsMaxPayment');
    });

    it('Should revert when nonce exceeds maxNonce', async function () {
      const maxAllowedPayment = ethers.parseEther('10');
      const maxNonce = 2n;
      const transferAmount = ethers.parseEther('0.1');

      await c1erc20.transfer(1n, maxAllowedPayment, maxNonce, recipient.address, transferAmount, '0x', []);
      await c1erc20.transfer(1n, maxAllowedPayment, maxNonce, recipient.address, transferAmount, '0x', []);

      await expect(
        c1erc20.transfer(1n, maxAllowedPayment, maxNonce, recipient.address, transferAmount, '0x', [])
      ).to.be.revertedWithCustomError(c1erc20, 'ExceedsMaxNonce');
    });
  });

  describe('Security - Attack Vectors', function () {
    it('Should prevent uint96 paid overflow by maxPayment check', async function () {
      // uint96.max ≈ 7.9e28 — for tokens with 18 decimals that's ~79 billion tokens
      // Verify the check guards against near-boundary values
      const l2LinkedId = 1n;
      const uint96Max = (1n << 96n) - 1n;
      const maxPayment = uint96Max;

      // Mint enough tokens
      await mockToken.mint(owner.address, uint96Max);
      await mockToken.approve(await c1erc20.getAddress(), uint96Max + 1n);

      // Pay exactly uint96.max
      await c1erc20.transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, uint96Max, '0x', []);

      const paid = await c1erc20.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(uint96Max);

      // Even 1 token more should revert
      await expect(
        c1erc20.transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, 1n, '0x', [])
      ).to.be.revertedWithCustomError(c1erc20, 'ExceedsMaxPayment');
    });

    it('Should demonstrate that caller controls maxPayment per-call', async function () {
      const l2LinkedId = 1n;

      // First call with maxPayment = 0.5
      await c1erc20.transfer(l2LinkedId, ethers.parseEther('0.5'), MAX_NONCE, recipient.address, ethers.parseEther('0.4'), '0x', []);

      // Second call: same (recipient, l2LinkedId), but caller raises maxPayment
      // cumulative 0.4 + 0.4 = 0.8 > 0.5 (original max), but new max is 1.0
      await c1erc20.transfer(l2LinkedId, ethers.parseEther('1'), MAX_NONCE, recipient.address, ethers.parseEther('0.4'), '0x', []);

      const paid = await c1erc20.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(ethers.parseEther('0.8'));
    });

    it('Should demonstrate that maxNonce is caller-controlled per-call', async function () {
      const l2LinkedId = 1n;

      // First call with maxNonce = 1
      await c1erc20.transfer(l2LinkedId, ethers.parseEther('10'), 1n, recipient.address, ethers.parseEther('0.1'), '0x', []);

      // Second call fails with maxNonce = 1
      await expect(
        c1erc20.transfer(l2LinkedId, ethers.parseEther('10'), 1n, recipient.address, ethers.parseEther('0.1'), '0x', [])
      ).to.be.revertedWithCustomError(c1erc20, 'ExceedsMaxNonce');

      // But raising maxNonce bypasses the limit
      await c1erc20.transfer(l2LinkedId, ethers.parseEther('10'), 10n, recipient.address, ethers.parseEther('0.1'), '0x', []);

      const nonce = await c1erc20.getNonce(l2LinkedId);
      expect(nonce).to.equal(2n);
    });

    it('Should share nonce across different recipients for same l2LinkedId', async function () {
      const l2LinkedId = 1n;

      await expect(
        c1erc20.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('0.1'), '0x', [])
      ).to.emit(c1erc20, 'Transfer').withArgs(l2LinkedId, 0n, recipient.address, ethers.parseEther('0.1'), '0x');

      await expect(
        c1erc20.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, otherAccount.address, ethers.parseEther('0.1'), '0x', [])
      ).to.emit(c1erc20, 'Transfer').withArgs(l2LinkedId, 1n, otherAccount.address, ethers.parseEther('0.1'), '0x');

      expect(await c1erc20.getNonce(l2LinkedId)).to.equal(2n);
    });

    it('Should keep separate paid accounting per (recipient, l2LinkedId)', async function () {
      const l2LinkedId = 1n;

      await c1erc20.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x', []);
      await c1erc20.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, otherAccount.address, ethers.parseEther('2'), '0x', []);

      expect(await c1erc20.paidFor(l2LinkedId, recipient.address)).to.equal(ethers.parseEther('1'));
      expect(await c1erc20.paidFor(l2LinkedId, otherAccount.address)).to.equal(ethers.parseEther('2'));
    });

    it('Should keep separate accounting per l2LinkedId for same recipient', async function () {
      await c1erc20.transfer(1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x', []);
      await c1erc20.transfer(2n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('2'), '0x', []);

      expect(await c1erc20.paidFor(1n, recipient.address)).to.equal(ethers.parseEther('1'));
      expect(await c1erc20.paidFor(2n, recipient.address)).to.equal(ethers.parseEther('2'));
      expect(await c1erc20.getNonce(1n)).to.equal(1n);
      expect(await c1erc20.getNonce(2n)).to.equal(1n);
    });

    it('Should allow multiple callers to pay same (recipient, l2LinkedId) — cumulative', async function () {
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('2');

      // otherAccount needs tokens + approval
      await mockToken.mint(otherAccount.address, ethers.parseEther('100'));
      await mockToken.connect(otherAccount).approve(await c1erc20.getAddress(), ethers.parseEther('100'));

      await c1erc20.connect(owner).transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, ethers.parseEther('0.5'), '0x', []);
      await c1erc20.connect(otherAccount).transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, ethers.parseEther('0.7'), '0x', []);

      expect(await c1erc20.paidFor(l2LinkedId, recipient.address)).to.equal(ethers.parseEther('1.2'));

      // Exceeding cumulative max
      await expect(
        c1erc20.connect(owner).transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, ethers.parseEther('0.9'), '0x', [])
      ).to.be.revertedWithCustomError(c1erc20, 'ExceedsMaxPayment');
    });

    it('Should revert if sender has insufficient token allowance', async function () {
      // Deploy fresh — no approval
      const C1Erc20Bep20 = await ethers.getContractFactory('C1Erc20Bep20');
      const fresh = await C1Erc20Bep20.deploy(await mockToken.getAddress());

      // Owner has tokens but no approval for `fresh` contract
      let reverted = false;
      try {
        const tx = await fresh.transfer(1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x', []);
        await tx.wait();
      } catch {
        reverted = true;
      }
      expect(reverted).to.equal(true, 'Transfer without allowance should revert');
    });

    it('Should revert if sender has insufficient token balance', async function () {
      // otherAccount has 0 tokens
      await mockToken.connect(otherAccount).approve(await c1erc20.getAddress(), ethers.parseEther('100'));

      let reverted = false;
      try {
        const tx = await c1erc20.connect(otherAccount).transfer(1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x', []);
        await tx.wait();
      } catch {
        reverted = true;
      }
      expect(reverted).to.equal(true, 'Transfer without balance should revert');
    });

    it('Should accept zero-amount fee entries (valid but wasteful)', async function () {
      const recipientBefore = await mockToken.balanceOf(recipient.address);

      const tx = await c1erc20.transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, ethers.parseEther('1'), '0x',
        [{ recipient: otherAccount.address, amount: 0n }]
      );
      await tx.wait();

      // Recipient should get all 1 token (0 fee)
      const recipientAfter = await mockToken.balanceOf(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(ethers.parseEther('1'));

      await expect(tx).to.emit(c1erc20, 'FeePaid').withArgs(1n, otherAccount.address, 0n);
    });
  });

  describe('Gas Optimizations', function () {
    it('Should optimize gas usage for different scenarios', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      const tx1 = await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', []);
      const receipt1 = await tx1.wait();
      console.log('Gas used (cold storage):', receipt1?.gasUsed);

      const tx2 = await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', []);
      const receipt2 = await tx2.wait();
      console.log('Gas used (warm storage):', receipt2?.gasUsed);

      const tx3 = await c1erc20.transfer(2n, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', []);
      const receipt3 = await tx3.wait();
      console.log('Gas used (new storage slot):', receipt3?.gasUsed);
    });
  });

  describe('View Functions', function () {
    it('Should return correct paid amount', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      expect(await c1erc20.paidFor(l2LinkedId, recipient.address)).to.equal(0);

      await c1erc20.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, transferAmount, '0x', []);

      expect(await c1erc20.paidFor(l2LinkedId, recipient.address)).to.equal(transferAmount);
    });

    it('Should return correct nonce', async function () {
      const l2LinkedId = 1n;

      expect(await c1erc20.getNonce(l2LinkedId)).to.equal(0);
    });
  });
});
