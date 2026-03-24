// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./libraries/string.sol";

/**
 * @title PactSwapToken (deprecated)
 * @author PACTSWAP Team
 * @notice Governance token for the PACTSWAP platform with voting capabilities
 * @dev This contract extends ERC20Votes and ERC20Capped to provide governance functionality
 *      It allows token holders to create and vote on proposals to change the Coinweb fee address
 *      Token holders can also burn their tokens to redeem PACTSWAP fees in CWEB on the Coinweb chain
 */
contract PactSwapToken_deprecated is ERC20Votes, ERC20Capped {
  /**
   * @notice The current Coinweb fee address
   * @dev This address is updated when a proposal is successful
   */
  bytes32 public COINWEB_FEE_ADDRESS;

  /// @notice The total number of proposals
  uint public proposalCount;

  /// @notice The official record of all proposals ever proposed
  mapping (uint => Proposal) public proposals;

  /**
   * @notice The number of votes in support of a proposal required for a quorum
   * @dev Set to 50% of the total supply, which means that proposals need majority support
   * @return The number of votes required for a quorum
   */
  function quorumVotes() public view returns (uint) { return totalSupply() / 2; } // 50%

  /**
   * @notice The number of votes required in order for a voter to become a proposer
   * @dev Set to 1 PACTSWAP token (1e18 wei)
   * @return The threshold for becoming a proposer
   */
  function proposalThreshold() public pure returns (uint) { return 1e18; } // 1

  /**
   * @notice Get a voter for a proposal
   * @param proposalId The id of the proposal
   * @param voter The address of the voter
   * @return Voter struct containing voting details for the specified voter
   */
  function getVoter(uint256 proposalId, address voter) public view returns (Voter memory) {
    Proposal storage proposal = proposals[proposalId];
    return proposal.voters[voter];
  }
  
  /**
   * @notice Constructor for PactSwapToken
   * @dev Sets up the token with name, symbol, cap, and initial Coinweb fee address
   * @param name The name of the token
   * @param symbol The symbol of the token
   * @param cap The maximum supply cap for the token
   * @param coinwebFeeAddress The initial Coinweb fee address
   */
  constructor(
    string memory name, 
    string memory symbol, 
    uint256 cap,
    bytes32 coinwebFeeAddress
  ) 
    ERC20(name, symbol)
    ERC20Capped(cap)
    EIP712(name, "1")
  {
    _mint(msg.sender, cap);
    COINWEB_FEE_ADDRESS = coinwebFeeAddress;
  }

    // ------------------------------------------------------------------------
    // EVENTS
    // ------------------------------------------------------------------------
    /// @notice Emitted when a new proposal is created
    /// @param proposer The address of the proposer
    /// @param newFeeAddress The new fee address
    /// @param description The description of the proposal
    event NewProposal(
        address indexed proposer,
        bytes32 newFeeAddress,
        string description
    );

    /// @notice Emitted when a user burns their tokens and redeems them
    /// @param from The evm address of the user
    /// @param receiver The coinweb address of the receiver
    /// @param amount The amount of tokens to burn
    /// @param amountBeforeBurn The amount of tokens before burn
    event BurnWithRedeem(
      address indexed from, 
      bytes receiver, 
      uint256 amount, 
      uint256 amountBeforeBurn
    );

    /// @notice Emitted when a user votes on a proposal
    /// @param voter The address of the voter
    /// @param proposalId The id of the proposal
    /// @param support The support of the vote
    /// @param votes The number of votes the voter had
    event Vote(
      address indexed voter,
      uint256 proposalId,
      bool support,
      uint256 votes
    );

    /// @notice Emitted when a proposal is succeeded
    /// @param proposalId The id of the proposal
    event ProposalSucceeded(uint256 proposalId);

    /// @notice Emitted when a proposal is defeated
    /// @param proposalId The id of the proposal
    event ProposalDefeated(uint256 proposalId);

    /// @notice Emitted when a proposal is canceled
    /// @param proposalId The id of the proposal
    event ProposalCanceled(uint256 proposalId);

    /// @notice Emitted when a proposal is closed
    /// @param proposalId The id of the proposal
    /// @param result The result of the proposal
    event ProposalClosed(uint256 proposalId, bool result);

    /// @notice Emitted when the coinweb fee address is updated
    /// @param newFeeAddress The new fee address
    /// @param oldFeeAddress The previous fee address
    event CoinwebFeeAddressUpdated(bytes32 newFeeAddress, bytes32 oldFeeAddress);

    /// @notice Emitted when a user sends tokens to the Coinweb chain
    /// @param eventType The type of event that occurred when sending events to the Coinweb chain
    /// @param newFeeAddress The new fee address
    /// @param receiver The coinweb address of the receiver
    /// @param amount The amount of tokens to burn
    /// @param amountBeforeBurn The amount of tokens before burn
    event SendEventToCoinweb(
      SendToCoinwebEventType eventType,
      bytes32 newFeeAddress,
      bytes receiver, 
      uint256 amount,   
      uint256 amountBeforeBurn
    );

    /// @notice Emitted when a user receives tokens from the Coinweb chain
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // ENUMS
    // ------------------------------------------------------------------------
    /**
     * @notice The state of a proposal
     * @dev Used to track the lifecycle of a proposal
     */
    enum ProposalState {
        Active,    // Proposal is active and can be voted on
        Canceled,  // Proposal has been canceled by the proposer
        Defeated,  // Proposal has been defeated by votes
        Succeeded  // Proposal has succeeded and has been executed
    }

    /**
     * @notice The type of event that occurred when sending events to the Coinweb chain
     * @dev Used to track the type of event that occurred when sending events to the Coinweb chain
     */
    enum SendToCoinwebEventType {
      Burn,
      UpdateFeeAddress
    }
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // STRUCTS
    // ------------------------------------------------------------------------
    /**
     * @notice A proposal for changing the Coinweb fee address
     * @dev Contains all data related to a proposal including votes and state
     */
    struct Proposal {
        /// @notice The id of the proposal
        uint256 id;
        /// @notice The address of the proposer
        address proposer;
        /// @notice The new fee address
        bytes32 newFeeAddress;
        /// @notice The timestamp of the proposal
        uint256 timestamp;
        /// @notice The state of the proposal
        ProposalState state;
        /// @notice The description of the proposal
        string description;
        /// @notice The number of votes for the proposal
        uint256 votesFor;
        /// @notice The number of votes against the proposal
        uint256 votesAgainst;
        /// @notice The voters of the proposal
        mapping (address => Voter) voters;
    }

    /**
     * @notice A voter record for a proposal
     * @dev Contains information about a voter's vote on a proposal
     */
    struct Voter {
        /// @notice Whether or not a vote has been cast
        bool hasVoted;

        /// @notice Whether or not the voter supports the proposal
        bool support;

        /// @notice The number of votes the voter had, which were cast
        uint96 votes;
    }
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // ERRORS
    // ------------------------------------------------------------------------
    /// @notice The error thrown when a user does not have enough power to propose
    /// @param power The voting power of the user
    /// @param threshold The required threshold to propose
    error NotEnoughPowerToPropose(uint256 power, uint256 threshold);
    
    /// @notice The error thrown when a proposal is already active
    error ProposalAlreadyActive();
    
    /// @notice The error thrown when a description is too long
    error DescriptionTooLong(uint256 providedDescriptionLength, uint256 maxDescriptionLength);
    
    /// @notice The error thrown when a proposal is not active
    error ProposalNotActive();
    
    /// @notice The error thrown when a voter has already voted
    error VoterAlreadyVoted();
    
    /// @notice The error thrown when a user is not the proposer
    error NotProposer();
    
    /// @notice The error thrown when a user has no votes
    error NoVotes();

    /// @notice The error thrown when a zero address is used
    error ZeroAddress();

    /// @notice The error thrown when a fee address is invalid
    error InvalidFeeAddress(uint256 providedAddressLength, uint256 expectedAddressLength);
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // FUNCTIONS PUBLIC
    // ------------------------------------------------------------------------
    /**
     * @notice Make a proposal to change the Coinweb fee address
     * @dev Creates a new proposal if the caller has enough voting power
     * @param newFeeAddress The proposed new fee address
     * @param description The description of the proposal (limited to 100 bytes)
     */
    function makeProposal(
        bytes32 newFeeAddress,
        string memory description
    ) public {
      if (StringUtils.strlen(description) > 100) {
        revert DescriptionTooLong(StringUtils.strlen(description), 100);
      }

      uint256 power = getVotes(msg.sender);
      if (power < proposalThreshold()) {
        revert NotEnoughPowerToPropose(power, proposalThreshold());
      }

      proposalCount++;
      uint proposalId = proposalCount;

      Proposal storage newProposal = proposals[proposalId];
        // This should never happen but add a check in case.
      require(newProposal.id == 0, "ProposalID collision");
      newProposal.id = proposalId;
      newProposal.proposer = msg.sender;
      newProposal.newFeeAddress = newFeeAddress;
      newProposal.timestamp = block.timestamp;
      newProposal.state = ProposalState.Active;
      newProposal.description = description;
      newProposal.votesFor = 0;
      newProposal.votesAgainst = 0;

      emit NewProposal(msg.sender, newFeeAddress, description);
    }

    /**
     * @notice Vote on a proposal
     * @dev Cast a vote on a proposal, potentially causing it to succeed or be defeated
     * @param proposalId The id of the proposal to vote on
     * @param support Whether the vote is in support of the proposal (true) or against it (false)
     */
    function vote(uint256 proposalId, bool support) public {
      if (msg.sender == address(0)) {
        revert ZeroAddress();
      }

      Proposal storage proposal = proposals[proposalId];

      if (proposal.state != ProposalState.Active) {
        revert ProposalNotActive();
      }

      Voter storage voter = proposal.voters[msg.sender];

      if (voter.hasVoted) {
        revert VoterAlreadyVoted();
      }

      uint256 votes = getVotes(msg.sender);

      if (votes == 0) {
        revert NoVotes();
      }

      if (support) {
        proposal.votesFor += votes;
      } else {
        proposal.votesAgainst += votes;
      }

      voter.hasVoted = true;
      voter.support = support;
      voter.votes = uint96(votes);

      emit Vote(msg.sender, proposalId, support, voter.votes);

      if (proposal.votesFor > proposal.votesAgainst && proposal.votesFor >= quorumVotes()) {
        proposal.state = ProposalState.Succeeded;
        emit ProposalSucceeded(proposalId);
        emit ProposalClosed(proposalId, true);

        bytes32 oldFeeAddress = COINWEB_FEE_ADDRESS;
        COINWEB_FEE_ADDRESS = proposal.newFeeAddress;
        emit CoinwebFeeAddressUpdated(proposal.newFeeAddress, oldFeeAddress);
        emit SendEventToCoinweb(
          SendToCoinwebEventType.UpdateFeeAddress, 
          proposal.newFeeAddress, 
          bytes(""), 
          0, 
          0
        );
      } else if (proposal.votesFor < proposal.votesAgainst && proposal.votesAgainst >= quorumVotes()) {
        proposal.state = ProposalState.Defeated;
        emit ProposalDefeated(proposalId);
        emit ProposalClosed(proposalId, false);
      }
    }

    /**
     * @notice Cancel a proposal
     * @dev Allows the original proposer to cancel an active proposal
     * @param proposalId The id of the proposal to cancel
     */
    function cancelProposal(uint256 proposalId) public {
      Proposal storage proposal = proposals[proposalId];
      if (proposal.proposer != msg.sender) {
        revert NotProposer();
      }

      if (proposal.state != ProposalState.Active) {
        revert ProposalNotActive();
      }

      proposal.state = ProposalState.Canceled;
      emit ProposalCanceled(proposalId);
      emit ProposalClosed(proposalId, false);
    }

    /**
     * @notice Burn tokens and redeem PACTSWAP fees in CWEB on the Coinweb chain
     * @dev Burns the specified amount of tokens from the caller and emits an event for cross-chain redemption
     * @param amount The amount of tokens to burn
     * @param receiver The coinweb address of the receiver
     */
    function burnWithRedeem(uint256 amount, bytes calldata receiver) public {
      uint256 amountBeforeBurn = totalSupply();
      _burn(msg.sender, amount);
      emit BurnWithRedeem(msg.sender, receiver, amount, amountBeforeBurn);
      emit SendEventToCoinweb(
          SendToCoinwebEventType.Burn, 
          bytes32(0), 
          receiver, 
          amount, 
          amountBeforeBurn
        );
    }
    // ------------------------------------------------------------------------

    // ------------------------------------------------------------------------
    // FUNCTIONS INTERNAL
    // ------------------------------------------------------------------------
    /**
     * @notice Override _update function to resolve diamond inheritance issue
     * @dev This override is necessary because both parent contracts override this function
     * @param from The address to transfer from
     * @param to The address to transfer to
     * @param value The amount to transfer
     */
    function _update(
      address from,
      address to,
      uint256 value
    ) internal override(ERC20Votes, ERC20Capped) {
      super._update(from, to, value);
    }
    // ------------------------------------------------------------------------
}