import { expect } from 'chai';
import hre from 'hardhat';

describe('PactSwapToken', function () {
  let token: any;
  let owner: any, user1: any, user2: any, spender: any;
  let ethers: any;

  const TOKEN_NAME = 'PACT SWAP Token';
  const TOKEN_SYMBOL = 'PS';
  const INITIAL_SUPPLY = '1000000'; // Will be parsed with ethers

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, user1, user2, spender] = await ethers.getSigners();

    const PactSwapToken = await ethers.getContractFactory('PactSwapToken');
    token = await PactSwapToken.deploy(TOKEN_NAME, TOKEN_SYMBOL, ethers.parseEther(INITIAL_SUPPLY));
  });

  describe('Deployment', function () {
    it('Should set the correct name and symbol', async function () {
      expect(await token.name()).to.equal(TOKEN_NAME);
      expect(await token.symbol()).to.equal(TOKEN_SYMBOL);
    });

    it('Should set the correct initial supply', async function () {
      const expectedSupply = ethers.parseEther(INITIAL_SUPPLY);
      expect(await token.totalSupply()).to.equal(expectedSupply);
      expect(await token.balanceOf(owner.address)).to.equal(expectedSupply);
    });

    it('Should set the correct decimals', async function () {
      expect(await token.decimals()).to.equal(18);
    });
  });

  describe('ERC20 Basic Functionality', function () {
    it('Should transfer tokens correctly', async function () {
      const transferAmount = ethers.parseEther('1000');

      await expect(token.transfer(user1.address, transferAmount))
        .to.emit(token, 'Transfer')
        .withArgs(owner.address, user1.address, transferAmount);

      expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
      expect(await token.balanceOf(owner.address)).to.equal(ethers.parseEther('999000'));
    });

    it('Should approve and transferFrom correctly', async function () {
      const approveAmount = ethers.parseEther('500');
      const transferAmount = ethers.parseEther('200');

      // Approve spender
      await expect(token.approve(spender.address, approveAmount))
        .to.emit(token, 'Approval')
        .withArgs(owner.address, spender.address, approveAmount);

      expect(await token.allowance(owner.address, spender.address)).to.equal(approveAmount);

      // Transfer from owner to user1 via spender
      await expect(token.connect(spender).transferFrom(owner.address, user1.address, transferAmount))
        .to.emit(token, 'Transfer')
        .withArgs(owner.address, user1.address, transferAmount);

      expect(await token.balanceOf(user1.address)).to.equal(transferAmount);
      expect(await token.allowance(owner.address, spender.address)).to.equal(approveAmount - transferAmount);
    });

    it('Should revert on insufficient balance', async function () {
      const transferAmount = ethers.parseEther('1000');

      await expect(token.connect(user1).transfer(user2.address, transferAmount)).to.be.revertedWithCustomError(
        token,
        'ERC20InsufficientBalance'
      );
    });

    it('Should revert on insufficient allowance', async function () {
      const transferAmount = ethers.parseEther('1000');

      await expect(
        token.connect(spender).transferFrom(owner.address, user1.address, transferAmount)
      ).to.be.revertedWithCustomError(token, 'ERC20InsufficientAllowance');
    });
  });

  describe('Burn Functionality', function () {
    it('Should burn tokens correctly', async function () {
      const burnAmount = ethers.parseEther('1000');
      const initialBalance = await token.balanceOf(owner.address);
      const initialSupply = await token.totalSupply();

      await expect(token.burn(burnAmount))
        .to.emit(token, 'Transfer')
        .withArgs(owner.address, ethers.ZeroAddress, burnAmount);

      expect(await token.balanceOf(owner.address)).to.equal(initialBalance - burnAmount);
      expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);
    });

    it('Should burnFrom correctly', async function () {
      const approveAmount = ethers.parseEther('1000');
      const burnAmount = ethers.parseEther('500');

      // Transfer tokens to user1
      await token.transfer(user1.address, approveAmount);

      // User1 approves spender
      await token.connect(user1).approve(spender.address, approveAmount);

      // Spender burns tokens from user1
      await expect(token.connect(spender).burnFrom(user1.address, burnAmount))
        .to.emit(token, 'Transfer')
        .withArgs(user1.address, ethers.ZeroAddress, burnAmount);

      expect(await token.balanceOf(user1.address)).to.equal(approveAmount - burnAmount);
      expect(await token.allowance(user1.address, spender.address)).to.equal(approveAmount - burnAmount);
    });

    it('Should revert burn on insufficient balance', async function () {
      const burnAmount = ethers.parseEther('1000');

      await expect(token.connect(user1).burn(burnAmount)).to.be.revertedWithCustomError(
        token,
        'ERC20InsufficientBalance'
      );
    });

    it('Should revert burnFrom on insufficient allowance', async function () {
      const transferAmount = ethers.parseEther('1000');
      const burnAmount = ethers.parseEther('500');

      // Transfer tokens to user1
      await token.transfer(user1.address, transferAmount);

      // Try to burn without approval
      await expect(token.connect(spender).burnFrom(user1.address, burnAmount)).to.be.revertedWithCustomError(
        token,
        'ERC20InsufficientAllowance'
      );
    });

    it('Should handle multiple burns correctly', async function () {
      const firstBurn = ethers.parseEther('1000');
      const secondBurn = ethers.parseEther('500');
      const initialSupply = await token.totalSupply();

      await token.burn(firstBurn);
      await token.burn(secondBurn);

      expect(await token.totalSupply()).to.equal(initialSupply - firstBurn - secondBurn);
    });
  });

  describe('ERC20Permit Functionality', function () {
    it('Should permit and transferFrom correctly', async function () {
      const value = ethers.parseEther('1000');
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      // Get nonce
      const nonce = await token.nonces(owner.address);

      // Create permit signature
      const domain = {
        name: await token.name(),
        version: '1',
        chainId: await ethers.provider.getNetwork().then((n: any) => n.chainId),
        verifyingContract: await token.getAddress(),
      };

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };

      const message = {
        owner: owner.address,
        spender: spender.address,
        value: value,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute permit
      await expect(token.connect(spender).permit(owner.address, spender.address, value, deadline, v, r, s))
        .to.emit(token, 'Approval')
        .withArgs(owner.address, spender.address, value);

      expect(await token.allowance(owner.address, spender.address)).to.equal(value);

      // Now transferFrom should work
      await expect(token.connect(spender).transferFrom(owner.address, user1.address, value))
        .to.emit(token, 'Transfer')
        .withArgs(owner.address, user1.address, value);
    });

    it('Should revert permit with expired deadline', async function () {
      const value = ethers.parseEther('1000');
      const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      const nonce = await token.nonces(owner.address);

      const domain = {
        name: await token.name(),
        version: '1',
        chainId: await ethers.provider.getNetwork().then((n: any) => n.chainId),
        verifyingContract: await token.getAddress(),
      };

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };

      const message = {
        owner: owner.address,
        spender: spender.address,
        value: value,
        nonce: nonce,
        deadline: deadline,
      };

      const signature = await owner.signTypedData(domain, types, message);
      const { v, r, s } = ethers.Signature.from(signature);

      await expect(
        token.connect(spender).permit(owner.address, spender.address, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(token, 'ERC2612ExpiredSignature');
    });

    it('Should revert permit with invalid signature', async function () {
      const value = ethers.parseEther('1000');
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        token
          .connect(spender)
          .permit(owner.address, spender.address, value, deadline, 0, ethers.ZeroHash, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(token, 'ECDSAInvalidSignature');
    });
  });

  describe('Integration Tests', function () {
    it('Should handle complex workflow: transfer, approve, burn, permit', async function () {
      // Transfer tokens to user1
      const transferAmount = ethers.parseEther('5000');
      await token.transfer(user1.address, transferAmount);
      expect(await token.balanceOf(user1.address)).to.equal(transferAmount);

      // User1 burns some tokens
      const burnAmount = ethers.parseEther('1000');
      await token.connect(user1).burn(burnAmount);
      expect(await token.balanceOf(user1.address)).to.equal(transferAmount - burnAmount);

      // User1 approves spender
      const approveAmount = ethers.parseEther('2000');
      await token.connect(user1).approve(spender.address, approveAmount);

      // Spender transfers from user1 to user2
      const transferFromAmount = ethers.parseEther('1000');
      await token.connect(spender).transferFrom(user1.address, user2.address, transferFromAmount);
      expect(await token.balanceOf(user2.address)).to.equal(transferFromAmount);

      // Spender burns remaining approved tokens
      const remainingApproval = approveAmount - transferFromAmount;
      await token.connect(spender).burnFrom(user1.address, remainingApproval);
      expect(await token.balanceOf(user1.address)).to.equal(
        transferAmount - burnAmount - transferFromAmount - remainingApproval
      );
    });

    it('Should maintain correct total supply through all operations', async function () {
      const initialSupply = await token.totalSupply();

      const transferAmount = ethers.parseEther('10000');
      const burnAmount = ethers.parseEther('5000');

      // Transfer tokens
      await token.transfer(user1.address, transferAmount);
      expect(await token.totalSupply()).to.equal(initialSupply);

      // Burn tokens
      await token.burn(burnAmount);
      expect(await token.totalSupply()).to.equal(initialSupply - burnAmount);

      // User1 burns some tokens
      await token.connect(user1).burn(ethers.parseEther('1000'));
      expect(await token.totalSupply()).to.equal(initialSupply - burnAmount - ethers.parseEther('1000'));
    });
  });
});
