# Deployment Guide for maxharris.io

This guide will help you deploy your React portfolio site to an EC2 server with Nginx and PM2.

## Prerequisites

- EC2 instance running Ubuntu/Amazon Linux
- SSH access to the server
- Node.js installed on the server (v18+ recommended)
- Nginx installed and running
- Domain `maxharris.io` DNS configured to point to your EC2 IP

---

## Quick Deployment Steps

### 1. Prepare Your Local Machine

First, build your project locally to test:

```bash
npm install
npm run build
npm run preview
```

Visit `http://localhost:4173` to verify the build works.

### 2. Transfer Files to EC2

**Option A: Using rsync (Recommended)**

Replace `YOUR_EC2_IP` and `YOUR_KEY.pem` with your actual values:

```bash
# From your project directory
rsync -avz --exclude 'node_modules' --exclude '.git' \
  -e "ssh -i /path/to/YOUR_KEY.pem" \
  . ubuntu@YOUR_EC2_IP:/tmp/maxharris.io-upload
```

**Option B: Using scp**

```bash
# Create a zip file first
npm run build
tar -czf maxharris-deploy.tar.gz --exclude='node_modules' --exclude='.git' .

# Transfer to server
scp -i /path/to/YOUR_KEY.pem maxharris-deploy.tar.gz ubuntu@YOUR_EC2_IP:/tmp/
```

**Option C: Using Git (Recommended for updates)**

```bash
# On your EC2 server
cd /var/www
sudo git clone https://github.com/yourusername/maxharris.io-react.git maxharris.io
```

### 3. SSH into Your EC2 Server

```bash
ssh -i /path/to/YOUR_KEY.pem ubuntu@YOUR_EC2_IP
```

### 4. Run the Deployment Script

```bash
# If you uploaded to /tmp
sudo mkdir -p /var/www/maxharris.io
sudo cp -r /tmp/maxharris.io-upload/* /var/www/maxharris.io/
cd /var/www/maxharris.io

# Make the deployment script executable
chmod +x deploy.sh

# Run the deployment
./deploy.sh
```

### 5. Configure DNS

Point your domain to your EC2 instance:

1. Go to your domain registrar (e.g., Namecheap, GoDaddy, Route53)
2. Add/Update A records:
   - `@` (root domain) → Your EC2 IP address
   - `www` → Your EC2 IP address

Wait 5-15 minutes for DNS propagation.

### 6. Install SSL Certificate (HTTPS)

Once DNS is configured and pointing to your server:

```bash
# Install Certbot if not already installed
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d maxharris.io -d www.maxharris.io
```

Follow the prompts. Certbot will automatically:
- Obtain the SSL certificate
- Configure Nginx for HTTPS
- Set up auto-renewal

### 7. Enable HTTPS in Nginx Config

```bash
# Edit the Nginx configuration
sudo nano /etc/nginx/sites-available/maxharris.io

# Uncomment the HTTPS server block (lines after "# HTTPS configuration")
# Comment out or remove the HTTP redirect if you want both HTTP and HTTPS
```

Test and reload Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

## Manual Deployment Steps (Alternative)

If you prefer to set up manually:

### 1. Install Dependencies on Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Verify installations
node --version
npm --version
pm2 --version
```

### 2. Setup Application Directory

```bash
# Create directory
sudo mkdir -p /var/www/maxharris.io
sudo chown -R $USER:$USER /var/www/maxharris.io
cd /var/www/maxharris.io

# Clone or copy your files here
# Then install dependencies
npm install
npm run build
```

### 3. Configure PM2

```bash
# Start the application
pm2 start ecosystem.config.cjs

# Save PM2 process list
pm2 save

# Enable PM2 to start on boot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp /home/$USER
pm2 save

# Check status
pm2 status
pm2 logs maxharris-io
```

### 4. Configure Nginx

```bash
# Copy Nginx configuration
sudo cp nginx-maxharris.io.conf /etc/nginx/sites-available/maxharris.io

# Create symlink
sudo ln -s /etc/nginx/sites-available/maxharris.io /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Updating Your Site

When you make changes to your code:

### Option 1: Using Git (Recommended)

```bash
# SSH into server
ssh -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP

# Navigate to app directory
cd /var/www/maxharris.io

# Pull latest changes
git pull origin main

# Rebuild and restart
npm install
npm run build
pm2 restart maxharris-io
```

### Option 2: Manual Transfer

```bash
# On local machine - transfer new files
rsync -avz --exclude 'node_modules' --exclude '.git' \
  -e "ssh -i YOUR_KEY.pem" \
  . ubuntu@YOUR_EC2_IP:/var/www/maxharris.io/

# On server - rebuild and restart
ssh -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP
cd /var/www/maxharris.io
npm install
npm run build
pm2 restart maxharris-io
```

---

## Troubleshooting

### Check if the app is running

```bash
pm2 status
pm2 logs maxharris-io --lines 50
```

### Check Nginx status

```bash
sudo systemctl status nginx
sudo nginx -t
tail -f /var/log/nginx/maxharris.io.error.log
```

### Port 4173 is already in use

```bash
# Find what's using the port
sudo lsof -i :4173

# Kill the process (use PID from above)
kill -9 PID
```

### Site not loading

1. Check if PM2 process is running: `pm2 status`
2. Check Nginx: `sudo systemctl status nginx`
3. Check security group: Ensure ports 80 and 443 are open in EC2 security group
4. Check DNS: `dig maxharris.io` should show your EC2 IP

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Renew certificate manually
sudo certbot renew --dry-run
```

---

## Security Checklist

- [ ] Configure EC2 Security Group to only allow ports 22, 80, 443
- [ ] Disable password authentication, use SSH keys only
- [ ] Set up UFW firewall
- [ ] Enable automatic security updates
- [ ] Configure fail2ban for SSH protection
- [ ] Regular backups of your application

---

## Useful Commands

```bash
# PM2 Commands
pm2 list                    # List all processes
pm2 logs maxharris-io       # View logs
pm2 restart maxharris-io    # Restart app
pm2 stop maxharris-io       # Stop app
pm2 delete maxharris-io     # Remove from PM2
pm2 monit                   # Monitor CPU/Memory

# Nginx Commands
sudo systemctl status nginx     # Check status
sudo systemctl restart nginx    # Restart Nginx
sudo systemctl reload nginx     # Reload config
sudo nginx -t                   # Test configuration

# View Logs
tail -f /var/www/maxharris.io/logs/combined.log
tail -f /var/log/nginx/maxharris.io.access.log
tail -f /var/log/nginx/maxharris.io.error.log
```

---

## Performance Optimization

### 1. Enable Nginx Caching

Add to your Nginx config:

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### 2. Monitor Performance

```bash
# Install monitoring tools
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M

# Monitor resources
htop
pm2 monit
```

---

## Support

If you encounter issues:

1. Check the troubleshooting section
2. Review logs: `pm2 logs maxharris-io`
3. Check Nginx error logs: `/var/log/nginx/maxharris.io.error.log`

Good luck with your deployment! 🚀
