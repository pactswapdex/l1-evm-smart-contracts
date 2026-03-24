// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title Fee Pool Manager
 * @author PACTSWAP Team
 * @notice Manages fee pool operations for the PACTSWAP platform
 * @dev This contract handles token burning for cross-chain redemption and manages
 *      the Coinweb fee address. It allows users to burn PACTSWAP tokens and redeem
 *      them as CWEB on the Coinweb chain, while maintaining the fee pool configuration.
 *
 * @dev This interface focuses on cross-chain relevant functions/events.
 */
interface IFeePoolManager {
    /**
     * @notice Burn PACTSWAP tokens and redeem them as CWEB on the Coinweb chain
     * @dev Emits `BurnWithRedeem` and `SendEventToCoinweb`.
     * @param amount The amount of PACTSWAP tokens to burn
     * @param receiver The Coinweb address that will receive the redeemed CWEB
     */
    function burnWithRedeem(uint256 amount, string calldata receiver) external;

    /**
     * @notice Update the Coinweb fee address
     * @dev Expected to be admin-gated in the implementation.
     * @param newFeeAddress The new Coinweb fee address
     */
    function updateFeeAddress(bytes32 newFeeAddress) external;

    // EVENTS
    // ------------------------------------------------------------------------
    /// @notice Emitted when a user burns their PACTSWAP tokens for cross-chain redemption
    /// @param from The EVM address of the user burning tokens
    /// @param receiver The Coinweb address that will receive the redeemed CWEB
    /// @param amount The amount of PACTSWAP tokens burned
    /// @param amountBeforeBurn The total supply of PACTSWAP tokens before burning
    event BurnWithRedeem(
      address indexed from, 
      string receiver, 
      uint256 amount, 
      uint256 amountBeforeBurn
    );

    /// @notice Emitted when the Coinweb fee address is updated
    /// @param newFeeAddress The new Coinweb fee address
    /// @param oldFeeAddress The previous Coinweb fee address
    event CoinwebFeeAddressUpdated(bytes32 newFeeAddress, bytes32 oldFeeAddress);

    /// @notice Emitted when cross-chain events are sent to the Coinweb chain
    /// @param eventType The type of cross-chain event (Burn or UpdateFeeAddress)
    /// @param newFeeAddress The new fee address (only relevant for UpdateFeeAddress events)
    /// @param receiver The Coinweb address of the receiver (only relevant for Burn events)
    /// @param amount The amount of tokens burned (only relevant for Burn events)
    /// @param amountBeforeBurn The total supply before burning (only relevant for Burn events)
    event SendEventToCoinweb(
      SendToCoinwebEventType eventType,
      bytes32 newFeeAddress,
      string receiver, 
      uint256 amount,   
      uint256 amountBeforeBurn
    );

    /// @notice Emitted when the admin address is updated
    /// @param newAdmin The new admin address
    event AdminUpdated(address newAdmin);

    // ------------------------------------------------------------------------
    // ENUMS
    // ------------------------------------------------------------------------
    /**
     * @notice The type of cross-chain event sent to the Coinweb chain
     * @dev Used to categorize different types of cross-chain operations
     */
    enum SendToCoinwebEventType {
      Burn,
      UpdateFeeAddress
    }
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // ERRORS
    // ------------------------------------------------------------------------
    /// @notice The error thrown when a zero address is used
    error ZeroAddress();

    /// @notice The error thrown when the caller is not the admin
    error NotAdmin();
    // ------------------------------------------------------------------------
}