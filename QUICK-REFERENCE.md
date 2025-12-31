# Quick Reference Card - maxharris.io

Essential commands for managing your deployed site.

---

## 🚀 First Time Setup

```bash
# 1. SSH to server
ssh -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP

# 2. Run installation script (once)
chmod +x install-server.sh
./install-server.sh

# 3. Deploy application
cd /var/www/maxharris.io
chmod +x deploy.sh
./deploy.sh

# 4. Configure DNS (point to EC2 IP)
# maxharris.io → YOUR_EC2_IP

# 5. Install SSL (after DNS propagates)
sudo certbot --nginx -d maxharris.io -d www.maxharris.io
```

---

## 📦 Automated Deployment (Windows)

```powershell
# From local project directory
.\deploy-to-ec2.ps1 -EC2Host "YOUR_EC2_IP" -KeyPath "path\to\key.pem"
```

---

## 🔄 Manual Update Workflow

```bash
# On local machine - build and transfer
npm run build
tar -czf maxharris-deploy.tar.gz --exclude=node_modules --exclude=.git .
scp -i YOUR_KEY.pem maxharris-deploy.tar.gz ubuntu@YOUR_EC2_IP:/tmp/

# On server - extract and restart
ssh -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP
cd /var/www/maxharris.io
tar -xzf /tmp/maxharris-deploy.tar.gz
npm install
npm run build
pm2 restart maxharris-io
```

---

## 🔧 PM2 Commands

```bash
pm2 status                    # Check status
pm2 logs maxharris-io         # View logs
pm2 logs maxharris-io --lines 100  # Last 100 lines
pm2 restart maxharris-io      # Restart app
pm2 stop maxharris-io         # Stop app
pm2 start ecosystem.config.cjs # Start app
pm2 delete maxharris-io       # Remove from PM2
pm2 monit                     # Real-time monitoring
pm2 flush                     # Clear logs
pm2 save                      # Save process list
```

---

## 🌐 Nginx Commands

```bash
sudo systemctl status nginx    # Check status
sudo systemctl start nginx     # Start Nginx
sudo systemctl stop nginx      # Stop Nginx
sudo systemctl restart nginx   # Restart Nginx
sudo systemctl reload nginx    # Reload config (no downtime)
sudo nginx -t                  # Test configuration
sudo nano /etc/nginx/sites-available/maxharris.io  # Edit config
tail -f /var/log/nginx/maxharris.io.access.log     # Access logs
tail -f /var/log/nginx/maxharris.io.error.log      # Error logs
```

---

## 🔒 SSL Certificate (Certbot)

```bash
sudo certbot --nginx -d maxharris.io -d www.maxharris.io  # Install SSL
sudo certbot certificates                  # List certificates
sudo certbot renew                         # Renew all certificates
sudo certbot renew --dry-run               # Test renewal
sudo certbot delete --cert-name maxharris.io  # Remove certificate
```

---

## 🔥 Firewall (UFW)

```bash
sudo ufw status                # Check firewall status
sudo ufw status verbose        # Detailed status
sudo ufw enable                # Enable firewall
sudo ufw disable               # Disable firewall
sudo ufw allow 80/tcp          # Allow HTTP
sudo ufw allow 443/tcp         # Allow HTTPS
sudo ufw delete allow 80/tcp   # Remove rule
```

---

## 📊 System Monitoring

```bash
# Disk space
df -h                          # Disk usage
du -sh /var/www/maxharris.io   # App directory size

# Memory
free -h                        # Memory usage
cat /proc/meminfo              # Detailed memory info

# CPU & Processes
top                            # Process viewer
htop                           # Better process viewer (install: sudo apt install htop)
ps aux | grep node             # Find Node processes

# Network
sudo netstat -tulpn            # Active connections
sudo lsof -i :4173             # What's using port 4173
curl http://localhost:4173     # Test local app
```

---

## 📝 Logs

