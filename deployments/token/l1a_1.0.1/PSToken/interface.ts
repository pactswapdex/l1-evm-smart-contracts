// Generated TypeScript Interface for PSToken

export interface IPSToken {
  CLOCK_MODE(): Promise<string>;
  COINWEB_FEE_ADDRESS(): Promise<string>;
  allowance(owner: string, spender: string): Promise<string>;
  approve(spender: string, value: string): Promise<boolean>;
  balanceOf(account: string): Promise<string>;
  burnWithRedeem(amount: string, receiver: string): Promise<void>;
  cancelProposal(proposalId: string): Promise<void>;
  cap(): Promise<string>;
  checkpoints(account: string, pos: string): Promise<any>;
  clock(): Promise<string>;
  decimals(): Promise<string>;
  delegate(delegatee: string): Promise<void>;
  delegateBySig(delegatee: string, nonce: string, expiry: string, v: string, r: string, s: string): Promise<void>;
  delegates(account: string): Promise<string>;
  eip712Domain(): Promise<string | string | string | string | string | string | string>;
  getPastTotalSupply(timepoint: string): Promise<string>;
  getPastVotes(account: string, timepoint: string): Promise<string>;
  getVoter(proposalId: string, voter: string): Promise<any>;
  getVotes(account: string): Promise<string>;
  makeProposal(newFeeAddress: string, description: string): Promise<void>;
  name(): Promise<string>;
  nonces(owner: string): Promise<string>;
  numCheckpoints(account: string): Promise<string>;
  proposalCount(): Promise<string>;
  proposalThreshold(): Promise<string>;
  proposals(: string): Promise<string | string | string | string | string | string | string | string>;
  quorumVotes(): Promise<string>;
  symbol(): Promise<string>;
  totalSupply(): Promise<string>;
  transfer(to: string, value: string): Promise<boolean>;
  transferFrom(from: string, to: string, value: string): Promise<boolean>;
  vote(proposalId: string, support: boolean): Promise<void>;
}
