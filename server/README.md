# BSV Swift Exchange - Backend Server

Express TypeScript server implementing a BSV exchange backend with wallet functionality using the BSV SDK and Wallet Toolbox.

## Features

- **Wallet Integration**: Server-side BSV wallet using `@bsv/wallet-toolbox`
- **Payment Protocol**: Implements PeerPay-compatible payment protocol
- **Balance Management**: User balance tracking using `LocalKVStore`
- **BRC29 Key Derivation**: Secure payment address generation
- **Authentication**: BRC-103 mutual authentication via `@bsv/auth-express-middleware`

## Architecture

### Payment Flow

The server follows the PeerPayClient protocol from DAS-ts:

1. **Deposit Flow**:
   - Client sends PaymentToken with `customInstructions`, `transaction`, and `amount`
   - Server internalizes payment using `wallet.internalizeAction()`
   - Balance is credited to user's identity key
   - Transaction is labeled with counterparty identity

2. **Withdrawal Flow**:
   - Client authenticates via BRC-103
   - Server checks balance sufficiency
   - Generates BRC29-derived payment address
   - Creates payment transaction using `wallet.createAction()`
   - Returns `InternalizeActionArgs` for client to internalize
   - Balance is debited

3. **Balance Query**:
   - Any client can query balance by identity key
   - Returns satoshi amount (default 0)

## API Endpoints

### POST /deposit

Accept a payment deposit from a client.

**Request Body** (matches PeerPayClient PaymentToken):
```json
{
  "customInstructions": {
    "derivationPrefix": "base64string...",
    "derivationSuffix": "base64string..."
  },
  "transaction": "AtomicBEEF...",
  "amount": 10000,
  "sender": "03a1b2c3d4e5f6..."
}
```

**Response**:
```json
{
  "success": true,
  "txid": "abc123...",
  "amount": 10000,
  "newBalance": 10000,
  "message": "Deposit successful"
}
```

### GET /balance/:identityKey

Get user balance by identity key.

**Response**:
```json
{
  "identityKey": "03a1b2c3d4e5f6...",
  "balance": 10000
}
```

### POST /withdraw/:amount

Create a withdrawal payment (requires authentication).

**Headers**:
- Must include BRC-103 authentication headers

**Response**:
```json
{
  "success": true,
  "payment": {
    "tx": "AtomicBEEF...",
    "outputs": [{
      "outputIndex": 0,
      "protocol": "wallet payment",
      "paymentRemittance": {
        "derivationPrefix": "...",
        "derivationSuffix": "...",
        "senderIdentityKey": "..."
      }
    }],
    "description": "Withdrawal from exchange"
  },
  "amount": 5000,
  "newBalance": 5000,
  "txid": "xyz789..."
}
```

### GET /health

Health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "wallet": "initialized"
}
```

## Configuration

Environment variables in `.env`:

```bash
# Server port (default: 3000)
PORT=3000

# BSV Network: 'main' or 'test'
CHAIN=main

# Wallet Storage URL
STORAGE_URL=https://store-us-1.bsvb.tech

# Server Wallet Private Key (hex format)
PRIVATE_KEY=your_private_key_hex
```

## Development

### Installation

```bash
npm install
```

### Run Development Server

```bash
# Backend only
npm run dev:server

# Frontend + Backend concurrently
npm run dev:all
```

### Build for Production

```bash
npm run build:server
```

### Start Production Server

```bash
npm run start:server
```

## Implementation Details

### Wallet Initialization

The server initializes a BSV wallet on startup using the `makeWallet` function:

```typescript
const wallet = await makeWallet(chain, storageURL, privateKey)
```

Components:
- **KeyDeriver**: Derives keys from the server's private key
- **WalletStorageManager**: Manages wallet state
- **WalletSigner**: Signs transactions
- **Services**: Connects to BSV network services
- **StorageClient**: Syncs with remote storage

### Balance Storage

Uses `LocalKVStore` from `@bsv/sdk` for persistent balance tracking:

```typescript
const balanceStorage = new BalanceStorage(wallet)
await balanceStorage.setBalance(identityKey, amount)
const balance = await balanceStorage.getBalance(identityKey)
```

### BRC29 Payment Protocol

Withdrawals use BRC29 protocol for key derivation:

1. Generate random nonces for derivation paths
2. Derive recipient's public key using protocol ID `[2, '3241645161d8']`
3. Create P2PKH locking script
4. Build transaction with customInstructions
5. Return InternalizeActionArgs for client

### Authentication Middleware

The `/withdraw` endpoint uses `@bsv/auth-express-middleware` which:
- Implements BRC-103 mutual authentication
- Verifies cryptographic signatures
- Attaches `req.auth.identityKey` to authenticated requests

## Project Structure

```
server/
├── src/
│   ├── index.ts      # Main Express server
│   ├── wallet.ts     # Wallet initialization
│   └── storage.ts    # Balance storage wrapper
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## Integration with Frontend

The Vite dev server is configured to proxy `/api` requests to the backend:

```typescript
// vite.config.ts
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '')
  }
}
```

Frontend can make requests to `/api/deposit`, `/api/balance/:id`, etc.

## Security Considerations

1. **Private Key**: Store server private key securely (env vars, secrets manager)
2. **Authentication**: Withdraw endpoint requires BRC-103 auth
3. **Balance Validation**: Always check sufficient balance before withdrawal
4. **CORS**: Configured for cross-origin requests
5. **Input Validation**: Validate all request parameters

## Dependencies

### Production
- `express` - Web server framework
- `@bsv/sdk` - BSV blockchain SDK
- `@bsv/wallet-toolbox` - Wallet infrastructure
- `@bsv/auth-express-middleware` - BRC-103 authentication
- `dotenv` - Environment configuration
- `cors` - CORS middleware

### Development
- `tsx` - TypeScript execution
- `concurrently` - Run multiple processes
- `@types/express` - TypeScript types
- `@types/cors` - TypeScript types

## License

MIT
