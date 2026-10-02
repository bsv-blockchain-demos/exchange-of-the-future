# BSV Swift Exchange

A BSV wallet and exchange demonstration built with React, Express, TypeScript and MongoDB. Users connect a BRC-100 wallet, complete a demonstration identity check, deposit BSV, swap between BSV and a simulated USD balance, and withdraw to their wallet.

The USD balance is an internal ledger entry. The conversion rate is fixed in the code at 25,000 USD per BSV; there is no market feed, fiat settlement or bank integration. BSV deposits, withdrawals and certificate anchors use actual wallet transactions.

## Components

| Component | Location | Purpose |
| --- | --- | --- |
| Web application | `src/` | Wallet connection, identity check, balances, payments and transaction history |
| API | `server/src/` | BRC-103 authentication, BRC-29 payments and balance management |
| TrustFlow demo | `server/src/trustflow/` | Self-declared name screening and demonstration certificates |
| MongoDB | External service | Balance ledger and identity-check records |
| Wallet storage | External service | Server wallet state through `@bsv/wallet-toolbox` |
| OpenSanctions services | Compose services or external deployment | Yente name matching backed by Elasticsearch |

## Run locally

Use Node.js 22.12+, npm, MongoDB and a BRC-100 wallet. The backend also needs a wallet storage service and a dedicated server wallet on the chosen BSV network. Fund that wallet for certificate anchors and withdrawals.

```sh
git clone https://github.com/bsv-blockchain-demos/exchange-of-the-future.git
cd exchange-of-the-future
npm ci
cp .env.example .env
```

Configure `.env` before starting:

| Variable | Purpose |
| --- | --- |
| `PRIVATE_KEY` | Server wallet private key in hex. Keep this server-side. |
| `CHAIN` | `main` or `test`; match the client wallet and storage service. |
| `STORAGE_URL` | Wallet storage provider URL. |
| `MONGODB_URI` | Database URI, including a database name, for example `mongodb://localhost:27017/bsv_exchange`. |
| `PORT` | API port, default `3000`. |
| `VITE_API_BASE` | Browser-reachable API origin, for example `http://localhost:3000`. Required by the frontend API client. |
| `YENTE_URL` | Name-screening service origin, default `http://localhost:8000`. |

The frontend build embeds `VITE_API_BASE`. Restart Vite or rebuild after changing it. Do not expose the server private key through a `VITE_` variable.

```sh
npm run dev:all
```

Open [localhost:8080](http://localhost:8080). The API listens on port 3000. `npm run dev` starts only the frontend; `npm run dev:server` starts only the backend. MongoDB, wallet storage and Yente must be available separately.

### Docker Compose

The Compose file starts the frontend, API, MongoDB, nginx, Yente and Elasticsearch:

```sh
docker compose up -d --build
docker compose logs -f backend
```

Before running it, configure the wallet variables in `.env` and replace the checked-in OpenSanctions service token settings with credentials for your own deployment. The frontend build argument currently points to `http://localhost:3000`; change it to the browser-reachable API origin for remote hosting.

The website is exposed on port 8080 and the API on 3000. Use `docker compose down` to stop the stack. Adding `-v` removes its stored database and search-index data.

## Try the workflow

1. Connect a compatible wallet on the same network as the server.
2. Submit a name through the identity-check screen. The server checks Yente and creates a short-lived demonstration certificate, with an on-chain revocation anchor when wallet funding permits.
3. Deposit a small amount of BSV. The server imports output 0 of the supplied transaction and credits the MongoDB balance.
4. Swap part of the balance to simulated USD, then swap it back.
5. Withdraw BSV. The server creates a BRC-29 payment and returns the data the client wallet needs to import it.

The [backend README](server/README.md) documents the implemented routes and response formats.

## Current limitations

- TrustFlow records a self-declared name and screening result. Its authorisation-signature check only checks that a supplied string is long enough; it does not verify that signature cryptographically.
- Demonstration certificates are created without a certificate signature. The deposit route checks supplied certificate fields but does not verify a certificate signature.
- Screening and revocation lookup errors can be treated as clear or not revoked. Certificate issuance can continue without an anchor if anchor creation fails.
- Revocation lookups use the mainnet WhatsOnChain endpoint even when `CHAIN=test`.
- Wallet transactions and MongoDB updates are separate operations. Withdrawals create the wallet action before debiting the ledger, and deposits have no transaction-ID replay guard. A database failure or repeat request therefore needs reconciliation.
- All routes, including `/health`, are registered behind authentication middleware. A plain unauthenticated health request is not a reliable readiness check.

These constraints make this a development demonstration rather than a ready-to-operate exchange.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev:all` | Start frontend and API watchers |
| `npm run build` | Build frontend assets into `dist/` |
| `npm run build:server` | Compile the API into `server/dist/` |
| `npm run start:server` | Start the compiled API |
| `npm run preview` | Preview the frontend build |
| `npm run lint` | Run the configured ESLint checks |

No automated test script is provided. Build checks do not exercise wallet transfers, the database or the screening services.

## Further reading

- [Backend API](server/README.md)
- [Docker notes](DOCKER.md), which predate some current service and authentication changes
- [Environment template](.env.example)

## Licence

**Documented backend licence: MIT.** This is the declaration recorded in the [backend documentation](server/README.md#licence). No standalone licence file or package licence declaration is included in this repository.
