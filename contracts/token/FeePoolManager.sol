// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./interfaces/IFeePoolManager.sol";

/**
 * @title Fee Pool Manager
 * @author PACTSWAP Team
 * @notice Manages fee pool operations for the PACTSWAP platform
 * @dev This contract handles token burning for cross-chain redemption and manages
 *      the Coinweb fee address. It allows users to burn PACTSWAP tokens and redeem
 *      them as CWEB on the Coinweb chain, while maintaining the fee pool configuration.
 *
 * Trust / responsibility split:
 * - This contract does not mint/bridge assets on Coinweb. It only:
 *   - burns `pactswapToken` on EVM
 *   - emits events consumed by Coinweb L2 chain
 * - Correctness of the cross-chain mint/redeem process depends on external infrastructure.
 */
contract FeePoolManager is IFeePoolManager {
    /**
     * @notice SafeERC20 library
     * @dev Used to safely transfer ERC20 tokens
     */
    using SafeERC20 for ERC20Burnable;

    /// @notice ERC20Burnable token that is burned for cross-chain redemption.
    /// @dev `burnFrom` requires allowance to this contract.
    ERC20Burnable public immutable pactswapToken; // pactswap token

    /**
     * @notice The current Coinweb fee address
     * @dev A Coinweb-specific address format stored as bytes32 (not an EVM address).
     */
    bytes32 public COINWEB_FEE_ADDRESS;

    /**
     * @notice The admin address
     * @dev Admin is set once in the constructor and can be rotated via `updateAdmin`.
     */
    address public admin;

    /**
     * @notice Modifier to check if the caller is the admin
     */
    modifier onlyAdmin {
      if(msg.sender != admin) revert NotAdmin();
      _;
    }

    /**
     * @notice Constructor for Pactswap Fee Pool Manager
     * @dev Initializes the contract with the PACTSWAP token and Coinweb fee address
     * @param _pactswapToken The PACTSWAP token contract address
     * @param coinwebFeeAddress The initial Coinweb fee address for cross-chain operations
     */
    constructor(ERC20Burnable _pactswapToken, bytes32 coinwebFeeAddress) {
      if(address(_pactswapToken) == address(0)) revert ZeroAddress();
      pactswapToken = _pactswapToken;
      COINWEB_FEE_ADDRESS = coinwebFeeAddress;
      admin = msg.sender;
      emit AdminUpdated(msg.sender);
    }

    // ------------------------------------------------------------------------
    // FUNCTIONS PUBLIC
    // ------------------------------------------------------------------------
    /**
     * @notice Burn PACTSWAP tokens and redeem them as CWEB on the Coinweb chain
     * @dev
     * - Burns the specified amount of PACTSWAP tokens from the caller (requires allowance).
     * - Emits `BurnWithRedeem` for EVM-side indexing and `SendEventToCoinweb` for cross-chain consumers.
     * - Captures `amountBeforeBurn` as the total supply snapshot prior to burning.
     * @param amount The amount of PACTSWAP tokens to burn
     * @param receiver The Coinweb address that will receive the redeemed CWEB
     */
    function burnWithRedeem(uint256 amount, string calldata receiver) public {
      uint256 amountBeforeBurn = pactswapToken.totalSupply();
      pactswapToken.burnFrom(msg.sender, amount);
      emit BurnWithRedeem(msg.sender, receiver, amount, amountBeforeBurn);
      emit SendEventToCoinweb(
          SendToCoinwebEventType.Burn, 
          bytes32(0), 
          receiver, 
          amount, 
          amountBeforeBurn
        );
    }

    /**
     * @notice Update the Coinweb fee address
     * @dev
     * - Only callable by `admin`.
     * - Emits an on-chain update event and an additional cross-chain event.
     * @param newFeeAddress The new Coinweb fee address
     */
    function updateFeeAddress(bytes32 newFeeAddress) public onlyAdmin {
      bytes32 oldFeeAddress = COINWEB_FEE_ADDRESS;
      COINWEB_FEE_ADDRESS = newFeeAddress;
      emit CoinwebFeeAddressUpdated(newFeeAddress, oldFeeAddress);
      emit SendEventToCoinweb(
          SendToCoinwebEventType.UpdateFeeAddress, 
          newFeeAddress, 
          "", 
          0, 
          0
      );
    }

    /**
     * @notice Update the admin address
     * @dev
     * - Only callable by the current `admin`.
     * - This function intentionally does not enforce `newAdmin != address(0)`;
     *   setting to zero would effectively disable admin-only functions.
     * @param newAdmin The new admin address
     */
    function updateAdmin(address newAdmin) public onlyAdmin {
      admin = newAdmin;
      emit AdminUpdated(newAdmin);
    }
    // ------------------------------------------------------------------------
}