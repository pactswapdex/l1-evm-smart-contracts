// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title C2Erc20Bep20
 * @notice ERC20 transfer helper with per-(recipient, l2LinkedId) accounting.
 * @dev
 *  - Pulls tokens from `msg.sender` via `safeTransferFrom`.
 *  - Tracks cumulative paid amount and nonce per `(recipient, l2LinkedId)` pair.
 *
 *  Assumptions / notes for audit:
 *  - Token `t` is assumed to be a standard ERC20 (SafeERC20 handles non-standard returns).
 *  - `m` is enforced against the cumulative paid amount for the (r, l) key.
 */
contract C2Erc20Bep20 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Token address is zero.
    error E1(); // ZeroToken
    /// @notice Amount is below the minimum payment.
    error E2(); // PaymentTooLow
    /// @notice Cumulative paid amount would exceed `m`.
    error E3(); // Overpayment

    /**
     * @notice Emitted after a successful token transfer.
     * @dev `n` is the pre-increment nonce.
     * @param l L2 linked identifier.
     * @param n Nonce (monotonically increasing per (r, l)).
     * @param r Recipient that received tokens.
     * @param a Amount transferred for this call.
     * @param d Additional data for L2 / off-chain processing.
     */
    event T( // Transfer
        uint256 indexed l, // l2LinkedId
        uint256 indexed n, // nonce
        address r, // recipient
        uint256 a, // amount
        bytes d // data
    );

    /**
     * @dev Packed into a single 256-bit slot:
     *  - `p` (uint96)  : total paid for (r, l)
     *  - `n` (uint32)  : nonce for (r, l)
     *  - `u` (uint128) : reserved
     */
    struct PaymentInfo {
        uint96 p;   // paid
        uint32 n;   // nonce
        uint128 u;  // unused
    }
    
    /// @dev Per-key accounting storage (key = keccak256(r, l)).
    mapping(bytes32 => PaymentInfo) private s; // storage

    /// @notice ERC20 token pulled from the sender.
    IERC20 public immutable t; // token

    /// @dev Minimum accepted payment in token units (as-is, not normalized by decimals).
    uint256 private constant M = 1; // MIN_PAYMENT

    constructor(IERC20 _t) {
        if (address(_t) == address(0)) revert E1();
        t = _t;
    }
    
    /**
     * @dev Compute storage key for (recipient, l2LinkedId).
     * @notice Implemented in assembly for gas efficiency.
     */
    function k(address r, uint256 l) internal pure returns(bytes32 o) {
        assembly {
            mstore(0x00, r)
            mstore(0x20, l)
            o := keccak256(0x00, 0x40)
        }
    }

    /**
     * @notice Transfer tokens from sender to `r` and update per-key accounting.
     * @dev
     *  - `m` caps the cumulative paid amount for (r, l).
     *  - Accounting is updated before interacting with the external token contract.
     *
     * @param l L2 linked identifier.
     * @param m Max allowed cumulative paid for (r, l).
     * @param r Recipient.
     * @param a Amount to transfer.
     * @param d Additional data for L2 / off-chain processing.
     */
    function transfer(
        uint256 l,    // l2LinkedId
        uint256 m,    // maxAllowedPayment
        address r,    // recipient
        uint256 a,    // amount
        bytes calldata d // data
    ) external nonReentrant {
        if (a < M) revert E2();

        bytes32 x = k(r, l);
        PaymentInfo storage i = s[x];
        
        unchecked {
            uint256 p = uint256(i.p) + a;
            if (p > m) revert E3();
            
            uint256 n = i.n;
            uint256 newNonce = n + 1;
            
            assembly {
                // Build packed slot: [0..95]=p, [96..127]=newNonce.
                let slot := sload(i.slot)
                slot := 0
                slot := or(slot, p)
                slot := or(slot, shl(96, newNonce))
                sstore(i.slot, slot)
            }
            
            // Pull tokens from sender; requires allowance from `msg.sender` to this contract.
            t.safeTransferFrom(msg.sender, r, a);
            
            emit T(l, n, r, a, d);
        }
    }

    /**
     * @notice Returns cumulative paid amount for (r, l).
     */
    function paidFor(
        uint256 l,
        address r
    ) external view returns (uint256) {
        PaymentInfo memory i = s[k(r, l)];
        return i.p;
    }

    /**
     * @notice Returns current nonce for (r, l).
     */
    function getNonce(
        uint256 l,
        address r
    ) external view returns (uint256) {
        return uint256(s[k(r, l)].n);
    }
}
