// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title C2Evm
 * @notice Minimal ETH transfer helper with per-(recipient, l2LinkedId) accounting.
 * @dev
 *  - The contract accepts ETH and forwards it to `r` via `call`.
 *  - Per recipient + L2 identifier, it tracks:
 *    - total paid amount (`p`, uint96)
 *    - a monotonically increasing nonce (`n`, uint32)
 *
 *  Design notes:
 *  - Mapping key is `keccak256(abi.encode(r, l))` (implemented in assembly for gas).
 *  - State is updated before the external ETH transfer to reduce reentrancy risk.
 *  - `m` is an upper bound on the cumulative amount paid for a given (r, l) key.
 */
contract C2Evm is ReentrancyGuard {
    /// @notice Recipient is zero address or this contract.
    error E1(); // InvalidRecipient
    /// @notice Sent ETH is below the minimum payment.
    error E2(); // PaymentTooLow
    /// @notice Cumulative paid amount would exceed `m`.
    error E3(); // Overpayment
    /// @notice Low-level ETH transfer failed.
    error E4(); // TransferFailed

    /**
     * @notice Emitted after a successful transfer.
     * @dev `n` is the pre-increment nonce (i.e. current nonce before this transfer).
     * @param l L2 linked identifier.
     * @param n Nonce (monotonically increasing per (r, l)).
     * @param r Recipient that received ETH.
     * @param a Amount of ETH forwarded for this call (`msg.value`).
     * @param d Additional data for L2 / off-chain processing.
     */
    event T( // Transfer event with shortened name
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
    mapping(bytes32 => PaymentInfo) private s; // alreadyPaid with shortened name

    /// @dev Minimum accepted payment in wei. Enforced per call (not cumulative).
    uint256 private constant M = 1; // MIN_PAYMENT

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
     * @notice Forward ETH to `r` while enforcing cumulative max `m` per (r, l).
     * @dev
     *  - Updates accounting before the external call to `r`.
     *  - `m` is checked against the cumulative paid amount for (r, l), not just this call.
     *  - Reentrancy: the external call happens after state update; a reentrant call
     *    will observe the updated state and cannot bypass the `m` bound.
     *
     * @param l L2 linked identifier for off-chain / cross-chain correlation.
     * @param m Maximum allowed cumulative paid for this (r, l).
     * @param r Recipient of the ETH.
     * @param d Additional data for L2 / off-chain processing.
     */
    function transfer(
        uint256 l,        // l2LinkedId
        uint256 m,        // maxAllowedPayment
        address payable r, // recipient
        bytes calldata d  // data
    ) external payable nonReentrant {
        if (r == address(0) || r == address(this)) revert E1();
        if (msg.value < M) revert E2();

        bytes32 x = k(r, l);
        PaymentInfo storage i = s[x];
        
        unchecked {
            uint256 p = uint256(i.p) + msg.value;
            if (p > m) revert E3();
            
            uint256 n = i.n;
            uint256 newNonce = n + 1;
            
            assembly {
                // We intentionally build the packed slot from scratch:
                // [0..95]=p, [96..127]=newNonce. Remaining bits are zeroed/reserved.
                let slot := sload(i.slot)
                slot := 0
                slot := or(slot, p)
                slot := or(slot, shl(96, newNonce))
                sstore(i.slot, slot)
            }
            
            assembly {
                if iszero(call(gas(), r, callvalue(), 0, 0, 0, 0)) {
                    mstore(0x00, 0xf67db1ed) // E4 selector
                    revert(0x00, 0x04)
                }
            }
            
            emit T(l, n, r, msg.value, d);
        }
    }

    /**
     * @notice Returns cumulative paid amount for (r, l).
     * @dev Value is stored as uint96 and returned as uint256.
     */
    function paidFor(
        uint256 l,
        address r
    ) external view returns (uint256) {
        return uint256(s[k(r, l)].p);
    }

    /**
     * @notice Returns current nonce for (r, l).
     * @dev The next successful transfer will emit the current nonce and then increment it.
     */
    function getNonce(
        uint256 l,
        address r
    ) external view returns (uint256) {
        return uint256(s[k(r, l)].n);
    }
}
