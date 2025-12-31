#!/bin/bash

# Server Installation Script for maxharris.io
# This script sets up a fresh EC2 instance with all required dependencies
# Run this ONCE on a new EC2 instance before deploying your application

set -e  # Exit on error

echo "================================================"
echo "  maxharris.io - Server Installation Script"
echo "================================================"
echo ""
echo "This script will install:"
echo "  • Node.js (v20.x LTS)"
echo "  • npm and PM2"
echo "  • Nginx web server"
echo "  • Certbot (for SSL certificates)"
echo "  • UFW firewall"
echo ""
read -p "Continue with installation? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 1
fi

echo ""
echo "🔄 Updating system packages..."
sudo apt update
sudo apt upgrade -y

echo ""
echo "📦 Installing essential tools..."
sudo apt install -y curl wget git build-essential software-properties-common

# Install Node.js
echo ""
echo "📦 Installing Node.js v20.x LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
echo "✅ Node.js $NODE_VERSION installed"
echo "✅ npm $NPM_VERSION installed"

# Install PM2
echo ""
echo "📦 Installing PM2 process manager..."
sudo npm install -g pm2

# Verify PM2 installation
PM2_VERSION=$(pm2 --version)
echo "✅ PM2 $PM2_VERSION installed"

# Install Nginx
echo ""
echo "📦 Installing Nginx..."
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

echo "✅ Nginx installed and started"

# Install Certbot for SSL
echo ""
echo "📦 Installing Certbot for SSL certificates..."
sudo apt install -y certbot python3-certbot-nginx

echo "✅ Certbot installed"

# Configure UFW Firewall
echo ""
echo "🔒 Configuring UFW firewall..."
sudo ufw --force enable
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

echo "✅ Firewall configured"

# Create application directory
echo ""
echo "📁 Creating application directories..."
sudo mkdir -p /var/www/maxharris.io/logs
sudo chown -R $USER:$USER /var/www/maxharris.io

echo "✅ Application directory created at /var/www/maxharris.io"

# Optimize system for Node.js
echo ""
echo "⚙️  Optimizing system settings..."

# Increase file watch limit for Vite
echo "fs.inotify.max_user_watches=524288" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Configure log rotation
echo ""
echo "📝 Setting up log rotation..."
sudo tee /etc/logrotate.d/maxharris-io > /dev/null << 'EOF'
/var/www/maxharris.io/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 ubuntu ubuntu
    sharedscripts
}
EOF

echo "✅ Log rotation configured"

# Configure swap (if not exists)
if [ ! -f /swapfile ]; then
    echo ""
    echo "💾 Creating swap file (2GB)..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "✅ Swap file created"
else
    echo "✅ Swap file already exists"
fi

# Install fail2ban for SSH protection
echo ""
echo "🔒 Installing fail2ban for SSH protection..."
sudo apt install -y fail2ban

sudo tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
EOF

sudo systemctl enable fail2ban
sudo systemctl start fail2ban

echo "✅ fail2ban installed and configured"

# Setup automatic security updates
echo ""
echo "🔐 Enabling automatic security updates..."
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Display system information
echo ""
echo "================================================"
echo "  Installation Complete! ✅"
echo "================================================"
echo ""
echo "📊 Installed Versions:"
echo "   • Node.js: $(node --version)"
echo "   • npm: $(npm --version)"
echo "   • PM2: $(pm2 --version)"
echo "   • Nginx: $(nginx -v 2>&1 | cut -d '/' -f 2)"
echo ""
echo "🔧 System Configuration:"
echo "   • Application directory: /var/www/maxharris.io"
echo "   • Nginx status: $(sudo systemctl is-active nginx)"
echo "   • UFW firewall: $(sudo ufw status | head -1)"
echo "   • fail2ban: $(sudo systemctl is-active fail2ban)"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Upload your application files to /var/www/maxharris.io"
echo "   Example:"
echo "   scp -i YOUR_KEY.pem -r . ubuntu@YOUR_EC2_IP:/var/www/maxharris.io/"
echo ""
echo "2. Run the deployment script:"
echo "   cd /var/www/maxharris.io"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
echo "3. Configure DNS:"
echo "   Point maxharris.io A record to this server's IP"
echo ""
echo "4. Install SSL certificate (after DNS is configured):"
echo "   sudo certbot --nginx -d maxharris.io -d www.maxharris.io"
echo ""
echo "================================================"
echo ""

# Display server IP addresses
echo "🌐 Server IP Addresses:"
ip addr show | grep 'inet ' | grep -v '127.0.0.1' | awk '{print "   • " $2}' | cut -d '/' -f 1
echo ""

# Save installation log
INSTALL_LOG="/var/log/maxharris-io-install.log"
echo "Installation completed at $(date)" | sudo tee $INSTALL_LOG > /dev/null
echo ""
echo "📄 Installation log saved to: $INSTALL_LOG"
echo ""
