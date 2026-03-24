import { expect } from 'chai';
import hre from 'hardhat';

describe('C2_ERC20_BEP20', function () {
  let c2erc20: any;
  let mockToken: any;
  let owner: any, recipient: any, otherAccount: any;
  let ethers: any;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, recipient, otherAccount] = await ethers.getSigners();

    // Deploy mock token
    const MockToken = await ethers.getContractFactory('MockERC20');
    mockToken = await MockToken.deploy('Mock Token', 'MTK');

    // Deploy main contract
    const C2Erc20Bep20 = await ethers.getContractFactory('C2Erc20Bep20');
    c2erc20 = await C2Erc20Bep20.deploy(await mockToken.getAddress());

    // Mint and approve tokens
    const mintAmount = ethers.parseEther('1000');
    await mockToken.mint(owner.address, mintAmount);
    await mockToken.approve(await c2erc20.getAddress(), mintAmount);
  });

  describe('Deployment', function () {
    it('Should set the correct token address', async function () {
      expect(await c2erc20.t()).to.equal(await mockToken.getAddress());
    });

    it('Should revert on zero token address', async function () {
      const C2Erc20Bep20 = await ethers.getContractFactory('C2Erc20Bep20');
      await expect(C2Erc20Bep20.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(C2Erc20Bep20, 'E1');
    });
  });

  describe('Transfer', function () {
    it('Should transfer tokens and emit T event', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.5');

      const initialBalance = await mockToken.balanceOf(recipient.address);

      await expect(c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount))
        .to.emit(c2erc20, 'T')
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount);

      expect(await mockToken.balanceOf(recipient.address)).to.equal(initialBalance + transferAmount);
    });

    it('Should track cumulative payments correctly', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.3');

      await c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount);

      let paid = await c2erc20.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount);

      await c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount);

      paid = await c2erc20.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount * 2n);
    });

    it('Should increment nonce correctly', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      await expect(c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount))
        .to.emit(c2erc20, 'T')
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount);

      await expect(c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount))
        .to.emit(c2erc20, 'T')
        .withArgs(l2LinkedId, 1n, recipient.address, transferAmount);

      await expect(c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount))
        .to.emit(c2erc20, 'T')
        .withArgs(l2LinkedId, 2n, recipient.address, transferAmount);

      await expect(c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount))
        .to.emit(c2erc20, 'T')
        .withArgs(l2LinkedId, 3n, recipient.address, transferAmount);

      await expect(c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount))
        .to.emit(c2erc20, 'T')
        .withArgs(l2LinkedId, 4n, recipient.address, transferAmount);
    });

    it('Should revert on payment below minimum', async function () {
      await expect(c2erc20.transfer(1n, ethers.parseEther('1'), recipient.address, 0)).to.be.revertedWithCustomError(
        c2erc20,
        'E2'
      );
    });

    it('Should revert when exceeding maxAllowedPayment', async function () {
      const maxAllowedPayment = ethers.parseEther('0.5');
      const transferAmount = ethers.parseEther('0.3');

      await c2erc20.transfer(1n, maxAllowedPayment, recipient.address, transferAmount);

      await expect(
        c2erc20.transfer(1n, maxAllowedPayment, recipient.address, transferAmount)
      ).to.be.revertedWithCustomError(c2erc20, 'E3');
    });

    // it("Should clear storage when max payment is reached", async function () {
    //   const { c2erc20, recipient } = await loadFixture(deployFixture);
    //   const l2LinkedId = 1n;
    //   const maxAllowedPayment = ethers.parseEther("0.5");

    //   await c2erc20.transfer(
    //     l2LinkedId,
    //     maxAllowedPayment,
    //     recipient.address,
    //     maxAllowedPayment
    //   );

    //   const paid = await c2erc20.paidFor(l2LinkedId, recipient.address);
    //   expect(paid).to.equal(0);
    // });

    it('Should handle multiple l2LinkedIds separately', async function () {
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.3');

      await c2erc20.transfer(1n, maxAllowedPayment, recipient.address, transferAmount);
      await c2erc20.transfer(2n, maxAllowedPayment, recipient.address, transferAmount);

      expect(await c2erc20.paidFor(1n, recipient.address)).to.equal(transferAmount);
      expect(await c2erc20.paidFor(2n, recipient.address)).to.equal(transferAmount);
    });
  });

  describe('Gas Usage', function () {
    it('Should report gas usage for different scenarios', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      const tx1 = await c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount);
      const receipt1 = await tx1.wait();
      console.log('Gas used (cold storage):', receipt1?.gasUsed);

      const tx2 = await c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount);
      const receipt2 = await tx2.wait();
      console.log('Gas used (warm storage):', receipt2?.gasUsed);

      const tx3 = await c2erc20.transfer(2n, maxAllowedPayment, recipient.address, transferAmount);
      const receipt3 = await tx3.wait();
      console.log('Gas used (new storage slot):', receipt3?.gasUsed);

      const tx4 = await c2erc20.transfer(3n, transferAmount, recipient.address, transferAmount);
      const receipt4 = await tx4.wait();
      console.log('Gas used (storage cleanup):', receipt4?.gasUsed);
    });
  });

  describe('View Functions', function () {
    it('Should return correct paid amount', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.3');

      await c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount);
      expect(await c2erc20.paidFor(l2LinkedId, recipient.address)).to.equal(transferAmount);
    });

    it('Should return correct nonce', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.3');

      await c2erc20.transfer(l2LinkedId, maxAllowedPayment, recipient.address, transferAmount);
      expect(await c2erc20.getNonce(l2LinkedId, recipient.address)).to.equal(1);
    });
  });
});
