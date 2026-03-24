// Generated TypeScript Interface for PSToken

export interface IPSToken {
  DOMAIN_SEPARATOR(): Promise<string>;
  allowance(owner: string, spender: string): Promise<string>;
  approve(spender: string, value: string): Promise<boolean>;
  balanceOf(account: string): Promise<string>;
  decimals(): Promise<string>;
  eip712Domain(): Promise<string | string | string | string | string | string | string>;
  name(): Promise<string>;
  nonces(owner: string): Promise<string>;
  permit(
    owner: string,
    spender: string,
    value: string,
    deadline: string,
    v: string,
    r: string,
    s: string
  ): Promise<void>;
  symbol(): Promise<string>;
  totalSupply(): Promise<string>;
  transfer(to: string, value: string): Promise<boolean>;
  transferFrom(from: string, to: string, value: string): Promise<boolean>;
}
