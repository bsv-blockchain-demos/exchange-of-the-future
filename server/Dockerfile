# Backend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy server source code
COPY server ./server
COPY tsconfig.json ./

# Build the server
RUN npm run build:server

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built server from build stage
COPY --from=base /app/server/dist ./server/dist

EXPOSE 3000

CMD ["node", "server/dist/index.js"]
