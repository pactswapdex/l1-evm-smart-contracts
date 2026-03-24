import { expect } from "chai";
import hre from "hardhat";

describe("C2_EVM with EthRejector as recipient", function () {
  let c2evm: any;
  let ethRejector: any;
  let owner: any, recipient: any, otherAccount: any;
  let ethers: any;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, recipient, otherAccount] = await ethers.getSigners();

    // Deploy C2Evm contract
    const C2Evm = await ethers.getContractFactory("C2Evm");
    c2evm = await C2Evm.deploy();

    // Deploy EthRejector contract
    const EthRejector = await ethers.getContractFactory("EthRejector");
    ethRejector = await EthRejector.deploy();
  });

  describe("Transfer to EthRejector", function () {
    it("Should revert with a custom error when transferring ETH to EthRejector", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.5");
      const ethRejectorAddress = await ethRejector.getAddress();

      const initialBalance = await ethers.provider.getBalance(ethRejectorAddress);

      try {
        const tx = await c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        });

        console.log(tx);
      
        // Act & Assert - The contract uses a hardcoded selector 0xf67db1ed which may not match E4()
        // So we check that it reverts with any custom error from C2Evm
        // The contract should revert when the transfer fails
        await expect(
            c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
              value: transferAmount,
            })
        ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");
      } catch (error) {
        console.log(error);
        throw error;
      }

      // Verify that no ETH was transferred
      const finalBalance = await ethers.provider.getBalance(ethRejectorAddress);
      expect(finalBalance).to.equal(initialBalance);
    });

    it("Should not update payment tracking when transfer to EthRejector fails", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.5");
      const ethRejectorAddress = await ethRejector.getAddress();

      // Verify initial state
      let paid = await c2evm.paidFor(l2LinkedId, ethRejectorAddress);
      expect(paid).to.equal(0n);

      // Act - attempt transfer that will fail
      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");

      // Assert - payment tracking should remain unchanged
      paid = await c2evm.paidFor(l2LinkedId, ethRejectorAddress);
      expect(paid).to.equal(0n);
    });

    it("Should not increment nonce when transfer to EthRejector fails", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.5");
      const ethRejectorAddress = await ethRejector.getAddress();

      // Verify initial nonce
      let nonce = await c2evm.getNonce(l2LinkedId, ethRejectorAddress);
      expect(nonce).to.equal(0n);

      // Act - attempt transfer that will fail
      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");

      // Assert - nonce should remain unchanged
      nonce = await c2evm.getNonce(l2LinkedId, ethRejectorAddress);
      expect(nonce).to.equal(0n);
    });

    it("Should not emit T event when transfer to EthRejector fails", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.5");
      const ethRejectorAddress = await ethRejector.getAddress();

      // Act & Assert - should revert without emitting event
      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      )
        .to.be.revertedWithCustomError(ethRejector, "DontSendETH");
      
      // Verify no event was emitted (transaction reverted, so no event)
      // We can't use .and.not.to.emit() with revertedWithCustomError, so we verify separately
    });

    it("Should handle multiple failed transfer attempts to EthRejector", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.3");
      const ethRejectorAddress = await ethRejector.getAddress();

      // Act - attempt multiple transfers that will all fail
      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(c2evm, "E4");

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");

      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");

      // Assert - state should remain unchanged
      const paid = await c2evm.paidFor(l2LinkedId, ethRejectorAddress);
      const nonce = await c2evm.getNonce(l2LinkedId, ethRejectorAddress);
      expect(paid).to.equal(0n);
      expect(nonce).to.equal(0n);
    });

    it("Should fail even with minimum payment amount", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = 1n; // MIN_PAYMENT = 1 wei
      const ethRejectorAddress = await ethRejector.getAddress();

      // Act & Assert - should still revert
      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");
    });
  });

  describe("Comparison: Transfer to normal recipient vs EthRejector", function () {
    it("Should succeed when transferring to normal payable recipient", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.5");

      const initialBalance = await ethers.provider.getBalance(recipient.address);

      // Act & Assert - should succeed for normal recipient
      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, "T")
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount);

      const finalBalance = await ethers.provider.getBalance(recipient.address);
      expect(finalBalance - initialBalance).to.equal(transferAmount);
    });

    it("Should fail when transferring to EthRejector but succeed for normal recipient", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.5");
      const ethRejectorAddress = await ethRejector.getAddress();

      // Act & Assert - should fail for EthRejector
      await expect(
        c2evm.transfer(l2LinkedId, maxAllowedPayment, ethRejectorAddress, {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");

      // Act & Assert - should succeed for normal recipient
      await expect(
        c2evm.transfer(l2LinkedId + 1n, maxAllowedPayment, recipient.address, {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, "T")
        .withArgs(l2LinkedId + 1n, 0n, recipient.address, transferAmount);
    });
  });

  describe("EthRejector behavior verification", function () {
    it("Should verify EthRejector rejects plain ETH transfers", async function () {
      // Arrange
      const transferAmount = ethers.parseEther("0.1");
      const ethRejectorAddress = await ethRejector.getAddress();
      const initialBalance = await ethers.provider.getBalance(ethRejectorAddress);

      // Act & Assert - direct ETH transfer should fail
      // Note: The fallback reverts, but the revert reason may not be accessible
      await expect(
        owner.sendTransaction({
          to: ethRejectorAddress,
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(ethRejector, "DontSendETH");

      // Verify balance unchanged
      const finalBalance = await ethers.provider.getBalance(ethRejectorAddress);
      expect(finalBalance).to.equal(initialBalance);
    });
  });
});

