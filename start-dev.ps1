# BSV Swift Exchange - Development Start Script (Windows)
# This starts MongoDB in Docker and runs the app locally for wallet testing

Write-Host ""
Write-Host "BSV Swift Exchange - Development Setup" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "Creating .env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host ""
    Write-Host "Please edit .env and set your PRIVATE_KEY!" -ForegroundColor Red
    Write-Host "Open .env in your editor and add your wallet private key (hex format)" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Check if PRIVATE_KEY is set
$envContent = Get-Content ".env" -Raw
if ($envContent -match "your_private_key_hex_here") {
    Write-Host "PRIVATE_KEY is not set in .env!" -ForegroundColor Red
    Write-Host "Please edit .env and set your actual private key." -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "Environment configuration found" -ForegroundColor Green
Write-Host ""

# Check if Docker is running
try {
    docker info 2>&1 | Out-Null
    Write-Host "Docker is running" -ForegroundColor Green
} catch {
    Write-Host "Docker is not running!" -ForegroundColor Red
    Write-Host "Please start Docker Desktop and try again" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Start MongoDB in Docker (standalone)
Write-Host "Starting MongoDB in Docker..." -ForegroundColor Cyan
docker run -d --name bsv-exchange-mongodb -p 27017:27017 -e MONGO_INITDB_DATABASE=bsv_exchange mongo:latest 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    # Container might already exist, try to start it
    Write-Host "MongoDB container may already exist, attempting to start..." -ForegroundColor Yellow
    docker start bsv-exchange-mongodb 2>&1 | Out-Null
}

# Wait for MongoDB to be ready
Write-Host "Waiting for MongoDB to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "MongoDB started on localhost:27017" -ForegroundColor Green
Write-Host ""

# Start the app
Write-Host "Starting frontend and backend..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Application URLs:" -ForegroundColor Green
Write-Host "   Frontend: http://localhost:5173 (Vite dev server)" -ForegroundColor White
Write-Host "   Backend:  http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Yellow
Write-Host ""

# Run the dev servers
npm run dev:all
