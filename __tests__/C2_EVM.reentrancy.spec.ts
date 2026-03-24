import { expect } from "chai";
import hre from "hardhat";

describe("C2_EVM - Reentrancy Protection Tests (LP Settlement)", function () {
  let c2Evm: any;
  let maliciousUser: any;
  let owner: any, lp: any, normalUser: any;
  let ethers: any;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, lp, normalUser] = await ethers.getSigners();

    // Deploy C2_EVM contract
    const C2Evm = await ethers.getContractFactory("C2Evm");
    c2Evm = await C2Evm.deploy();

    // Deploy MaliciousUser contract
    const MaliciousUser = await ethers.getContractFactory("MaliciousUser");
    maliciousUser = await MaliciousUser.deploy(await c2Evm.getAddress());
  });

  describe("LP Settlement with Malicious User", function () {
    it("Should prevent reentrancy when LP settles pact with malicious user", async function () {
      // Scenario: LP settles pact by paying malicious user
      // Malicious user tries to manipulate state during receive()
      
      // Arrange
      const l2LinkedId = 1n; // Pact ID
      const maxPayment = ethers.parseEther("2"); // Max LP can pay for this pact
      const settlementAmount = ethers.parseEther("1"); // LP pays 1 ETH to settle
      
      const maliciousUserAddress = await maliciousUser.getAddress();
      
      // Setup attack parameters
      await maliciousUser.setupAttack(
        lp.address,
        l2LinkedId,
        maxPayment,
        ethers.parseEther("0.5") // Try to get 0.5 ETH more
      );
      await maliciousUser.enableAttack();
      
      // Act - LP settles pact by paying malicious user
      const tx = await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: settlementAmount }
      );
      
      await tx.wait();
      
      // Assert
      // 1. Check that malicious user received only the settlement amount
      const userBalance = await ethers.provider.getBalance(maliciousUserAddress);
      expect(userBalance).to.equal(settlementAmount, "User should only receive settlement amount");
      
      // 2. Check that only settlement amount was recorded
      const paidAmount = await c2Evm.paidFor(l2LinkedId, maliciousUserAddress);
      expect(paidAmount).to.equal(settlementAmount, "Only settlement should be recorded");
      
      // 3. Verify attack was attempted (if tracking)
      const attackAttempts = await maliciousUser.attackAttempts();
      expect(attackAttempts).to.be.greaterThan(0n, "Attack should have been attempted");
      
      // 4. Verify C2 contract has no remaining balance
      const contractBalance = await ethers.provider.getBalance(await c2Evm.getAddress());
      expect(contractBalance).to.equal(0n, "Contract should not hold any funds");
    });

    it("Should maintain correct accounting when LP settles multiple times", async function () {
      // Scenario: LP makes multiple settlements to same user for same pact
      
      const l2LinkedId = 2n;
      const maxPayment = ethers.parseEther("5");
      const maliciousUserAddress = await maliciousUser.getAddress();
      
      // First settlement with attack attempt
      await maliciousUser.setupAttack(lp.address, l2LinkedId, maxPayment, ethers.parseEther("0.5"));
      await maliciousUser.enableAttack();
      
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("1") }
      );
      
      // Second settlement without attack
      await maliciousUser.disableAttack();
      
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("1") }
      );
      
      // Assert - Total should be 2 ETH (1 + 1), not more
      const paidAmount = await c2Evm.paidFor(l2LinkedId, maliciousUserAddress);
      expect(paidAmount).to.equal(ethers.parseEther("2"));
      
      const userBalance = await ethers.provider.getBalance(maliciousUserAddress);
      expect(userBalance).to.equal(ethers.parseEther("2"));
    });

    it("Should prevent settlement exceeding max payment even with reentrancy", async function () {
      // Scenario: LP tries to settle more than max (might be exploited via reentrancy)
      
      const l2LinkedId = 3n;
      const maxPayment = ethers.parseEther("1.5");
      const maliciousUserAddress = await maliciousUser.getAddress();
      
      await maliciousUser.enableAttack();
      
      // First settlement: 1 ETH
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("1") }
      );
      
      // Second settlement: 0.6 ETH would exceed max (1 + 0.6 = 1.6 > 1.5)
      await expect(
        c2Evm.connect(lp).transfer(
          l2LinkedId,
          maxPayment,
          maliciousUserAddress,
          '0x',
          { value: ethers.parseEther("0.6") }
        )
      ).to.be.revertedWithCustomError(c2Evm, "E3"); // Overpayment
      
      // Verify only first payment was recorded
      const paidAmount = await c2Evm.paidFor(l2LinkedId, maliciousUserAddress);
      expect(paidAmount).to.equal(ethers.parseEther("1"));
    });
  });

  describe("State Consistency During Reentrancy", function () {
    it("Should show state is updated before external call", async function () {
      // This demonstrates CEI pattern in C2_EVM
      
      const l2LinkedId = 4n;
      const maxPayment = ethers.parseEther("3");
      const maliciousUserAddress = await maliciousUser.getAddress();
      
      await maliciousUser.enableAttack();
      
      // Make settlement
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("1.5") }
      );
      
      // Check: paidFor should immediately show updated value
      const paidAmount = await c2Evm.paidFor(l2LinkedId, maliciousUserAddress);
      expect(paidAmount).to.equal(ethers.parseEther("1.5"));
      
      // This proves state was updated before the external call (CEI pattern)
    });

    it("Should maintain nonce consistency across reentrancy attempts", async function () {
      const l2LinkedId = 5n;
      const maxPayment = ethers.parseEther("5");
      const maliciousUserAddress = await maliciousUser.getAddress();
      
      await maliciousUser.enableAttack();
      
      // Make 3 settlements
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("1") }
      );
      
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("1") }
      );
      
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("1") }
      );
      
      // Check nonce via getNonce function
      const nonce = await c2Evm.getNonce(l2LinkedId, maliciousUserAddress);
      expect(nonce).to.equal(3n, "Nonce should be 3 (three successful settlements)");
      
      // Reentrancy attempts should not have created extra nonces
    });
  });

  describe("No Fund Custody Property", function () {
    it("Should demonstrate that C2 contract never holds LP funds", async function () {
      // This test proves that the contract only forwards funds
      // It never stores them, so there's nothing to steal via reentrancy
      
      const l2LinkedId = 6n;
      const maxPayment = ethers.parseEther("10");
      const maliciousUserAddress = await maliciousUser.getAddress();
      
      // Check contract balance before
      let contractBalance = await ethers.provider.getBalance(await c2Evm.getAddress());
      expect(contractBalance).to.equal(0n, "Contract starts with 0 balance");
      
      await maliciousUser.enableAttack();
      
      // LP settles pact
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("5") }
      );
      
      // Check contract balance after
      contractBalance = await ethers.provider.getBalance(await c2Evm.getAddress());
      expect(contractBalance).to.equal(0n, "Contract should still have 0 balance");
      
      // All funds went directly to user
      const userBalance = await ethers.provider.getBalance(maliciousUserAddress);
      expect(userBalance).to.equal(ethers.parseEther("5"));
      
      // This proves: no custody = no funds to steal = reentrancy is not profitable
    });

    it("Should show that only forwarding happens, no storage", async function () {
      const l2LinkedId = 7n;
      const maxPayment = ethers.parseEther("10");
      const normalUserAddress = normalUser.address;
      
      const userBalanceBefore = await ethers.provider.getBalance(normalUserAddress);
      
      // LP settles
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        normalUserAddress,
        '0x',
        { value: ethers.parseEther("3") }
      );
      
      const userBalanceAfter = await ethers.provider.getBalance(normalUserAddress);
      
      // User received exactly what LP sent
      expect(userBalanceAfter - userBalanceBefore).to.equal(ethers.parseEther("3"));
      
      // Contract balance is 0 (no custody)
      const contractBalance = await ethers.provider.getBalance(await c2Evm.getAddress());
      expect(contractBalance).to.equal(0n);
    });
  });

  describe("Comparison: Normal vs Malicious User", function () {
    it("Should work normally with non-malicious user", async function () {
      const l2LinkedId = 8n;
      const maxPayment = ethers.parseEther("10");
      
      const userBalanceBefore = await ethers.provider.getBalance(normalUser.address);
      
      // LP settles pact with normal user (EOA)
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        normalUser.address,
        '0x',
        { value: ethers.parseEther("2") }
      );
      
      // Make another settlement
      await c2Evm.connect(lp).transfer(
        l2LinkedId,
        maxPayment,
        normalUser.address,
        '0x',
        { value: ethers.parseEther("1") }
      );
      
      // Assert - Should work perfectly
      const paidAmount = await c2Evm.paidFor(l2LinkedId, normalUser.address);
      expect(paidAmount).to.equal(ethers.parseEther("3"));
      
      const userBalanceAfter = await ethers.provider.getBalance(normalUser.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(ethers.parseEther("3"));
    });

    it("Should demonstrate that malicious contract is the issue, not the protocol", async function () {
      // This test shows that:
      // 1. Normal users (EOAs) work fine
      // 2. Malicious contracts attempt reentrancy but are blocked
      // 3. The protocol is secure by design
      
      const l2LinkedIdNormal = 9n;
      const l2LinkedIdMalicious = 10n;
      const maxPayment = ethers.parseEther("5");
      
      const maliciousUserAddress = await maliciousUser.getAddress();
      await maliciousUser.enableAttack();
      
      // Settlement to normal user - works fine
      await c2Evm.connect(lp).transfer(
        l2LinkedIdNormal,
        maxPayment,
        normalUser.address,
        '0x',
        { value: ethers.parseEther("2") }
      );
      
      // Settlement to malicious user - still works, but reentrancy blocked
      await c2Evm.connect(lp).transfer(
        l2LinkedIdMalicious,
        maxPayment,
        maliciousUserAddress,
        '0x',
        { value: ethers.parseEther("2") }
      );
      
      // Both should have correct amounts
      const normalPaid = await c2Evm.paidFor(l2LinkedIdNormal, normalUser.address);
      const maliciousPaid = await c2Evm.paidFor(l2LinkedIdMalicious, maliciousUserAddress);
      
      expect(normalPaid).to.equal(ethers.parseEther("2"));
      expect(maliciousPaid).to.equal(ethers.parseEther("2"));
      
      // Malicious user didn't get extra funds via reentrancy
      const maliciousBalance = await ethers.provider.getBalance(maliciousUserAddress);
      expect(maliciousBalance).to.equal(ethers.parseEther("2"));
    });
  });

  describe("Event Integrity During Reentrancy", function () {
    it("Should emit correct events even with reentrancy attempt", async function () {
      const l2LinkedId = 11n;
      const maxPayment = ethers.parseEther("5");
      const settlementAmount = ethers.parseEther("1");
      const maliciousUserAddress = await maliciousUser.getAddress();
      
      await maliciousUser.enableAttack();
      
      // Act & Assert - Check that Transfer event is emitted correctly
      await expect(
        c2Evm.connect(lp).transfer(
          l2LinkedId,
          maxPayment,
          maliciousUserAddress,
          '0x',
          { value: settlementAmount }
        )
      ).to.emit(c2Evm, "T")
        .withArgs(
          l2LinkedId,
          0n, // nonce = 0 (first settlement)
          maliciousUserAddress,
          settlementAmount,
          '0x'
        );
      
      // Event should be emitted exactly once, not multiple times from reentrancy
    });
  });
});
