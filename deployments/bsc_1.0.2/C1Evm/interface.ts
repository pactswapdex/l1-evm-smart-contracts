// Generated TypeScript Interface for C1Evm

export interface IC1Evm {
  paidFor(l: string, r: string): Promise<string>;
  transfer(l: string, m: string, r: string, d: string): Promise<void>;
}
