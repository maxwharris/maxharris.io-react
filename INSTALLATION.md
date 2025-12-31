# Server Installation Guide for maxharris.io

This guide helps you set up a fresh EC2 instance from scratch to host your React portfolio.

---

## Prerequisites

- AWS EC2 instance (Ubuntu 20.04/22.04 LTS recommended)
- SSH key pair (`.pem` file)
- Basic command line knowledge

### Recommended EC2 Instance

- **Type**: t2.micro or t3.micro (Free tier eligible)
- **OS**: Ubuntu Server 22.04 LTS
- **Storage**: 20GB SSD
- **Security Group**: Allow ports 22, 80, 443

---

## Step 1: Connect to Your EC2 Instance

### From Windows (PowerShell):

```powershell
# Change permissions on your key file (first time only)
icacls "C:\path\to\your-key.pem" /inheritance:r
icacls "C:\path\to\your-key.pem" /grant:r "$($env:USERNAME):(R)"

# Connect via SSH
ssh -i "C:\path\to\your-key.pem" ubuntu@YOUR_EC2_IP
```

### From Mac/Linux:

```bash
# Change permissions on your key file (first time only)
chmod 400 /path/to/your-key.pem

# Connect via SSH
ssh -i /path/to/your-key.pem ubuntu@YOUR_EC2_IP
```

---

## Step 2: Transfer Installation Script

### Method 1: Direct Download (If you have it on GitHub)

```bash
# On EC2 instance
wget https://raw.githubusercontent.com/YOUR_USERNAME/maxharris.io-react/main/install-server.sh
chmod +x install-server.sh
```

### Method 2: SCP Transfer from Local Machine

**From Windows (PowerShell):**
```powershell
scp -i "C:\path\to\your-key.pem" install-server.sh ubuntu@YOUR_EC2_IP:~/
```

**From Mac/Linux:**
```bash
scp -i /path/to/your-key.pem install-server.sh ubuntu@YOUR_EC2_IP:~/
```

---

## Step 3: Run Installation Script

```bash
# On EC2 instance
chmod +x install-server.sh
./install-server.sh
```

The script will install:
- ✅ Node.js v20.x LTS
- ✅ npm & PM2 process manager
- ✅ Nginx web server
- ✅ Certbot (SSL certificates)
- ✅ UFW firewall
- ✅ fail2ban (SSH protection)
- ✅ Log rotation
- ✅ Swap file (2GB)
- ✅ Automatic security updates

**Installation takes approximately 5-10 minutes.**

---

## Step 4: Configure AWS Security Group

Ensure your EC2 Security Group allows these ports:

| Type  | Protocol | Port Range | Source    | Description          |
|-------|----------|------------|-----------|----------------------|
| SSH   | TCP      | 22         | Your IP   | SSH access           |
| HTTP  | TCP      | 80         | 0.0.0.0/0 | Web traffic          |
| HTTPS | TCP      | 443        | 0.0.0.0/0 | Secure web traffic   |

### How to Update Security Group:

1. Go to EC2 Dashboard in AWS Console
2. Click "Security Groups" in left sidebar
3. Select your instance's security group
4. Click "Edit inbound rules"
5. Add the rules above
6. Click "Save rules"

---

## Step 5: Verify Installation

After the script completes, verify everything is installed:

```bash
# Check Node.js
node --version          # Should show v20.x.x
npm --version           # Should show 10.x.x

# Check PM2
pm2 --version          # Should show 5.x.x

# Check Nginx
sudo systemctl status nginx    # Should show "active (running)"

# Check Firewall
sudo ufw status               # Should show "Status: active"

# Check fail2ban
sudo systemctl status fail2ban # Should show "active (running)"
```

---

## Step 6: Deploy Your Application

Now you're ready to deploy! Choose one of these methods:

### Option A: Automated PowerShell Script (Windows)

```powershell
# From your local project directory
.\deploy-to-ec2.ps1 -EC2Host "YOUR_EC2_IP" -KeyPath "C:\path\to\your-key.pem"
```

### Option B: Manual Deployment

```bash
# 1. Build locally
npm install
npm run build

# 2. Create deployment package
tar -czf maxharris-deploy.tar.gz --exclude=node_modules --exclude=.git .

# 3. Transfer to server
scp -i YOUR_KEY.pem maxharris-deploy.tar.gz ubuntu@YOUR_EC2_IP:/tmp/

# 4. SSH to server
ssh -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP

# 5. Extract and deploy
cd /var/www/maxharris.io
tar -xzf /tmp/maxharris-deploy.tar.gz
chmod +x deploy.sh
./deploy.sh
```

### Option C: Git Clone (Recommended for Updates)

```bash
# On EC2 instance
cd /var/www
sudo rm -rf maxharris.io  # If directory exists
sudo git clone https://github.com/YOUR_USERNAME/maxharris.io-react.git maxharris.io
cd maxharris.io
chmod +x deploy.sh
./deploy.sh
```

---

## Step 7: Configure DNS

Point your domain to your EC2 instance:

### Using Route 53 (AWS):

1. Go to Route 53 Dashboard
2. Select your hosted zone (maxharris.io)
3. Create/Update A records:
   - **Name**: `@` (root domain)
   - **Type**: A
   - **Value**: Your EC2 Public IP
   - **TTL**: 300

4. Create/Update A record for www:
   - **Name**: `www`
   - **Type**: A
   - **Value**: Your EC2 Public IP
   - **TTL**: 300

