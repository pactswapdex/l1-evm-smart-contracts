import { expect } from 'chai';
import hre from 'hardhat';

describe('C1_EVM', function () {
  let c1evm: any;
  let owner: any, recipient: any, otherAccount: any;
  let ethers: any;

  const MAX_NONCE = 100n;

  beforeEach(async function () {
    const { ethers: localEthers } = await hre.network.connect();
    ethers = localEthers;
    [owner, recipient, otherAccount] = await ethers.getSigners();
    const C1Evm = await ethers.getContractFactory('C1Evm');
    c1evm = await C1Evm.deploy();
  });

  describe('Transfer', function () {
    it('Should transfer ETH and emit Transfer event', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.5');
      const data = '0x';

      const initialBalance = await ethers.provider.getBalance(recipient.address);

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, data, [], {
          value: transferAmount,
        })
      )
        .to.emit(c1evm, 'Transfer')
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount, data);

      const finalBalance = await ethers.provider.getBalance(recipient.address);
      expect(finalBalance - initialBalance).to.equal(transferAmount);
    });

    it('Should track cumulative payments correctly', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.3');

      await c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: transferAmount,
      });

      let paid = await c1evm.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount);

      await c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: transferAmount,
      });

      paid = await c1evm.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(transferAmount * 2n);
    });

    it('Should increment nonce correctly', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');
      const data = '0x';

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, data, [], {
          value: transferAmount,
        })
      )
        .to.emit(c1evm, 'Transfer')
        .withArgs(l2LinkedId, 0n, recipient.address, transferAmount, data);

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, data, [], {
          value: transferAmount,
        })
      )
        .to.emit(c1evm, 'Transfer')
        .withArgs(l2LinkedId, 1n, recipient.address, transferAmount, data);

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, data, [], {
          value: transferAmount,
        })
      )
        .to.emit(c1evm, 'Transfer')
        .withArgs(l2LinkedId, 2n, recipient.address, transferAmount, data);

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, data, [], {
          value: transferAmount,
        })
      )
        .to.emit(c1evm, 'Transfer')
        .withArgs(l2LinkedId, 3n, recipient.address, transferAmount, data);

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, data, [], {
          value: transferAmount,
        })
      )
        .to.emit(c1evm, 'Transfer')
        .withArgs(l2LinkedId, 4n, recipient.address, transferAmount, data);
    });

    it('Should revert when payment exceeds maxAllowedPayment', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('0.5');
      const transferAmount = ethers.parseEther('0.3');

      await c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: transferAmount,
      });

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(c1evm, 'ExceedsMaxPayment');
    });

    it('Should revert when nonce exceeds maxNonce', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('10');
      const maxNonce = 2n;
      const transferAmount = ethers.parseEther('0.1');

      await c1evm.transfer(l2LinkedId, maxAllowedPayment, maxNonce, recipient.address, '0x', [], {
        value: transferAmount,
      });

      await c1evm.transfer(l2LinkedId, maxAllowedPayment, maxNonce, recipient.address, '0x', [], {
        value: transferAmount,
      });

      await expect(
        c1evm.transfer(l2LinkedId, maxAllowedPayment, maxNonce, recipient.address, '0x', [], {
          value: transferAmount,
        })
      ).to.be.revertedWithCustomError(c1evm, 'ExceedsMaxNonce');
    });

    it('Should revert when recipient is zero address', async function () {
      await expect(
        c1evm.transfer(1n, ethers.parseEther('1'), MAX_NONCE, ethers.ZeroAddress, '0x', [], {
          value: ethers.parseEther('0.1'),
        })
      ).to.be.revertedWithCustomError(c1evm, 'InvalidRecipientOrAmount');
    });

    it('Should revert when payment is zero', async function () {
      await expect(
        c1evm.transfer(1n, ethers.parseEther('1'), MAX_NONCE, recipient.address, '0x', [], {
          value: 0,
        })
      ).to.be.revertedWithCustomError(c1evm, 'InsufficientAmountForFees');
    });

    it('Should revert when recipient is the contract itself', async function () {
      await expect(
        c1evm.transfer(1n, ethers.parseEther('1'), MAX_NONCE, await c1evm.getAddress(), '0x', [], {
          value: ethers.parseEther('0.1'),
        })
      ).to.be.revertedWithCustomError(c1evm, 'InvalidRecipientOrAmount');
    });
  });

  describe('Security - Attack Vectors', function () {
    it('Should prevent cumulative paid from exceeding maxPayment', async function () {
      // Verify that the maxPayment check correctly guards cumulative accounting.
      // Use realistic amounts (not uint96.max which exceeds test account balance).
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('5');

      // First transfer: 3 ETH
      await c1evm.transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('3'),
      });

      const paid = await c1evm.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(ethers.parseEther('3'));

      // Second transfer: 2 ETH → cumulative = 5 ETH == maxPayment → allowed
      await c1evm.transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('2'),
      });

      expect(await c1evm.paidFor(l2LinkedId, recipient.address)).to.equal(ethers.parseEther('5'));

      // Third transfer: even 1 wei more → 5 ETH + 1 > 5 ETH → revert
      await expect(
        c1evm.transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x', [], {
          value: 1n,
        })
      ).to.be.revertedWithCustomError(c1evm, 'ExceedsMaxPayment');
    });

    it('Should demonstrate that caller controls maxPayment per-call', async function () {
      // First call: user sets maxPayment = 0.5 ETH, pays 0.4 ETH
      const l2LinkedId = 1n;
      await c1evm.transfer(l2LinkedId, ethers.parseEther('0.5'), MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('0.4'),
      });

      // Second call: SAME l2LinkedId/recipient, but caller passes higher maxPayment
      // cumulative paid = 0.4 + 0.4 = 0.8 ETH > 0.5 (original max)
      // But because maxPayment is caller-provided, passing 1.0 allows it
      await c1evm.transfer(l2LinkedId, ethers.parseEther('1'), MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('0.4'),
      });

      const paid = await c1evm.paidFor(l2LinkedId, recipient.address);
      expect(paid).to.equal(ethers.parseEther('0.8'));
    });

    it('Should demonstrate that maxNonce is caller-controlled per-call', async function () {
      const l2LinkedId = 1n;

      // First call with maxNonce = 1 (allows 1 transfer)
      await c1evm.transfer(l2LinkedId, ethers.parseEther('10'), 1n, recipient.address, '0x', [], {
        value: ethers.parseEther('0.1'),
      });

      // Second call would fail with maxNonce = 1
      await expect(
        c1evm.transfer(l2LinkedId, ethers.parseEther('10'), 1n, recipient.address, '0x', [], {
          value: ethers.parseEther('0.1'),
        })
      ).to.be.revertedWithCustomError(c1evm, 'ExceedsMaxNonce');

      // But caller can just pass a higher maxNonce to bypass
      await c1evm.transfer(l2LinkedId, ethers.parseEther('10'), 10n, recipient.address, '0x', [], {
        value: ethers.parseEther('0.1'),
      });

      const nonce = await c1evm.getNonce(l2LinkedId);
      expect(nonce).to.equal(2n);
    });

    it('Should share nonce across different recipients for same l2LinkedId', async function () {
      const l2LinkedId = 1n;

      // Transfer to recipient (nonce 0 -> 1)
      await expect(
        c1evm.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x', [], {
          value: ethers.parseEther('0.1'),
        })
      ).to.emit(c1evm, 'Transfer').withArgs(l2LinkedId, 0n, recipient.address, ethers.parseEther('0.1'), '0x');

      // Transfer to otherAccount with SAME l2LinkedId (nonce 1 -> 2, NOT 0 -> 1)
      await expect(
        c1evm.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, otherAccount.address, '0x', [], {
          value: ethers.parseEther('0.1'),
        })
      ).to.emit(c1evm, 'Transfer').withArgs(l2LinkedId, 1n, otherAccount.address, ethers.parseEther('0.1'), '0x');

      const nonce = await c1evm.getNonce(l2LinkedId);
      expect(nonce).to.equal(2n);
    });

    it('Should keep separate paid accounting per (recipient, l2LinkedId)', async function () {
      const l2LinkedId = 1n;

      await c1evm.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('1'),
      });

      await c1evm.transfer(l2LinkedId, ethers.parseEther('10'), MAX_NONCE, otherAccount.address, '0x', [], {
        value: ethers.parseEther('2'),
      });

      // paid is keyed by (recipient, l2LinkedId) — should NOT interfere
      expect(await c1evm.paidFor(l2LinkedId, recipient.address)).to.equal(ethers.parseEther('1'));
      expect(await c1evm.paidFor(l2LinkedId, otherAccount.address)).to.equal(ethers.parseEther('2'));
    });

    it('Should keep separate accounting per l2LinkedId for same recipient', async function () {
      await c1evm.transfer(1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('1'),
      });

      await c1evm.transfer(2n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('2'),
      });

      expect(await c1evm.paidFor(1n, recipient.address)).to.equal(ethers.parseEther('1'));
      expect(await c1evm.paidFor(2n, recipient.address)).to.equal(ethers.parseEther('2'));

      // Nonces should be independent per l2LinkedId
      expect(await c1evm.getNonce(1n)).to.equal(1n);
      expect(await c1evm.getNonce(2n)).to.equal(1n);
    });

    it('Should allow multiple callers to pay same (recipient, l2LinkedId) — cumulative', async function () {
      const l2LinkedId = 1n;
      const maxPayment = ethers.parseEther('2');

      // owner pays 0.5 ETH
      await c1evm.connect(owner).transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('0.5'),
      });

      // otherAccount pays 0.7 ETH to same (recipient, l2LinkedId)
      await c1evm.connect(otherAccount).transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: ethers.parseEther('0.7'),
      });

      // cumulative paid = 1.2 ETH
      expect(await c1evm.paidFor(l2LinkedId, recipient.address)).to.equal(ethers.parseEther('1.2'));

      // Third call would exceed if cumulative 1.2 + 0.9 = 2.1 > 2.0
      await expect(
        c1evm.connect(owner).transfer(l2LinkedId, maxPayment, MAX_NONCE, recipient.address, '0x', [], {
          value: ethers.parseEther('0.9'),
        })
      ).to.be.revertedWithCustomError(c1evm, 'ExceedsMaxPayment');
    });

    it('Should accept zero-amount fee entries (valid but wasteful)', async function () {
      const recipientBefore = await ethers.provider.getBalance(recipient.address);

      const tx = await c1evm.transfer(
        1n, ethers.parseEther('10'), MAX_NONCE, recipient.address, '0x',
        [{ recipient: otherAccount.address, amount: 0n }],
        { value: ethers.parseEther('1') }
      );
      await tx.wait();

      // Recipient should receive the full 1 ETH (0 fee)
      const recipientAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(ethers.parseEther('1'));

      // FeePaid still emitted even for 0 amount
      await expect(tx).to.emit(c1evm, 'FeePaid').withArgs(1n, otherAccount.address, 0n);
    });

    it('Should revert if recipient contract rejects ETH (EthRejector)', async function () {
      const EthRejector = await ethers.getContractFactory('EthRejector');
      const rejector = await EthRejector.deploy();
      const rejectorAddress = await rejector.getAddress();

      await expect(
        c1evm.transfer(1n, ethers.parseEther('10'), MAX_NONCE, rejectorAddress, '0x', [], {
          value: ethers.parseEther('0.1'),
        })
      ).to.be.revertedWithCustomError(c1evm, 'TransferFailed');
    });

    it('Should not allow sending ETH directly to the contract (no receive/fallback)', async function () {
      const c1evmAddress = await c1evm.getAddress();

      let reverted = false;
      try {
        const tx = await owner.sendTransaction({ to: c1evmAddress, value: ethers.parseEther('1') });
        await tx.wait();
      } catch {
        reverted = true;
      }
      expect(reverted).to.equal(true, 'Direct ETH send should revert');
    });
  });

  describe('Gas Usage', function () {
    it('Should report gas usage for operations', async function () {
      const l2LinkedId = 1n;
      const maxAllowedPayment = ethers.parseEther('1');
      const transferAmount = ethers.parseEther('0.1');

      const tx1 = await c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: transferAmount,
      });
      const receipt1 = await tx1.wait();
      console.log('Gas used for first transfer:', receipt1?.gasUsed);

      const tx2 = await c1evm.transfer(l2LinkedId, maxAllowedPayment, MAX_NONCE, recipient.address, '0x', [], {
        value: transferAmount,
      });
      const receipt2 = await tx2.wait();
      console.log('Gas used for second transfer:', receipt2?.gasUsed);
    });
  });
});
