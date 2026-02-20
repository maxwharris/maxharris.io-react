# PowerShell script to deploy maxharris.io to EC2
# Usage: .\deploy-to-ec2.ps1 -EC2Host "your-ec2-ip" -KeyPath "path\to\your-key.pem"

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2Host,

    [Parameter(Mandatory=$true)]
    [string]$KeyPath,

    [string]$User = "ubuntu"
)

Write-Host "🚀 Starting deployment to EC2..." -ForegroundColor Green

# Check if key file exists
if (!(Test-Path $KeyPath)) {
    Write-Host "❌ Key file not found: $KeyPath" -ForegroundColor Red
    exit 1
}

# Build the project
Write-Host "🔨 Building project..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build successful!" -ForegroundColor Green

# Create deployment package
Write-Host "📦 Creating deployment package..." -ForegroundColor Yellow
$deployFile = "maxharris-deploy.tar.gz"

# Use tar command (available in Windows 10+)
tar -czf $deployFile --exclude=node_modules --exclude=.git .

if (!(Test-Path $deployFile)) {
    Write-Host "❌ Failed to create deployment package!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Deployment package created!" -ForegroundColor Green

# Transfer to EC2
Write-Host "📤 Transferring files to EC2..." -ForegroundColor Yellow
scp -i $KeyPath $deployFile "${User}@${EC2Host}:/tmp/"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ File transfer failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Files transferred!" -ForegroundColor Green

# Extract and deploy on EC2
Write-Host "🔧 Deploying on EC2..." -ForegroundColor Yellow

$deployCommands = @"
    sudo mkdir -p /var/www/maxharris.io
    sudo chown -R $User:$User /var/www/maxharris.io
    cd /var/www/maxharris.io
    tar -xzf /tmp/$deployFile
    chmod +x deploy.sh
    ./deploy.sh
"@

ssh -i $KeyPath "${User}@${EC2Host}" $deployCommands

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

# Cleanup local deployment file
Remove-Item $deployFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Your site should be accessible at:" -ForegroundColor Cyan
Write-Host "   http://maxharris.io (frontend - served by Nginx)" -ForegroundColor Cyan
Write-Host "   http://api.maxharris.io (backend API)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "   1. Ensure DNS for maxharris.io and api.maxharris.io point to $EC2Host"
Write-Host "   2. SSH to server and run: sudo certbot --nginx -d maxharris.io -d www.maxharris.io -d api.maxharris.io"
