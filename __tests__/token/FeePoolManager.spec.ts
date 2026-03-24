import { expect } from 'chai';
import hre from 'hardhat';
import { ethers as defaultEthers } from 'ethers';

describe('FeePoolManager', async function () {
  console.log('FeePoolManager');
  let feePoolManager: any;
  let token: any;
  let owner: any, admin: any, user1: any, user2: any;

  const TOKEN_NAME = 'PACT SWAP Token';
  const TOKEN_SYMBOL = 'PS';
  const INITIAL_SUPPLY = defaultEthers.parseEther('1000000000000000000000000');
  const INITIAL_FEE_ADDRESS = '0x' + 'a'.repeat(64); // 32 bytes
  const COINWEB_RECEIVER = '0x' + 'b'.repeat(64); // 32 bytes
  let ethers: any;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, admin, user1, user2] = await ethers.getSigners();

    // Deploy PactSwapToken
    const PactSwapToken = await ethers.getContractFactory('PactSwapToken');
    token = await PactSwapToken.deploy(TOKEN_NAME, TOKEN_SYMBOL, INITIAL_SUPPLY);

    // Deploy FeePoolManager
    const FeePoolManager = await ethers.getContractFactory('FeePoolManager');
    feePoolManager = await FeePoolManager.deploy(token, INITIAL_FEE_ADDRESS);
  });

  describe('Deployment', async function () {
    it('Should deploy with correct parameters', async function () {
      expect(await feePoolManager.pactswapToken()).to.equal(await token.getAddress());
      expect(await feePoolManager.COINWEB_FEE_ADDRESS()).to.equal(INITIAL_FEE_ADDRESS);
      expect(await feePoolManager.admin()).to.equal(owner.address);
    });

    it('Should revert if token address is zero', async function () {
      const FeePoolManager = await ethers.getContractFactory('FeePoolManager');
      const testFeeAddress = '0x' + 'a'.repeat(64);

      await expect(FeePoolManager.deploy(defaultEthers.ZeroAddress, testFeeAddress)).to.be.revertedWithCustomError(
        FeePoolManager,
        'ZeroAddress'
      );
    });
  });

  describe('burnWithRedeem', async function () {
    const burnAmount = defaultEthers.parseEther('1000');
    const receiverAddress = 'EcdsaAddress:0x' + 'b'.repeat(64);

    it('Should burn tokens and emit correct events', async function () {
      // Transfer tokens to user1 for testing (owner has all tokens initially)
      await token.connect(owner).transfer(user1.address, burnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), burnAmount);

      const totalSupplyBefore = await token.totalSupply();
      const userBalanceBefore = await token.balanceOf(user1.address);

      await expect(feePoolManager.connect(user1).burnWithRedeem(burnAmount, receiverAddress))
        .to.emit(feePoolManager, 'BurnWithRedeem')
        .withArgs(user1.address, receiverAddress, burnAmount, totalSupplyBefore)
        .and.to.emit(feePoolManager, 'SendEventToCoinweb')
        .withArgs(0, defaultEthers.ZeroHash, receiverAddress, burnAmount, totalSupplyBefore);

      expect(await token.balanceOf(user1.address)).to.equal(userBalanceBefore - burnAmount);
      expect(await token.totalSupply()).to.equal(totalSupplyBefore - burnAmount);
    });

    it('Should emit correct SendToCoinwebEventType.Burn', async function () {
      await token.connect(owner).transfer(user1.address, burnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), burnAmount);

      const totalSupplyBefore = await token.totalSupply();

      const tx = await feePoolManager.connect(user1).burnWithRedeem(burnAmount, receiverAddress);
      const receipt = await tx.wait();

      const sendEventToCoinwebEvent = receipt?.logs.find(
        (log: any) => log.topics[0] === feePoolManager.interface.getEvent('SendEventToCoinweb').topicHash
      );

      expect(sendEventToCoinwebEvent).to.not.be.undefined;
      const decodedEvent = feePoolManager.interface.parseLog(sendEventToCoinwebEvent!);
      expect(decodedEvent?.args.eventType).to.equal(0); // SendToCoinwebEventType.Burn
    });

    it('Should handle multiple burns correctly', async function () {
      const firstBurnAmount = defaultEthers.parseEther('500');
      const secondBurnAmount = defaultEthers.parseEther('300');

      await token.connect(owner).transfer(user1.address, firstBurnAmount + secondBurnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), firstBurnAmount + secondBurnAmount);

      // First burn
      await feePoolManager.connect(user1).burnWithRedeem(firstBurnAmount, receiverAddress);
      const balanceAfterFirst = await token.balanceOf(user1.address);

      // Second burn
      await feePoolManager.connect(user1).burnWithRedeem(secondBurnAmount, receiverAddress);
      const balanceAfterSecond = await token.balanceOf(user1.address);

      expect(balanceAfterSecond).to.equal(balanceAfterFirst - secondBurnAmount);
    });

    it('Should work with different receiver addresses', async function () {
      const testAmount = defaultEthers.parseEther('100');
      await token.connect(owner).transfer(user1.address, testAmount * 2n);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), testAmount * 2n);

      const receiver1 = 'EcdsaAddress:0x' + '1'.repeat(64);
      const receiver2 = 'EcdsaAddress:0x' + '2'.repeat(64);

      await expect(feePoolManager.connect(user1).burnWithRedeem(testAmount, receiver1))
        .to.emit(feePoolManager, 'BurnWithRedeem')
        .withArgs(user1.address, receiver1, testAmount, await token.totalSupply());

      await expect(feePoolManager.connect(user1).burnWithRedeem(testAmount, receiver2))
        .to.emit(feePoolManager, 'BurnWithRedeem')
        .withArgs(user1.address, receiver2, testAmount, await token.totalSupply());
    });

    it('Should revert if user has insufficient balance', async function () {
      const largeAmount = defaultEthers.parseEther('10000000');
      await token.connect(user1).approve(await feePoolManager.getAddress(), largeAmount);

      await expect(
        feePoolManager.connect(user1).burnWithRedeem(largeAmount, receiverAddress)
      ).to.be.revertedWithCustomError(token, 'ERC20InsufficientBalance');
    });
  });

  describe('updateFeeAddress', async function () {
    const newFeeAddress = '0x' + 'c'.repeat(64);

    it('Should update fee address and emit events', async function () {
      const oldFeeAddress = await feePoolManager.COINWEB_FEE_ADDRESS();

      await expect(feePoolManager.updateFeeAddress(newFeeAddress))
        .to.emit(feePoolManager, 'CoinwebFeeAddressUpdated')
        .withArgs(newFeeAddress, oldFeeAddress)
        .and.to.emit(feePoolManager, 'SendEventToCoinweb')
        .withArgs(1, newFeeAddress, '', 0, 0);

      expect(await feePoolManager.COINWEB_FEE_ADDRESS()).to.equal(newFeeAddress);
    });

    it('Should emit correct SendToCoinwebEventType.UpdateFeeAddress', async function () {
      const tx = await feePoolManager.updateFeeAddress(newFeeAddress);
      const receipt = await tx.wait();

      const sendEventToCoinwebEvent = receipt?.logs.find(
        (log: any) => log.topics[0] === feePoolManager.interface.getEvent('SendEventToCoinweb').topicHash
      );

      expect(sendEventToCoinwebEvent).to.not.be.undefined;
      const decodedEvent = feePoolManager.interface.parseLog(sendEventToCoinwebEvent!);
      expect(decodedEvent?.args.eventType).to.equal(1); // SendToCoinwebEventType.UpdateFeeAddress
    });

    it('Should allow multiple fee address updates', async function () {
      const firstNewAddress = '0x' + '1'.repeat(64);
      const secondNewAddress = '0x' + '2'.repeat(64);

      await feePoolManager.updateFeeAddress(firstNewAddress);
      expect(await feePoolManager.COINWEB_FEE_ADDRESS()).to.equal(firstNewAddress);

      await feePoolManager.updateFeeAddress(secondNewAddress);
      expect(await feePoolManager.COINWEB_FEE_ADDRESS()).to.equal(secondNewAddress);
    });

    it('Should revert if called by non-admin', async function () {
      await expect(feePoolManager.connect(user1).updateFeeAddress(newFeeAddress)).to.be.revertedWithCustomError(
        feePoolManager,
        'NotAdmin'
      );
    });
  });

  describe('updateAdmin', async function () {
    it('Should update admin and emit event', async function () {
      await expect(feePoolManager.updateAdmin(user1.address))
        .to.emit(feePoolManager, 'AdminUpdated')
        .withArgs(user1.address);

      expect(await feePoolManager.admin()).to.equal(user1.address);
    });

    it('Should allow new admin to call admin functions', async function () {
      // Update admin to user1
      await feePoolManager.updateAdmin(user1.address);

      // New admin should be able to update fee address
      const newFeeAddress = '0x' + 'd'.repeat(64);
      await expect(feePoolManager.connect(user1).updateFeeAddress(newFeeAddress)).to.emit(
        feePoolManager,
        'CoinwebFeeAddressUpdated'
      );

      expect(await feePoolManager.COINWEB_FEE_ADDRESS()).to.equal(newFeeAddress);
    });

    it('Should allow new admin to transfer admin to another address', async function () {
      // Update admin to user1
      await feePoolManager.updateAdmin(user1.address);

      // user1 should be able to transfer admin to user2
      await expect(feePoolManager.connect(user1).updateAdmin(user2.address))
        .to.emit(feePoolManager, 'AdminUpdated')
        .withArgs(user2.address);

      expect(await feePoolManager.admin()).to.equal(user2.address);
    });

    it('Should revert if called by non-admin', async function () {
      await expect(feePoolManager.connect(user1).updateAdmin(user2.address)).to.be.revertedWithCustomError(
        feePoolManager,
        'NotAdmin'
      );
    });
  });

  describe('Access Control', async function () {
    it('Should have correct initial admin', async function () {
      expect(await feePoolManager.admin()).to.equal(owner.address);
    });

    it('Should allow only admin to call admin functions', async function () {
      // Test updateFeeAddress
      await expect(feePoolManager.connect(user1).updateFeeAddress('0x' + '1'.repeat(64))).to.be.revertedWithCustomError(
        feePoolManager,
        'NotAdmin'
      );

      // Test updateAdmin
      await expect(feePoolManager.connect(user1).updateAdmin(user1.address)).to.be.revertedWithCustomError(
        feePoolManager,
        'NotAdmin'
      );
    });

    it('Should allow anyone to call burnWithRedeem', async function () {
      const burnAmount = defaultEthers.parseEther('100');
      const receiverBytes = 'EcdsaAddress:0x' + 'b'.repeat(64);

      // Transfer tokens to user1
      await token.connect(owner).transfer(user1.address, burnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), burnAmount);

      // user1 should be able to burn tokens
      await expect(feePoolManager.connect(user1).burnWithRedeem(burnAmount, receiverBytes)).to.emit(
        feePoolManager,
        'BurnWithRedeem'
      );
    });
  });

  describe('Events', async function () {
    it('Should emit BurnWithRedeem with correct parameters', async function () {
      const burnAmount = defaultEthers.parseEther('100');
      const receiverBytes = 'EcdsaAddress:0x' + 'b'.repeat(64);
      const totalSupplyBefore = await token.totalSupply();

      // Transfer tokens to user1
      await token.connect(owner).transfer(user1.address, burnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), burnAmount);

      await expect(feePoolManager.connect(user1).burnWithRedeem(burnAmount, receiverBytes))
        .to.emit(feePoolManager, 'BurnWithRedeem')
        .withArgs(user1.address, receiverBytes, burnAmount, totalSupplyBefore);
    });

    it('Should emit CoinwebFeeAddressUpdated with correct parameters', async function () {
      const newFeeAddress = '0x' + 'e'.repeat(64);
      const oldFeeAddress = await feePoolManager.COINWEB_FEE_ADDRESS();

      await expect(feePoolManager.updateFeeAddress(newFeeAddress))
        .to.emit(feePoolManager, 'CoinwebFeeAddressUpdated')
        .withArgs(newFeeAddress, oldFeeAddress);
    });

    it('Should emit AdminUpdated with correct parameters', async function () {
      await expect(feePoolManager.updateAdmin(user1.address))
        .to.emit(feePoolManager, 'AdminUpdated')
        .withArgs(user1.address);
    });

    it('Should emit SendEventToCoinweb for burn operations', async function () {
      const burnAmount = defaultEthers.parseEther('100');
      const receiverBytes = 'EcdsaAddress:0x' + 'b'.repeat(64);
      const totalSupplyBefore = await token.totalSupply();

      // Transfer tokens to user1
      await token.connect(owner).transfer(user1.address, burnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), burnAmount);

      await expect(feePoolManager.connect(user1).burnWithRedeem(burnAmount, receiverBytes))
        .to.emit(feePoolManager, 'SendEventToCoinweb')
        .withArgs(0, defaultEthers.ZeroHash, receiverBytes, burnAmount, totalSupplyBefore);
    });

    it('Should emit SendEventToCoinweb for fee address updates', async function () {
      const newFeeAddress = '0x' + 'f'.repeat(64);

      await expect(feePoolManager.updateFeeAddress(newFeeAddress))
        .to.emit(feePoolManager, 'SendEventToCoinweb')
        .withArgs(1, newFeeAddress, '', 0, 0);
    });
  });

  describe('Error Handling', async function () {
    it('Should revert with ZeroAddress when token is zero address', async function () {
      const FeePoolManager = await ethers.getContractFactory('FeePoolManager');
      const testFeeAddress = '0x' + 'a'.repeat(64);

      await expect(FeePoolManager.deploy(defaultEthers.ZeroAddress, testFeeAddress)).to.be.revertedWithCustomError(
        FeePoolManager,
        'ZeroAddress'
      );
    });

    it('Should revert with NotAdmin when non-admin calls admin functions', async function () {
      const newFeeAddress = '0x' + '1'.repeat(64);

      await expect(feePoolManager.connect(user1).updateFeeAddress(newFeeAddress)).to.be.revertedWithCustomError(
        feePoolManager,
        'NotAdmin'
      );

      await expect(feePoolManager.connect(user1).updateAdmin(user1.address)).to.be.revertedWithCustomError(
        feePoolManager,
        'NotAdmin'
      );
    });
  });

  describe('Integration Tests', async function () {
    it('Should handle complete workflow: admin updates, user burns tokens', async function () {
      // Admin updates fee address
      const newFeeAddress = '0x' + '1'.repeat(64);
      await feePoolManager.updateFeeAddress(newFeeAddress);
      expect(await feePoolManager.COINWEB_FEE_ADDRESS()).to.equal(newFeeAddress);

      // Admin transfers admin to user1
      await feePoolManager.updateAdmin(user1.address);
      expect(await feePoolManager.admin()).to.equal(user1.address);

      // user1 burns tokens
      const burnAmount = defaultEthers.parseEther('500');
      const receiverBytes = 'EcdsaAddress:0x' + 'b'.repeat(64);

      await token.connect(owner).transfer(user1.address, burnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), burnAmount);

      await expect(feePoolManager.connect(user1).burnWithRedeem(burnAmount, receiverBytes)).to.emit(
        feePoolManager,
        'BurnWithRedeem'
      );
    });

    it('Should maintain state consistency across multiple operations', async function () {
      const initialFeeAddress = await feePoolManager.COINWEB_FEE_ADDRESS();
      const initialAdmin = await feePoolManager.admin();

      // Update fee address
      const newFeeAddress = '0x' + '2'.repeat(64);
      await feePoolManager.updateFeeAddress(newFeeAddress);

      // Update admin
      await feePoolManager.updateAdmin(user1.address);

      // Verify state
      expect(await feePoolManager.COINWEB_FEE_ADDRESS()).to.equal(newFeeAddress);
      expect(await feePoolManager.admin()).to.equal(user1.address);
      expect(await feePoolManager.pactswapToken()).to.equal(await token.getAddress());
    });

    it('Should work with PactSwapToken burn functionality', async function () {
      const burnAmount = defaultEthers.parseEther('1000');
      const receiverBytes = 'EcdsaAddress:0x' + 'b'.repeat(64);

      // Transfer tokens to user1
      await token.connect(owner).transfer(user1.address, burnAmount);

      // Approve FeePoolManager to burn tokens from user1
      await token.connect(user1).approve(await feePoolManager.getAddress(), burnAmount);

      // Burn through FeePoolManager
      const totalSupplyBefore = await token.totalSupply();
      await feePoolManager.connect(user1).burnWithRedeem(burnAmount, receiverBytes);

      // Verify token was burned
      expect(await token.balanceOf(user1.address)).to.equal(0);
      expect(await token.totalSupply()).to.equal(totalSupplyBefore - burnAmount);
    });
  });
});
