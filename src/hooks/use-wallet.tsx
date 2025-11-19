import { WalletClient } from "@bsv/sdk";

export const useWallet = () => {
  const wallet = new WalletClient();
  return { wallet };
};