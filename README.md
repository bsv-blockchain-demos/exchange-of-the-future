# BSV Swift Exchange

A Bitcoin SV (BSV) exchange application with wallet functionality, built with React and Express.

## Project Overview

This project consists of two applications:
- **Frontend**: React + Vite + shadcn/ui (port 8080)
- **Backend**: Express + TypeScript + BSV SDK (port 3000)

The backend implements BSV wallet operations using `@bsv/wallet-toolbox` with deposit, withdrawal, and balance management capabilities.

## Project info

**URL**: https://lovable.dev/projects/783167e3-6dc8-4fdf-bff7-721072968204

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/783167e3-6dc8-4fdf-bff7-721072968204) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Configure environment variables
cp .env.example .env
# Edit .env with your BSV wallet private key and other settings

# Step 5: Start the development server with auto-reloading and an instant preview.
# Option A: Start frontend only
npm run dev

# Option B: Start both frontend and backend
npm run dev:all
```

### Running with Docker

For production deployment or to run both services together:

```sh
# Build and start both frontend and backend
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

See [DOCKER.md](DOCKER.md) for complete Docker deployment guide.

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

### DevOps
- Docker & Docker Compose
- nginx (production frontend server)

## How can I deploy this project?

### Option 1: Lovable Deployment (Frontend only)

Simply open [Lovable](https://lovable.dev/projects/783167e3-6dc8-4fdf-bff7-721072968204) and click on Share -> Publish.

### Option 2: Docker Deployment (Full Stack)

Deploy both frontend and backend using Docker:

```bash
# Configure environment
cp .env.example .env
# Edit .env with your settings

# Build and start services
docker-compose up -d

# Access the application
# Frontend: http://localhost:8080
# Backend API: http://localhost:3000
```

See [DOCKER.md](DOCKER.md) for production deployment guide.

### Option 3: Manual Deployment

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

- `POST /deposit` - Accept BSV payment deposits
- `GET /balance/:identityKey` - Query user balance
- `POST /withdraw/:amount` - Create withdrawal payment (authenticated)
- `GET /health` - Health check

See [server/README.md](server/README.md) for complete API documentation.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Additional Documentation

- [DOCKER.md](DOCKER.md) - Complete Docker deployment guide
- [server/README.md](server/README.md) - Backend API documentation
- [.env.example](.env.example) - Environment configuration template
