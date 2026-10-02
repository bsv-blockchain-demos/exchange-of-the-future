# BSV Swift Exchange API

Express and TypeScript API for the [BSV Swift Exchange demonstration](../README.md). It uses a server wallet for BRC-29 payments, BRC-103 request authentication, MongoDB for balances and identity-check records, and Yente for name screening.

## Setup

Run commands from the repository root. There is no separate backend package to install.

```sh
npm ci
cp .env.example .env
# Configure the wallet, MongoDB, Yente and frontend API origin.
npm run dev:server
```

See the [root configuration table](../README.md#run-locally) for the environment variables. The API defaults to port 3000 and initialises wallet storage and MongoDB before listening.

```sh
npm run build:server
npm run start:server
```

## Authentication

`createAuthMiddleware({ allowUnauthenticated: false })` is mounted before the routes. Use a wallet-aware client such as the frontend's `AuthFetch` integration. The identity comes from `req.auth.identityKey`; balance and withdrawal URLs do not take an identity or amount as path parameters.

This also applies to `/health` and `/trustflow/*`. Vite provides an `/api` proxy during development, but the frontend constructs its requests from `VITE_API_BASE`. Set that value explicitly to your API origin or a suitable proxy base.

## Routes

| Method and path | Input | Result |
| --- | --- | --- |
| `GET /balance` | Authenticated identity | `{ serverIdentityKey, balance, usdBalance }` |
| `GET /transactions` | Authenticated identity | `{ transactions: [...] }`, up to 50 labelled wallet actions |
| `POST /deposit` | Payment token and demonstration certificate | `{ success, txid, depositAmount, newBalance, message }` |
| `POST /withdraw` | `{ amount }` in satoshis | `{ success, payment, amount, newBalance, txid }` |
| `POST /swap` | `{ direction, amount }` | `{ success, bsvBalance, usdBalance, direction }` |
| `GET /kyc/status` | Authenticated identity | Current stored verification status, or 404 if no record exists |
| `POST /trustflow/verify` | `{ authorization, signature }` | Screening result and demonstration certificate |
| `GET /trustflow/status/:serialNumber` | Certificate serial number | Certificate status |
| `POST /trustflow/revoke/:serialNumber` | Certificate serial number | Revocation result |
| `GET /health` | Authenticated request | `{ status, wallet, balanceStorage, timestamp }` |

### Deposits

The request contains:

```ts
{
  customInstructions: { derivationPrefix: string, derivationSuffix: string },
  transaction: number[], // Atomic BEEF bytes
  amount: number,
  certificate: KycCertificate
}
```

The route checks certificate subject, issuer, expiry and revocation status, then screens the supplied name. It derives the expected payment key, checks output 0, imports that output into the wallet, and credits its satoshi value to the ledger. The credited amount comes from the transaction, not the request's `amount` field.

### Withdrawals

The route checks the current balance, creates a payment to the authenticated identity, and then subtracts the amount from MongoDB. `payment` is an `InternalizeActionArgs` object containing transaction bytes and the BRC-29 remittance fields. The recipient must import it into their wallet.

### Swaps

`direction` is `bsv-to-usd` or `usd-to-bsv`. For BSV-to-USD, `amount` is in satoshis; for USD-to-BSV it is in simulated USD units. Both directions use the fixed demonstration rate of 25,000 USD per BSV. No fiat payment occurs.

### TrustFlow

`authorization` carries `type`, `subject`, `verifier`, `verifierName`, `officialName` and a Unix timestamp in seconds. The implementation checks identity, verifier and timestamp, but its separate signature check is a placeholder. Certificates expire after 24 hours. See the [implementation limitations](../README.md#current-limitations) before relying on this flow.

## Storage and transaction boundaries

`BalanceStorage` uses MongoDB's `balances` collection, with a unique index on `identityKey`. Individual balance changes use conditional updates and `$inc`. These updates do not form a transaction with wallet operations. There is no automatic reconciliation or deposit replay protection.

Identity-check records use `KycStorage`. Wallet history comes from wallet actions labelled with the authenticated identity key, rather than from the balance collection.

## Source map

- [`src/index.ts`](src/index.ts): middleware and exchange routes
- [`src/wallet.ts`](src/wallet.ts): wallet and remote storage setup
- [`src/storage.ts`](src/storage.ts): MongoDB balance operations
- [`src/kyc-storage.ts`](src/kyc-storage.ts): identity-check records
- [`src/trustflow/`](src/trustflow/): screening and demonstration certificate routes

## Licence

**Documented backend licence: MIT.** This is the declaration recorded in the backend documentation. No standalone licence file or package licence declaration is included in this repository. See the [repository licence section](../README.md#licence).