### Using Other DNS Provider:

1. Log in to your domain registrar (Namecheap, GoDaddy, etc.)
2. Go to DNS settings
3. Add/Update A records:
   - `@` → Your EC2 IP
   - `www` → Your EC2 IP

**Wait 5-15 minutes for DNS propagation.**

### Verify DNS:

```bash
# Check if DNS is propagated
nslookup maxharris.io
dig maxharris.io

# Should return your EC2 IP address
```

---

## Step 8: Install SSL Certificate

**IMPORTANT:** Only run this AFTER DNS is configured and pointing to your server!

```bash
# On EC2 instance
sudo certbot --nginx -d maxharris.io -d www.maxharris.io
```

Follow the prompts:
1. Enter your email address
2. Agree to terms of service
3. Choose whether to redirect HTTP to HTTPS (recommended: Yes)

Certbot will:
- Obtain SSL certificate from Let's Encrypt
- Configure Nginx for HTTPS
- Set up automatic renewal (certificates expire every 90 days)

### Verify SSL:

Visit `https://maxharris.io` in your browser. You should see a padlock icon.

---

## Step 9: Test Auto-Renewal

```bash
# Test SSL certificate renewal
sudo certbot renew --dry-run
```

If successful, your certificates will auto-renew before expiration.

---

## Post-Installation Checklist

- [ ] Server installation script completed successfully
- [ ] EC2 Security Group configured (ports 22, 80, 443)
- [ ] Application deployed and running
- [ ] PM2 process is active: `pm2 status`
- [ ] Nginx is running: `sudo systemctl status nginx`
- [ ] DNS configured and propagated
- [ ] SSL certificate installed
- [ ] Site accessible at https://maxharris.io
- [ ] Auto-renewal test passed

---

## Monitoring & Maintenance

### Check Application Status

```bash
# PM2 status
pm2 status
pm2 logs maxharris-io
pm2 monit

# Nginx status
sudo systemctl status nginx
sudo nginx -t

# View logs
tail -f /var/www/maxharris.io/logs/combined.log
tail -f /var/log/nginx/maxharris.io.access.log
tail -f /var/log/nginx/maxharris.io.error.log
```

### System Resources

```bash
# Disk space
df -h

# Memory usage
free -h

# CPU usage
htop  # Install with: sudo apt install htop
```

### Security

```bash
# Check firewall
sudo ufw status verbose

# Check fail2ban
sudo fail2ban-client status sshd

# Update system
sudo apt update && sudo apt upgrade -y
```

---

## Troubleshooting

### Site not accessible

```bash
# Check if PM2 is running
pm2 status

# Check if Nginx is running
sudo systemctl status nginx

# Check firewall
sudo ufw status

# Check if port 4173 is listening
sudo lsof -i :4173
```

### SSL certificate issues

```bash
# Check certificate status
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal
```

### Out of memory

```bash
# Check swap
free -h

# Add more swap if needed
sudo fallocate -l 4G /swapfile2
sudo chmod 600 /swapfile2
sudo mkswap /swapfile2
sudo swapon /swapfile2
```

### Application crashes

```bash
# View PM2 logs
pm2 logs maxharris-io --lines 100

# Restart application
pm2 restart maxharris-io

# Clear PM2 logs
pm2 flush
```

---

## Backup Strategy

### Backup Application Files

```bash
# Create backup
cd /var/www
sudo tar -czf maxharris-io-backup-$(date +%Y%m%d).tar.gz maxharris.io/

# Download to local machine
scp -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP:/var/www/maxharris-io-backup-*.tar.gz .
```

### Automated Backups (Optional)

```bash
# Create backup script
sudo nano /usr/local/bin/backup-maxharris.sh
```

Add:
```bash
#!/bin/bash
cd /var/www
tar -czf /home/ubuntu/backups/maxharris-io-$(date +%Y%m%d).tar.gz maxharris.io/
find /home/ubuntu/backups -name "maxharris-io-*.tar.gz" -mtime +7 -delete
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/backup-maxharris.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-maxharris.sh") | crontab -
```

---

## Updating Your Site

Whenever you make changes:

```bash
# SSH to server
ssh -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP

# Navigate to app directory
cd /var/www/maxharris.io

# Pull changes (if using Git)
git pull origin main

# Or upload new files via SCP
# scp -i YOUR_KEY.pem -r . ubuntu@YOUR_EC2_IP:/var/www/maxharris.io/

# Install dependencies and rebuild
npm install
npm run build

# Restart application
pm2 restart maxharris-io
```

---

## Performance Tips

1. **Enable Nginx caching** - Add to Nginx config
2. **Optimize images** - Use WebP format, compress images
3. **Enable Brotli compression** - Better than gzip
4. **Use CDN** - CloudFlare for static assets
5. **Monitor with PM2 Plus** - Advanced monitoring

---

## Support & Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Certbot Documentation](https://certbot.eff.org/docs/)
- [AWS EC2 Documentation](https://docs.aws.amazon.com/ec2/)

---

## Need Help?

If you encounter issues:

1. Check the troubleshooting section above
2. Review logs: `pm2 logs maxharris-io`
3. Check Nginx logs: `/var/log/nginx/maxharris.io.error.log`
4. Verify EC2 Security Group settings
5. Ensure DNS is properly configured

Good luck with your deployment! 🚀
