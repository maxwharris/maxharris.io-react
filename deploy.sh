#!/bin/bash

# Deployment script for maxharris.io
# Run this script on your EC2 server after uploading the files

set -e  # Exit on error

echo "🚀 Starting deployment for maxharris.io..."

# Variables
APP_DIR="/var/www/maxharris.io"
NGINX_CONF="/etc/nginx/sites-available/maxharris.io"
NGINX_ENABLED="/etc/nginx/sites-enabled/maxharris.io"

# Create application directory if it doesn't exist
echo "📁 Setting up application directory..."
sudo mkdir -p $APP_DIR
sudo chown -R $USER:$USER $APP_DIR

# Create logs directory
mkdir -p $APP_DIR/logs

# Navigate to app directory
cd $APP_DIR

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production=false

# Build the application
echo "🔨 Building application..."
npm run build

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📥 Installing PM2..."
    sudo npm install -g pm2
fi

# Stop existing PM2 process if running
echo "🛑 Stopping existing PM2 process..."
pm2 stop maxharris-io || true
pm2 delete maxharris-io || true

# Start the application with PM2
echo "▶️  Starting application with PM2..."
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
pm2 save

# Configure Nginx
echo "🔧 Configuring Nginx..."
if [ -f "nginx-maxharris.io.conf" ]; then
    sudo cp nginx-maxharris.io.conf $NGINX_CONF

    # Create symlink if it doesn't exist
    if [ ! -L "$NGINX_ENABLED" ]; then
        sudo ln -s $NGINX_CONF $NGINX_ENABLED
    fi

    # Test Nginx configuration
    echo "🧪 Testing Nginx configuration..."
    sudo nginx -t

    # Reload Nginx
    echo "🔄 Reloading Nginx..."
    sudo systemctl reload nginx
else
    echo "⚠️  nginx-maxharris.io.conf not found, skipping Nginx configuration"
fi

# Display status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "🌐 Your site should now be accessible at:"
echo "   http://maxharris.io (once DNS is configured)"
echo "   http://your-ec2-ip:4173 (direct access)"
echo ""
echo "📝 Useful commands:"
echo "   pm2 status              - Check application status"
echo "   pm2 logs maxharris-io   - View application logs"
echo "   pm2 restart maxharris-io - Restart application"
echo "   pm2 stop maxharris-io   - Stop application"
echo "   sudo systemctl status nginx - Check Nginx status"
echo ""
echo "🔒 Next steps:"
echo "   1. Configure your DNS to point maxharris.io to this EC2 IP"
echo "   2. Install SSL certificate with: sudo certbot --nginx -d maxharris.io -d www.maxharris.io"
