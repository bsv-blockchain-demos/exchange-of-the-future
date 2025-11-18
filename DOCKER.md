# Docker Deployment Guide

This guide explains how to run the BSV Swift Exchange using Docker Compose.

## Architecture

The application consists of two services:

1. **Backend** (Express + TypeScript)
   - Runs on port 3000
   - Handles BSV wallet operations
   - Manages user balances
   - Provides REST API

2. **Frontend** (React + Vite)
   - Runs on port 8080 (nginx)
   - Serves the web UI
   - Proxies `/api/*` requests to backend

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- `.env` file with required configuration

## Quick Start

### 1. Configure Environment

Create a `.env` file in the project root (or copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# Server port
PORT=3000

# BSV Network (main or test)
CHAIN=main

# Wallet Storage URL
STORAGE_URL=https://store-us-1.bsvb.tech

# Server Wallet Private Key (hex format)
PRIVATE_KEY=your_private_key_here
```

**⚠️ IMPORTANT**: Replace `PRIVATE_KEY` with your actual private key!

### 2. Build and Start Services

```bash
docker-compose up -d
```

This will:
- Build both frontend and backend images
- Start both containers
- Set up networking between services
- Configure health checks

### 3. Verify Services

Check that both services are running:

```bash
docker-compose ps
```

Expected output:
```
NAME                        STATUS
bsv-exchange-backend        Up (healthy)
bsv-exchange-frontend       Up (healthy)
```

### 4. Access the Application

- **Frontend**: http://localhost:8080
- **Backend API**: http://localhost:3000
- **Health Check**: http://localhost:3000/health

## Docker Compose Commands

### Start Services

```bash
# Start in foreground (see logs)
docker-compose up

# Start in background (detached)
docker-compose up -d

# Start and rebuild images
docker-compose up --build
```

### Stop Services

```bash
# Stop containers (keep data)
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop, remove containers, and clean up volumes
docker-compose down -v
```

### View Logs

```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart backend only
docker-compose restart backend

# Restart frontend only
docker-compose restart frontend
```

### Scale Services

```bash
# Run multiple backend instances
docker-compose up -d --scale backend=3
```

## Service Configuration

### Backend Service

**Image**: Built from `server/Dockerfile`

**Environment Variables**:
- `PORT`: Server port (default: 3000)
- `CHAIN`: BSV network ('main' or 'test')
- `STORAGE_URL`: Wallet storage URL
- `PRIVATE_KEY`: Server wallet private key

**Volumes**: None (stateless - uses remote storage)

**Health Check**: `GET /health` every 30s

### Frontend Service

**Image**: Built from root `Dockerfile` (React + nginx)

**Nginx Configuration**:
- Serves static files from `/usr/share/nginx/html`
- Proxies `/api/*` to backend service
- Handles React Router with `try_files`

**Health Check**: HTTP check every 30s

## Networking

Services communicate via the `bsv-network` bridge network:

- Frontend → Backend: `http://backend:3000`
- Both services accessible from host via published ports

## Production Deployment

### Security Checklist

- [ ] Use secrets management for `PRIVATE_KEY` (not .env)
- [ ] Enable HTTPS with reverse proxy (nginx/traefik)
- [ ] Set up firewall rules
- [ ] Configure CORS appropriately
- [ ] Enable rate limiting
- [ ] Set up monitoring and alerting

### Recommended Setup

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  backend:
    build:
      context: .
      dockerfile: server/Dockerfile
    environment:
      - PORT=3000
      - CHAIN=main
    secrets:
      - private_key
    deploy:
      replicas: 3
      restart_policy:
        condition: on-failure
        max_attempts: 3
      resources:
        limits:
          cpus: '1'
          memory: 1G

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure

  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx-prod.conf:/etc/nginx/conf.d/default.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - frontend

secrets:
  private_key:
    external: true
```

### Using Docker Secrets

```bash
# Create secret
echo "your_private_key_hex" | docker secret create bsv_private_key -

# Reference in compose file
services:
  backend:
    secrets:
      - bsv_private_key
```

## Troubleshooting

### Backend fails to start

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - Invalid PRIVATE_KEY format
# - Cannot connect to STORAGE_URL
# - Port 3000 already in use
```

### Frontend can't reach backend

```bash
# Check network connectivity
docker exec bsv-exchange-frontend wget -O- http://backend:3000/health

# Verify nginx config
docker exec bsv-exchange-frontend cat /etc/nginx/conf.d/default.conf
```

### Rebuild after code changes

```bash
# Rebuild specific service
docker-compose build backend
docker-compose up -d backend

# Rebuild everything
docker-compose down
docker-compose up --build
```

### View container details

```bash
# Inspect backend
docker inspect bsv-exchange-backend

# Check resource usage
docker stats
```

## Development with Docker

For local development, you may prefer to run services without Docker:

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend
npm run dev:server
```

This allows for hot-reloading and faster iteration.

## Backup and Recovery

### Backup Wallet State

The wallet state is stored remotely at `STORAGE_URL`. To backup:

1. Note your `PRIVATE_KEY` (secure storage)
2. Document your `STORAGE_URL`
3. Optionally export wallet data via BSV SDK

### Restore from Backup

1. Set `PRIVATE_KEY` in `.env`
2. Set `STORAGE_URL` to your backup location
3. Start services: `docker-compose up -d`

The wallet will reconnect to stored state automatically.

## Monitoring

### Health Checks

Both services have built-in health checks:

```bash
# Check health status
docker-compose ps

# Detailed health info
docker inspect bsv-exchange-backend | jq '.[0].State.Health'
```

### Prometheus Metrics (Optional)

Add metrics endpoint to backend:

```typescript
// server/src/index.ts
import promClient from 'prom-client'

const register = new promClient.Registry()
promClient.collectDefaultMetrics({ register })

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType)
  res.end(await register.metrics())
})
```

## Advanced Configuration

### Custom Port Mapping

```bash
# Run frontend on port 80
docker-compose up -d -e "FRONTEND_PORT=80"
```

Edit `docker-compose.yml`:
```yaml
services:
  frontend:
    ports:
      - "${FRONTEND_PORT:-8080}:80"
```

### Volume Mounts for Development

```yaml
services:
  backend:
    volumes:
      - ./server/src:/app/server/src
    command: npm run dev:server
```

### Multiple Environments

```bash
# Development
docker-compose -f docker-compose.yml up

# Staging
docker-compose -f docker-compose.staging.yml up

# Production
docker-compose -f docker-compose.prod.yml up
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build and push images
        run: |
          docker-compose build
          docker-compose push

      - name: Deploy to server
        run: |
          ssh user@server 'cd /app && docker-compose pull && docker-compose up -d'
```

## Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [BSV SDK Documentation](https://docs.bsvblockchain.org/)

## Support

For issues related to:
- Docker setup: Check Docker logs and this guide
- BSV integration: See [server/README.md](server/README.md)
- Frontend issues: See main [README.md](README.md)
