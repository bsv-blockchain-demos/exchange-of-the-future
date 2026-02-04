# BSV Swift Exchange

A Bitcoin SV (BSV) exchange application with wallet functionality, built with React, Express, and MongoDB. Users can deposit BSV, swap between BSV and USD, and withdraw funds using BRC-29 payment protocols.

## Project Overview

This project consists of three main components:
- **Frontend**: React + Vite + shadcn/ui (port 8080)
- **Backend**: Express + TypeScript + BSV SDK (port 3000)
- **Database**: MongoDB for persistent balance storage (port 27017)

The application implements a complete BSV exchange with:
- **Deposit/Withdrawal**: Using BRC-29 payment protocol with key derivation
- **Swap Functionality**: Exchange between BSV (satoshis) and USD at $25,000 per BSV
- **Balance Management**: Persistent storage with atomic MongoDB operations
- **Transaction History**: Track all deposits and withdrawals
- **Authentication**: BRC-103 identity authentication using @bsv/auth-express-middleware

## Quick Start

```sh
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Configure environment variables
cp .env.example .env
# Edit .env with your BSV wallet private key and other settings

# Build and run
docker compose up -d --build
```

That's it! Access the application at:
- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3000

### Docker Commands

```sh
# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f mongodb

# Stop services
docker compose down

# Stop and remove volumes (including MongoDB data)
docker compose down -v
```

See [DOCKER.md](DOCKER.md) for complete Docker deployment guide.

## Local Development

For local development without Docker, you'll need Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

```sh
# Install dependencies
npm i

# Start frontend only
npm run dev

# Or start both frontend and backend
npm run dev:all
```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```bash
# Backend Server
PORT=3000

# BSV Blockchain Configuration
CHAIN=main                          # or 'test' for testnet
STORAGE_URL=https://your-storage   # BSV Overlay Services URL
PRIVATE_KEY=your_private_key_here  # Server wallet private key

# MongoDB Configuration
MONGODB_URI=mongodb://mongodb:27017/bsv_exchange  # Docker: mongodb hostname
# For local development without Docker:
# MONGODB_URI=mongodb://localhost:27017/bsv_exchange
```

See [.env.example](.env.example) for a template.

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

### Frontend
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- React Router
- TanStack Query

### Backend
- Express
- TypeScript
- @bsv/sdk - BSV Blockchain SDK
- @bsv/wallet-toolbox - Wallet infrastructure
- @bsv/auth-express-middleware - BRC-103 authentication
- MongoDB - NoSQL database for balance storage

### DevOps
- Docker & Docker Compose
- MongoDB (containerized)
- nginx (production frontend server)

## How can I deploy this project?

### Docker Deployment (Recommended)

```bash
docker compose up -d --build
```

See [DOCKER.md](DOCKER.md) for production deployment guide.

### Manual Deployment

**Backend**:
```bash
npm run build:server
npm run start:server
```

**Frontend**:
```bash
npm run build
# Serve the dist/ folder with nginx or another web server
```

## Project Structure

```
bsv-swift-exchange/
├── src/                  # Frontend React application
│   ├── components/       # UI components
│   ├── pages/           # Route pages
│   └── lib/             # Utilities
├── server/              # Backend Express server
│   ├── src/
│   │   ├── index.ts     # Main server file
│   │   ├── wallet.ts    # BSV wallet setup
│   │   └── storage.ts   # Balance management
│   └── README.md        # Backend documentation
├── docker-compose.yml   # Docker orchestration
├── Dockerfile           # Frontend container
├── server/Dockerfile    # Backend container
└── nginx.conf          # Production nginx config
```

## Backend API Endpoints

### Public Endpoints
- `GET /health` - Health check

### Authenticated Endpoints (require BRC-103 auth)
- `POST /deposit` - Accept BSV payment deposits using BRC-29 protocol
  - Body: `{ customInstructions, transaction, amount }`
  - Internalizes transaction and credits user's BSV balance

- `GET /balance` - Get authenticated user's balances
  - Returns: `{ serverIdentityKey, balance (satoshis), usdBalance }`

- `GET /transactions` - Get transaction history for authenticated user
  - Returns: Array of deposits and withdrawals from wallet actions

- `POST /swap` - Swap between BSV and USD
  - Body: `{ direction: 'bsv-to-usd' | 'usd-to-bsv', amount: number }`
  - Exchange rate: $25,000 per BSV
  - Atomic operation with MongoDB

- `POST /withdraw` - Create withdrawal payment using BRC-29 protocol
  - Body: `{ amount: number }` (in satoshis)
  - Returns: `{ payment (InternalizeActionArgs), newBalance, txid }`

See [server/README.md](server/README.md) for complete API documentation.

## Features

### 1. Deposit BSV
- Users deposit BSV using BRC-29 payment protocol
- Server generates derived keys for privacy
- Transaction is internalized into server wallet
- User balance is credited atomically in MongoDB

### 2. Withdraw BSV
- Users request withdrawal with specified amount
- Server creates payment transaction using BRC-29
- Balance is debited atomically before transaction creation
- User receives InternalizeActionArgs to import into their wallet

### 3. Swap BSV ↔ USD
- Instant swap between BSV (satoshis) and USD
- Fixed exchange rate: $25,000 per BSV
- Atomic operations prevent race conditions
- USD displayed to 5 decimal places for precision

### 4. Transaction History
- View all deposits and withdrawals
- Automatically refreshes after transactions
- Shows: TXID, counterparty, amount, direction

### 5. Balance Management
- Dual balance tracking: BSV (satoshis) and USD
- Real-time balance updates
- Persistent storage in MongoDB
- Atomic operations for data consistency

## Database Schema

### MongoDB Collections

#### balances
```typescript
{
  identityKey: string        // User's public identity key (unique index)
  balance: number            // BSV balance in satoshis
  usdBalance: number         // USD balance (5 decimal precision)
  updatedAt: Date           // Last update timestamp
}
```

All balance updates use MongoDB's atomic operations (`$inc`) to prevent race conditions during concurrent transactions.

## Additional Documentation

- [DOCKER.md](DOCKER.md) - Complete Docker deployment guide
- [server/README.md](server/README.md) - Backend API documentation
- [.env.example](.env.example) - Environment configuration template
