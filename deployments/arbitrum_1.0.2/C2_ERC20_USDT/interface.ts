// Generated TypeScript Interface for C2Erc20Bep20

export interface IC2Erc20Bep20 {
  getNonce(l: string, r: string): Promise<string>;
  paidFor(l: string, r: string): Promise<string>;
  t(): Promise<string>;
  transfer(l: string, m: string, r: string, a: string, d: string): Promise<void>;
}
