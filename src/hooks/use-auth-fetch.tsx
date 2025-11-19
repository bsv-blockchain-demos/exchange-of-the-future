import { AuthFetch, WalletInterface } from "@bsv/sdk";

export const useAuthFetch = (wallet: WalletInterface) => {
  const fetch = new AuthFetch(wallet);
  return fetch;
};