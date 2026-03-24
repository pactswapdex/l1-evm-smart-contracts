// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title C1Evm - Cross-Chain ETH Transfer Contract
 * @notice Handles ETH transfers with L2 chain integration and optional aggregator fee distribution.
 *
 * Accounting model:
 * - Payment: keyed by `keccak256(recipient, l2LinkedId)` -> `uint96 paid`.
 *   Only the recipient amount (msg.value minus fees) is tracked.
 * - Nonce:   keyed by `l2LinkedId` only (shared across all recipients for a given l2LinkedId).
 * - `maxPayment` is an upper bound on the cumulative paid amount for a given (recipient, l2LinkedId) key.
 * - `maxNonce` is an upper bound on the nonce for a given l2LinkedId (limits the number of transfers).
 *
 * Fee distribution:
 * - Up to 20 aggregator fee recipients can be specified per transfer.
 * - The user sends a single `msg.value`; fees are subtracted and sent to fee recipients,
 *   the remainder goes to the main recipient.
 *
 * Security notes:
 * - The contract forwards ETH using a low-level `call`.
 * - State is updated before any external calls to reduce reentrancy risk (CEI pattern).
 *   A reentrant call will observe the updated paid amount and cannot bypass the `maxPayment` bound.
 */
contract C1Evm is ReentrancyGuard {
    struct Fee {
        address payable recipient;
        uint256 amount;
    }

    error InvalidRecipientOrAmount();
    error ExceedsMaxPayment();
    error ExceedsMaxNonce();
    error TransferFailed();
    error InvalidFeeRecipient();
    error InsufficientAmountForFees();

    event Transfer(
        uint256 indexed l2LinkedId,
        uint256 indexed nonce,
        address recipient,
        uint256 amount,
        bytes data
    );

    event LinkedId(
        uint256 indexed l2LinkedId
    );

    event FeePaid(
        uint256 indexed l2LinkedId,
        address feeRecipient,
        uint256 amount
    );

    /// @dev Cumulative paid amount per (recipient, l2LinkedId). Key = keccak256(recipient, l2LinkedId).
    mapping(bytes32 => uint96) private paid;

    /// @dev Nonce counter per l2LinkedId (not tied to recipient).
    mapping(uint256 => uint32) private nonces;

    /// @dev Minimum accepted payment (1 wei).
    uint256 private constant MIN_PAYMENT = 1;

    /**
     * @dev Compute storage key for (recipient, l2LinkedId) using assembly for gas efficiency.
     */
    function computeKey(address recipient, uint256 l2LinkedId) internal pure returns (bytes32 result) {
        assembly {
            mstore(0x00, recipient)
            mstore(0x20, l2LinkedId)
            result := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Transfer ETH to `recipient` and emit an event for L2 processing.
     *         Optionally distributes aggregator integration fees to up to 20 fee recipients.
     *         The recipient receives `msg.value - sum(feeAmounts)`.
     *         Only the recipient amount is tracked in `paid` and checked against `maxPayment`.
     *
     * @param l2LinkedId L2 chain identifier for cross-chain tracking.
     * @param maxPayment Maximum allowed cumulative payment for (recipient, l2LinkedId).
     * @param maxNonce Maximum allowed nonce for l2LinkedId (inclusive upper bound on post-increment value).
     * @param recipient Address to receive ETH (after fees are subtracted).
     * @param data Additional data for L2 chain processing.
     * @param fees Array of Fee structs (recipient + amount) for aggregator integration fees (max 20).
     */
    function transfer(
        uint256 l2LinkedId,
        uint256 maxPayment,
        uint256 maxNonce,
        address payable recipient,
        bytes calldata data,
        Fee[] calldata fees
    ) external payable nonReentrant {
        // Compute total fees
        uint256 totalFees;
        for (uint256 i; i < fees.length;) {
            if (fees[i].recipient == address(0)) revert InvalidFeeRecipient();
            totalFees += fees[i].amount;
            unchecked { ++i; }
        }

        if (msg.value <= totalFees || msg.value - totalFees < MIN_PAYMENT) {
            revert InsufficientAmountForFees();
        }

        totalFees = msg.value - totalFees; // reuse totalFees as recipientAmount

        if (recipient == address(0) || recipient == address(this)) {
            revert InvalidRecipientOrAmount();
        }

        unchecked {
            // Scope key and totalPaid so they leave the stack before nonce
            {
                bytes32 key = computeKey(recipient, l2LinkedId);
                uint256 totalPaid = uint256(paid[key]) + totalFees;
                if (totalPaid > maxPayment) revert ExceedsMaxPayment();
                paid[key] = uint96(totalPaid);
            }

            uint256 nonce = nonces[l2LinkedId];
            if (nonce + 1 > maxNonce) revert ExceedsMaxNonce();
            nonces[l2LinkedId] = uint32(nonce + 1);

            // Transfer ETH to recipient
            bool success;
            assembly {
                success := call(gas(), recipient, totalFees, 0, 0, 0, 0)
            }
            if (!success) revert TransferFailed();

            // Distribute fees
            for (uint256 i; i < fees.length;) {
                Fee calldata f = fees[i];
                assembly {
                    let fAddr := calldataload(f)
                    let fAmt  := calldataload(add(f, 0x20))
                    success := call(gas(), fAddr, fAmt, 0, 0, 0, 0)
                }
                if (!success) revert TransferFailed();
                emit FeePaid(l2LinkedId, f.recipient, f.amount);
                ++i;
            }

            emit Transfer(l2LinkedId, nonce, recipient, totalFees, data);
            emit LinkedId(l2LinkedId);
        }
    }

    /**
     * @notice Returns cumulative paid amount for (recipient, l2LinkedId).
     */
    function paidFor(
        uint256 l2LinkedId,
        address recipient
    ) external view returns (uint256) {
        return uint256(paid[computeKey(recipient, l2LinkedId)]);
    }

    /**
     * @notice Returns current nonce for a given l2LinkedId (shared across all recipients).
     */
    function getNonce(
        uint256 l2LinkedId
    ) external view returns (uint256) {
        return uint256(nonces[l2LinkedId]);
    }
}
