import { expect } from "chai";
import hre from "hardhat";

/**
 * Asserts C2 `transfer` does not succeed (EthRejector / failed ETH forward).
 * Uses `transfer` + `wait()` and `.eventually.be.rejected` instead of `.to.revert(ethers)`
 * on the raw tx promise, which can mis-handle the trailing `{ value }` overrides.
 */
async function expectC2TransferReverted(
  c2evm: any,
  l2LinkedId: bigint,
  maxAllowedPayment: bigint,
  to: string,
  value: bigint
) {
  // chai-as-promised adds `.eventually` at runtime; default Chai types omit it.
  await (expect(
    (async () => {
      const tx = await c2evm.transfer(l2LinkedId, maxAllowedPayment, to, "0x", {
        value,
      });
      const receipt = await tx.wait();
      if (receipt == null || receipt.status !== 1) {
        throw new Error("expected revert");
      }
    })()
  ) as any).to.eventually.be.rejected;
}

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
    it("Should revert when transferring ETH to EthRejector (forward fails)", async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.5");
      const ethRejectorAddress = await ethRejector.getAddress();

      const initialBalance = await ethers.provider.getBalance(ethRejectorAddress);

      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

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
      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

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
      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

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
      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

      // Verify no event was emitted (transaction reverted, so no event)
    });

    it("Should handle multiple failed transfer attempts to EthRejector", async function () {
      // Arrange
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther("1");
      const transferAmount = ethers.parseEther("0.3");
      const ethRejectorAddress = await ethRejector.getAddress();

      // Act - attempt multiple transfers that will all fail
      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

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
      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );
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
        c2evm.transfer(l2LinkedId, maxAllowedPayment, recipient.address, "0x", {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, "T")
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount, "0x");

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
      await expectC2TransferReverted(
        c2evm,
        l2LinkedId,
        maxAllowedPayment,
        ethRejectorAddress,
        transferAmount
      );

      // Act & Assert - should succeed for normal recipient
      await expect(
        c2evm.transfer(l2LinkedId + 1n, maxAllowedPayment, recipient.address, "0x", {
          value: transferAmount,
        })
      )
        .to.emit(c2evm, "T")
        .withArgs(l2LinkedId + 1n, 0n, recipient.address, transferAmount, "0x");
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
