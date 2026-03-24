// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title C1Erc20Bep20
 * @notice ERC20 transfer helper with per-(recipient, l2LinkedId) accounting, calldata payload,
 *         and optional aggregator fee distribution.
 * @dev
 *  Accounting model:
 *  - Payment: keyed by `keccak256(recipient, l2LinkedId)` -> `uint96 paid`.
 *    Only the recipient amount (total amount minus fees) is tracked.
 *  - Nonce:   keyed by `l2LinkedId` only (shared across all recipients for a given l2LinkedId).
 *  - `maxPayment` is an upper bound on the cumulative paid amount for a given (recipient, l2LinkedId) key.
 *  - `maxNonce` is an upper bound on the nonce for a given l2LinkedId (limits the number of transfers).
 *
 *  Fee distribution:
 *  - Up to 20 aggregator fee recipients can be specified per transfer.
 *  - `amount` is the total (recipient + fees). Fees are subtracted and sent to fee recipients,
 *    the remainder goes to the main recipient.
 *
 *  - Pulls tokens from `msg.sender` via `safeTransferFrom`.
 *  - State is updated before the external token interaction (CEI pattern).
 *  - Token is assumed to be a standard ERC20 (SafeERC20 handles missing boolean returns).
 */
contract C1Erc20Bep20 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Fee {
        address recipient;
        uint256 amount;
    }

    error ZeroTokenAddress();
    error InvalidRecipientOrAmount();
    error ExceedsMaxPayment();
    error ExceedsMaxNonce();
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

    /// @notice ERC20 token pulled from the sender.
    IERC20 public immutable token;

    /// @dev Minimum accepted payment in token units.
    uint256 private constant MIN_PAYMENT = 1;

    constructor(IERC20 _token) {
        if (address(_token) == address(0)) revert ZeroTokenAddress();
        token = _token;
    }

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
     * @notice Transfer tokens from sender to `recipient` and emit an event for L2 processing.
     *         Optionally distributes aggregator integration fees to up to 20 fee recipients.
     *         The recipient receives `amount - sum(feeAmounts)`.
     *         Only the recipient amount is tracked in `paid` and checked against `maxPayment`.
     *
     * @param l2LinkedId L2 chain identifier for cross-chain tracking.
     * @param maxPayment Maximum allowed cumulative payment for (recipient, l2LinkedId).
     * @param maxNonce Maximum allowed nonce for l2LinkedId (inclusive upper bound on post-increment value).
     * @param recipient Address to receive tokens (after fees are subtracted).
     * @param amount Total amount of tokens (recipient + fees). Pulled from msg.sender.
     * @param data Additional data for L2 / off-chain processing.
     * @param fees Array of Fee structs (recipient + amount) for aggregator integration fees (max 20).
     */
    function transfer(
        uint256 l2LinkedId,
        uint256 maxPayment,
        uint256 maxNonce,
        address recipient,
        uint256 amount,
        bytes calldata data,
        Fee[] calldata fees
    ) external nonReentrant {
        // Compute total fees
        uint256 totalFees;
        for (uint256 i; i < fees.length;) {
            if (fees[i].recipient == address(0)) revert InvalidFeeRecipient();
            totalFees += fees[i].amount;
            unchecked { ++i; }
        }

        if (amount <= totalFees || amount - totalFees < MIN_PAYMENT) {
            revert InsufficientAmountForFees();
        }

        amount -= totalFees; // reuse amount as recipient-only portion

        if (recipient == address(0)) revert InvalidRecipientOrAmount();

        unchecked {
            // Scope key and totalPaid so they leave the stack before nonce
            {
                bytes32 key = computeKey(recipient, l2LinkedId);
                uint256 totalPaid = uint256(paid[key]) + amount;
                if (totalPaid > maxPayment) revert ExceedsMaxPayment();
                paid[key] = uint96(totalPaid);
            }

            uint256 nonce = nonces[l2LinkedId];
            if (nonce + 1 > maxNonce) revert ExceedsMaxNonce();
            nonces[l2LinkedId] = uint32(nonce + 1);

            // Pull tokens for recipient
            token.safeTransferFrom(msg.sender, recipient, amount);

            // Distribute fees
            for (uint256 i; i < fees.length;) {
                token.safeTransferFrom(msg.sender, fees[i].recipient, fees[i].amount);
                emit FeePaid(l2LinkedId, fees[i].recipient, fees[i].amount);
                ++i;
            }

            emit Transfer(l2LinkedId, nonce, recipient, amount, data);
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
