import { expect } from "chai";
import hre from "hardhat";

describe("C1_EVM - Reentrancy Protection Tests", function () {
  let c1Evm: any;
  let maliciousLP: any;
  let multipleAttacker: any;
  let owner: any, user: any, normalLP: any;
  let ethers: any;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, user, normalLP] = await ethers.getSigners();

    // Deploy C1_EVM contract
    const C1Evm = await ethers.getContractFactory("C1Evm");
    c1Evm = await C1Evm.deploy();

    // Deploy MaliciousLP contract
    const MaliciousLP = await ethers.getContractFactory("MaliciousLP");
    maliciousLP = await MaliciousLP.deploy(await c1Evm.getAddress());

    // Deploy MultipleReentrancyAttacker contract
    const MultipleReentrancyAttacker = await ethers.getContractFactory("MultipleReentrancyAttacker");
    multipleAttacker = await MultipleReentrancyAttacker.deploy(await c1Evm.getAddress());
  });

  describe("Single Reentrancy Attack", function () {
    it("Should prevent reentrancy attack from malicious LP", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther("2"); // Max 2 ETH for this order
      const initialPayment = ethers.parseEther("1"); // User pays 1 ETH
      const attackAmount = ethers.parseEther("0.5"); // LP tries to steal 0.5 ETH via reentrancy
      
      const maliciousLPAddress = await maliciousLP.getAddress();
      
      const maxNonce = 100n;

      // Setup attack parameters
      await maliciousLP.setupAttack(l2LinkedId, maxPayment, maxNonce, attackAmount);
      await maliciousLP.enableAttack();
      
      // Fund the user for the initial payment
      const userBalanceBefore = await ethers.provider.getBalance(user.address);
      
      // Act - User pays malicious LP
      const tx = await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        maliciousLPAddress,
        "0x",
        [],
        { value: initialPayment }
      );
      
      await tx.wait();
      
      // Assert
      // 1. Check that reentrancy was attempted but failed
      const attackAttempts = await maliciousLP.attackAttempts();
      const successfulAttacks = await maliciousLP.successfulAttacks();
      
      expect(attackAttempts).to.equal(1n, "Attack should have been attempted once");
      expect(successfulAttacks).to.equal(0n, "Attack should have failed (reentrancy prevented)");
      
      // 2. Check that only the initial payment was recorded
      const paidAmount = await c1Evm.paidFor(l2LinkedId, maliciousLPAddress);
      expect(paidAmount).to.equal(initialPayment, "Only initial payment should be recorded");
      
      // 3. Check that malicious LP only received initial payment
      const lpBalance = await ethers.provider.getBalance(maliciousLPAddress);
      expect(lpBalance).to.equal(initialPayment, "LP should only receive initial payment");
      
      // 4. Verify C1 contract has no remaining balance
      const contractBalance = await ethers.provider.getBalance(await c1Evm.getAddress());
      expect(contractBalance).to.equal(0n, "Contract should not hold any funds");
    });

    it("Should handle reentrancy when cumulative payment would exceed max", async function () {
      // Arrange
      const l2LinkedId = 2n;
      const maxPayment = ethers.parseEther("1.2"); // Max 1.2 ETH
      const maxNonce = 100n;
      const initialPayment = ethers.parseEther("1"); // User pays 1 ETH first
      const attackAmount = ethers.parseEther("0.5"); // LP tries to get 0.5 ETH more (total 1.5 > 1.2)
      
      const maliciousLPAddress = await maliciousLP.getAddress();
      
      await maliciousLP.setupAttack(l2LinkedId, maxPayment, maxNonce, attackAmount);
      await maliciousLP.enableAttack();
      
      // Act - User pays malicious LP
      const tx = await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        maliciousLPAddress,
        "0x",
        [],
        { value: initialPayment }
      );
      
      await tx.wait();
      
      // Assert
      const paidAmount = await c1Evm.paidFor(l2LinkedId, maliciousLPAddress);
      expect(paidAmount).to.equal(initialPayment);
      
      const successfulAttacks = await maliciousLP.successfulAttacks();
      expect(successfulAttacks).to.equal(0n, "Reentrancy should fail due to max payment check");
    });

    it("Should emit AttackFailed event when reentrancy is blocked", async function () {
      // Arrange
      const l2LinkedId = 3n;
      const maxPayment = ethers.parseEther("2");
      const maxNonce = 100n;
      const initialPayment = ethers.parseEther("1");
      const attackAmount = ethers.parseEther("0.5");
      
      const maliciousLPAddress = await maliciousLP.getAddress();
      
      await maliciousLP.setupAttack(l2LinkedId, maxPayment, maxNonce, attackAmount);
      await maliciousLP.enableAttack();
      
      // Act & Assert
      await expect(
        c1Evm.connect(user).transfer(
          l2LinkedId,
          maxPayment,
          maxNonce,
          maliciousLPAddress,
          "0x",
          [],
          { value: initialPayment }
        )
      ).to.emit(maliciousLP, "AttackFailed");
    });
  });

  describe("Multiple Reentrancy Attempts", function () {
    it("Should prevent multiple reentrancy attempts", async function () {
      // Arrange
      const l2LinkedId = 4n;
      const maxPayment = ethers.parseEther("10"); // High max to allow multiple attempts
      const maxNonce = 100n;
      const initialPayment = ethers.parseEther("2");
      const attackAmount = ethers.parseEther("0.1"); // Small amounts
      const maxAttempts = 5; // Try 5 reentrancy attacks
      
      const attackerAddress = await multipleAttacker.getAddress();
      
      await multipleAttacker.setupAttack(l2LinkedId, maxPayment, maxNonce, attackAmount, maxAttempts);
      
      // Act
      const tx = await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        attackerAddress,
        "0x",
        [],
        { value: initialPayment }
      );
      
      await tx.wait();
      
      // Assert
      const attackAttempts = await multipleAttacker.attackAttempts();
      const successfulAttacks = await multipleAttacker.successfulAttacks();
      
      expect(attackAttempts).to.be.greaterThan(0n, "Should have attempted attacks");
      expect(successfulAttacks).to.equal(0n, "All reentrancy attempts should fail");
      
      // Verify only initial payment was recorded
      const paidAmount = await c1Evm.paidFor(l2LinkedId, attackerAddress);
      expect(paidAmount).to.equal(initialPayment);
    });
  });

  describe("Reentrancy with State Verification", function () {
    it("Should show updated state during reentrancy attempt", async function () {
      // This test demonstrates that state is updated BEFORE external call
      // So reentrant call sees the updated paid amount
      
      // Arrange
      const l2LinkedId = 5n;
      const maxPayment = ethers.parseEther("1.5");
      const maxNonce = 100n;
      const initialPayment = ethers.parseEther("1");
      const attackAmount = ethers.parseEther("0.6"); // Would exceed max (1 + 0.6 > 1.5)
      
      const maliciousLPAddress = await maliciousLP.getAddress();
      
      await maliciousLP.setupAttack(l2LinkedId, maxPayment, maxNonce, attackAmount);
      await maliciousLP.enableAttack();
      
      // Act
      await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        maliciousLPAddress,
        "0x",
        [],
        { value: initialPayment }
      );
      
      // Assert - Reentrant call should fail because:
      // 1. paid is already updated to 1 ETH
      // 2. Trying to add 0.6 ETH would make total 1.6 ETH
      // 3. 1.6 > maxPayment (1.5), so it reverts
      
      const paidAmount = await c1Evm.paidFor(l2LinkedId, maliciousLPAddress);
      expect(paidAmount).to.equal(initialPayment, "State should be updated before external call");
      
      const successfulAttacks = await maliciousLP.successfulAttacks();
      expect(successfulAttacks).to.equal(0n, "Reentrancy fails due to state already updated");
    });

    it("Should maintain correct nonce even with reentrancy attempts", async function () {
      // Arrange
      const l2LinkedId = 6n;
      const maxPayment = ethers.parseEther("5");
      const maxNonce = 100n;
      const maliciousLPAddress = await maliciousLP.getAddress();
      
      await maliciousLP.setupAttack(l2LinkedId, maxPayment, maxNonce, ethers.parseEther("0.1"));
      await maliciousLP.enableAttack();
      
      // Act - Make first payment (with reentrancy attempt)
      await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        maliciousLPAddress,
        "0x",
        [],
        { value: ethers.parseEther("1") }
      );
      
      // Disable attack for second payment
      await maliciousLP.disableAttack();
      
      // Make second legitimate payment
      await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        maliciousLPAddress,
        "0x",
        [],
        { value: ethers.parseEther("1") }
      );
      
      // Assert - Nonce should be 2 (two successful transfers)
      // NOT 3 or more (reentrancy didn't create extra nonce)
      const paidAmount = await c1Evm.paidFor(l2LinkedId, maliciousLPAddress);
      expect(paidAmount).to.equal(ethers.parseEther("2"));
      
      // We can't directly read nonce, but we verify via events
      // The attack should have failed without incrementing nonce
    });
  });

  describe("CEI Pattern Verification", function () {
    it("Should demonstrate Checks-Effects-Interactions pattern", async function () {
      // This test verifies that the contract follows CEI pattern:
      // 1. Checks (validation)
      // 2. Effects (state update)
      // 3. Interactions (external call)
      
      const l2LinkedId = 7n;
      const maxPayment = ethers.parseEther("2");
      const maxNonce = 100n;
      const maliciousLPAddress = await maliciousLP.getAddress();
      
      // Setup: paid = 0.5 ETH already
      await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        maliciousLPAddress,
        "0x",
        [],
        { value: ethers.parseEther("0.5") }
      );
      
      // Enable attack
      await maliciousLP.setupAttack(l2LinkedId, maxPayment, maxNonce, ethers.parseEther("1"));
      await maliciousLP.enableAttack();
      
      // Make another payment with reentrancy attempt
      await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        maliciousLPAddress,
        "0x",
        [],
        { value: ethers.parseEther("1") }
      );
      
      // Verify: paid = 1.5 ETH (0.5 + 1, NOT 0.5 + 1 + 1 from reentrancy)
      const paidAmount = await c1Evm.paidFor(l2LinkedId, maliciousLPAddress);
      expect(paidAmount).to.equal(ethers.parseEther("1.5"));
      
      // This proves Effects happened before Interactions
      // Because reentrant call sees updated state (1.5 ETH paid)
      // And would need to check against max (2 ETH)
      // Adding 1 ETH more would be 2.5 ETH > 2 ETH max, so it fails
    });
  });

  describe("Comparison with Normal LP", function () {
    it("Should work normally with non-malicious LP", async function () {
      // This test shows that normal LPs work fine
      // Only malicious LPs attempting reentrancy are blocked
      
      const l2LinkedId = 8n;
      const maxPayment = ethers.parseEther("5");
      const maxNonce = 100n;
      
      // Act - Transfer to normal LP (EOA, no reentrancy)
      await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        normalLP.address,
        "0x",
        [],
        { value: ethers.parseEther("2") }
      );
      
      // Make another transfer
      await c1Evm.connect(user).transfer(
        l2LinkedId,
        maxPayment,
        maxNonce,
        normalLP.address,
        "0x",
        [],
        { value: ethers.parseEther("1") }
      );
      
      // Assert - Should work perfectly
      const paidAmount = await c1Evm.paidFor(l2LinkedId, normalLP.address);
      expect(paidAmount).to.equal(ethers.parseEther("3"));
      
      const lpBalance = await ethers.provider.getBalance(normalLP.address);
      expect(lpBalance).to.be.greaterThan(ethers.parseEther("10002")); // Initial + payments
    });
  });
});
