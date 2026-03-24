// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract EthRejector {
    error DontSendETH(); // DontSendETH
    fallback() external {
        revert DontSendETH(); 
    }

    receive() external payable {
        revert DontSendETH();
    }
}
