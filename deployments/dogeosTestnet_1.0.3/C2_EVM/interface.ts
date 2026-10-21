// Generated TypeScript Interface for C2Evm

export interface IC2Evm {
  getNonce(l: string, r: string): Promise<string>;
  paidFor(l: string, r: string): Promise<string>;
  transfer(e: string, l: string, m: string, r: string, d: string): Promise<void>;
}
