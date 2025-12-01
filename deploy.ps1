# Momentum Project Deployment Script
# Usage: .\deploy.ps1

Write-Host "Starting Momentum project deployment to Netlify..." -ForegroundColor Green

# Check if required tools are installed
Write-Host "Checking dependencies..." -ForegroundColor Yellow
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "Error: npm not found, please install Node.js first" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command netlify -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Netlify CLI..." -ForegroundColor Yellow
    npm install -g netlify-cli
}

# Install dependencies
Write-Host "Installing project dependencies..." -ForegroundColor Yellow
npm install

# Build project
Write-Host "Building project..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Check Netlify login status
Write-Host "Checking Netlify login status..." -ForegroundColor Yellow
$netlifyStatus = netlify status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Need to login to Netlify..." -ForegroundColor Yellow
    netlify login
}

# Deploy to production
Write-Host "Deploying to Netlify..." -ForegroundColor Yellow
netlify deploy --prod --dir=dist

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment successful!" -ForegroundColor Green
    Write-Host "Visit: https://momentumctdp.netlify.app" -ForegroundColor Cyan
} else {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}
