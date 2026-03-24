// Generated TypeScript Interface for C1Erc20Bep20

export interface IC1Erc20Bep20 {
  getNonce(l2LinkedId: string): Promise<string>;
  paidFor(l2LinkedId: string, recipient: string): Promise<string>;
  token(): Promise<string>;
  transfer(
    l2LinkedId: string,
    maxPayment: string,
    maxNonce: string,
    recipient: string,
    amount: string,
    data: string,
    fees: any
  ): Promise<void>;
}
