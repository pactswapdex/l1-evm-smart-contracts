// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ReentrancyAttackers
 * @notice Malicious contracts for testing reentrancy protection in C1/C2 contracts
 */

interface IC1Evm {
    struct Fee {
        address payable recipient;
        uint256 amount;
    }

    function transfer(
        uint256 l2LinkedId,
        uint256 maxPayment,
        uint256 maxNonce,
        address payable recipient,
        bytes calldata data,
        Fee[] calldata fees
    ) external payable;
}

interface IC2Evm {
    function transfer(
        uint256 l,
        uint256 m,
        address payable r
    ) external payable;
}

/**
 * @title MaliciousLP
 * @notice Attempts reentrancy attack on C1 contract (User → LP payments)
 */
contract MaliciousLP {
    IC1Evm public c1Contract;
    uint256 public l2LinkedId;
    uint256 public maxPayment;
    uint256 public maxNonce;
    uint256 public attackAmount;
    
    uint256 public attackAttempts;
    uint256 public successfulAttacks;
    bool public isAttacking;
    
    event AttackAttempted(uint256 attempt, bool success);
    event AttackFailed(string reason);
    
    constructor(address _c1Contract) {
        c1Contract = IC1Evm(_c1Contract);
    }
    
    function setupAttack(
        uint256 _l2LinkedId,
        uint256 _maxPayment,
        uint256 _maxNonce,
        uint256 _attackAmount
    ) external {
        l2LinkedId = _l2LinkedId;
        maxPayment = _maxPayment;
        maxNonce = _maxNonce;
        attackAmount = _attackAmount;
        attackAttempts = 0;
        successfulAttacks = 0;
        isAttacking = false;
    }
    
    function enableAttack() external {
        isAttacking = true;
    }
    
    function disableAttack() external {
        isAttacking = false;
    }
    
    receive() external payable {
        if (isAttacking && attackAttempts == 0) {
            attackAttempts++;
            
            try c1Contract.transfer{value: attackAmount}(
                l2LinkedId,
                maxPayment,
                maxNonce,
                payable(address(this)),
                "",
                new IC1Evm.Fee[](0)
            ) {
                successfulAttacks++;
                emit AttackAttempted(attackAttempts, true);
            } catch Error(string memory reason) {
                emit AttackFailed(reason);
                emit AttackAttempted(attackAttempts, false);
            } catch {
                emit AttackFailed("Unknown error");
                emit AttackAttempted(attackAttempts, false);
            }
        }
    }
    
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}

/**
 * @title MaliciousUser
 * @notice Attempts reentrancy attack on C2 contract (LP → User settlements)
 */
contract MaliciousUser {
    IC2Evm public c2Contract;
    address public lpAddress;
    uint256 public l2LinkedId;
    uint256 public maxPayment;
    uint256 public attackAmount;
    
    uint256 public attackAttempts;
    uint256 public successfulAttacks;
    bool public isAttacking;
    
    event AttackAttempted(uint256 attempt, bool success);
    event AttackFailed(string reason);
    
    constructor(address _c2Contract) {
        c2Contract = IC2Evm(_c2Contract);
    }
    
    function setupAttack(
        address _lpAddress,
        uint256 _l2LinkedId,
        uint256 _maxPayment,
        uint256 _attackAmount
    ) external {
        lpAddress = _lpAddress;
        l2LinkedId = _l2LinkedId;
        maxPayment = _maxPayment;
        attackAmount = _attackAmount;
        attackAttempts = 0;
        successfulAttacks = 0;
        isAttacking = false;
    }
    
    function enableAttack() external {
        isAttacking = true;
    }
    
    function disableAttack() external {
        isAttacking = false;
    }
    
    receive() external payable {
        if (isAttacking && attackAttempts == 0) {
            attackAttempts++;
            emit AttackAttempted(attackAttempts, false);
        }
    }
    
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}

/**
 * @title MultipleReentrancyAttacker
 * @notice Attempts multiple reentrancy attacks in succession
 */
contract MultipleReentrancyAttacker {
    IC1Evm public c1Contract;
    uint256 public l2LinkedId;
    uint256 public maxPayment;
    uint256 public maxNonce;
    uint256 public attackAmount;
    uint256 public maxAttempts;
    
    uint256 public attackAttempts;
    uint256 public successfulAttacks;
    
    event AttackAttempted(uint256 attempt, bool success);
    
    constructor(address _c1Contract) {
        c1Contract = IC1Evm(_c1Contract);
    }
    
    function setupAttack(
        uint256 _l2LinkedId,
        uint256 _maxPayment,
        uint256 _maxNonce,
        uint256 _attackAmount,
        uint256 _maxAttempts
    ) external {
        l2LinkedId = _l2LinkedId;
        maxPayment = _maxPayment;
        maxNonce = _maxNonce;
        attackAmount = _attackAmount;
        maxAttempts = _maxAttempts;
        attackAttempts = 0;
        successfulAttacks = 0;
    }
    
    receive() external payable {
        if (attackAttempts < maxAttempts) {
            attackAttempts++;
            
            try c1Contract.transfer{value: attackAmount}(
                l2LinkedId,
                maxPayment,
                maxNonce,
                payable(address(this)),
                "",
                new IC1Evm.Fee[](0)
            ) {
                successfulAttacks++;
                emit AttackAttempted(attackAttempts, true);
            } catch {
                emit AttackAttempted(attackAttempts, false);
            }
        }
    }
    
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}