```bash
# Application logs
tail -f /var/www/maxharris.io/logs/combined.log
tail -f /var/www/maxharris.io/logs/out.log
tail -f /var/www/maxharris.io/logs/err.log

# Nginx logs
tail -f /var/log/nginx/maxharris.io.access.log
tail -f /var/log/nginx/maxharris.io.error.log

# System logs
tail -f /var/log/syslog
journalctl -u nginx -f         # Nginx systemd logs
journalctl -xe                 # All system logs
```

---

## 🛠️ Troubleshooting

### Site not loading

```bash
# Check if app is running
pm2 status
curl http://localhost:4173

# Check Nginx
sudo systemctl status nginx
sudo nginx -t

# Check firewall
sudo ufw status

# Check Security Group in AWS Console
# Ensure ports 80, 443 are open
```

### App keeps crashing

```bash
# View error logs
pm2 logs maxharris-io --err --lines 50

# Check memory
free -h

# Restart with fresh logs
pm2 delete maxharris-io
pm2 start ecosystem.config.cjs
```

### Port already in use

```bash
# Find process on port 4173
sudo lsof -i :4173

# Kill process (replace PID)
sudo kill -9 PID

# Or kill all Node processes
sudo pkill -f node
```

### Out of disk space

```bash
# Check disk usage
df -h

# Find large files
du -ah /var/www/maxharris.io | sort -rh | head -20

# Clean PM2 logs
pm2 flush

# Clean old logs
sudo find /var/log -type f -name "*.log" -delete
sudo find /var/log -type f -name "*.gz" -delete

# Clean apt cache
sudo apt clean
sudo apt autoclean
```

### SSL not working

```bash
# Check certificate
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run

# Reinstall certificate
sudo certbot --nginx -d maxharris.io -d www.maxharris.io --force-renewal
```

---

## 🔐 Security

```bash
# Check fail2ban status
sudo systemctl status fail2ban
sudo fail2ban-client status sshd

# Unban IP
sudo fail2ban-client set sshd unbanip IP_ADDRESS

# Update system
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
```

---

## 💾 Backup & Restore

```bash
# Create backup
cd /var/www
sudo tar -czf ~/maxharris-backup-$(date +%Y%m%d).tar.gz maxharris.io/

# Download backup to local machine
scp -i YOUR_KEY.pem ubuntu@YOUR_EC2_IP:~/maxharris-backup-*.tar.gz .

# Restore from backup
cd /var/www
sudo tar -xzf ~/maxharris-backup-20240101.tar.gz
```

---

## 🚨 Emergency Commands

```bash
# App completely down - quick restart
pm2 restart maxharris-io
sudo systemctl reload nginx

# Nuclear option - restart everything
pm2 restart all
sudo systemctl restart nginx

# Reboot server (last resort)
sudo reboot
```

---

## 📍 Important Paths

```
Application:     /var/www/maxharris.io
App Logs:        /var/www/maxharris.io/logs/
Nginx Config:    /etc/nginx/sites-available/maxharris.io
Nginx Logs:      /var/log/nginx/
SSL Certs:       /etc/letsencrypt/live/maxharris.io/
PM2 Config:      /var/www/maxharris.io/ecosystem.config.cjs
```

---

## 🌐 URLs

```
Production:      https://maxharris.io
WWW:             https://www.maxharris.io
Direct Access:   http://YOUR_EC2_IP:4173
```

---

## 📞 Quick Contact Info

```
Domain Registrar: [Your registrar]
DNS Provider:     [Route53 / Other]
EC2 Region:       [us-east-1 / etc]
Instance ID:      [i-xxxxxxxxx]
EC2 IP:           [YOUR_EC2_IP]
```

---

## 💡 Tips

- Always test builds locally first: `npm run build && npm run preview`
- Check logs after deployment: `pm2 logs maxharris-io`
- Monitor during high traffic: `pm2 monit`
- Test SSL: `https://www.ssllabs.com/ssltest/`
- Keep dependencies updated: `npm outdated`
- Backup before major changes
- Use Git for version control

---

## 🔗 Resources

- PM2: https://pm2.keymetrics.io/docs/
- Nginx: https://nginx.org/en/docs/
- Certbot: https://certbot.eff.org/
- AWS EC2: https://aws.amazon.com/ec2/

---

**Last Updated:** 2025-12-30
