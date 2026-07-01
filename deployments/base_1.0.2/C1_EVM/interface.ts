// Generated TypeScript Interface for C1Evm

export interface IC1Evm {
  getNonce(l2LinkedId: string): Promise<string>;
  paidFor(l2LinkedId: string, recipient: string): Promise<string>;
  transfer(l2LinkedId: string, maxPayment: string, maxNonce: string, recipient: string, data: string, fees: any): Promise<void>;
}
