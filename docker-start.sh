#!/bin/bash

# Quick start script for Docker Compose deployment

set -e

echo "🚀 BSV Swift Exchange - Docker Setup"
echo "======================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo "📝 Please edit .env and set your PRIVATE_KEY before continuing!"
    echo ""
    echo "Run: nano .env"
    echo "Then run this script again."
    exit 1
fi

# Check if PRIVATE_KEY is set to example value
if grep -q "your_private_key_hex_here" .env; then
    echo "⚠️  Warning: PRIVATE_KEY is still set to the example value"
    echo "Please edit .env and set your actual private key."
    echo ""
    echo "Run: nano .env"
    exit 1
fi

echo "✅ Environment configuration found"
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Build and start services
echo "🔨 Building and starting services..."
echo ""
docker-compose up -d --build

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check service status
docker-compose ps

echo ""
echo "✅ Services started successfully!"
echo ""
echo "🌐 Application URLs:"
echo "   Frontend: http://localhost:8080"
echo "   Backend:  http://localhost:3000"
echo "   Health:   http://localhost:3000/health"
echo ""
echo "📊 View logs with: docker-compose logs -f"
echo "🛑 Stop with:      docker-compose down"
echo ""
