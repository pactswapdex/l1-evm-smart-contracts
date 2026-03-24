// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title PactSwapToken
 * @author PACTSWAP Team
 * @notice ERC20 token for the PACTSWAP platform with burn functionality
 * @dev This contract extends ERC20Permit to provide basic token functionality
 *      with permit capabilities for gasless approvals and burn functionality
 *
 * Deployment notes:
 * - Entire `cap` is minted once to the deployer in the constructor.
 * - Burning is enabled via `ERC20Burnable`.
 * - Permit (EIP-2612) is enabled via `ERC20Permit`.
 */
contract PactSwapToken is ERC20Permit, ERC20Burnable {
    /**
     * @notice Deploy token and mint initial supply to deployer.
     * @param name ERC20 token name (also used for the EIP-712 domain separator in permit).
     * @param symbol ERC20 token symbol.
     * @param cap Initial supply minted to `msg.sender`.
     */
    constructor(
        string memory name, 
        string memory symbol, 
        uint256 cap
    ) 
        ERC20(name, symbol)
        ERC20Permit(name)
        ERC20Burnable()
    {
        _mint(msg.sender, cap);
    }
}