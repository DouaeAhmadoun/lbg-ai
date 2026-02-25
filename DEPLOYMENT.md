# 🚀 Quick Start Deployment Guide

## Prerequisites
- Linux server (Ubuntu 22.04+ recommended)
- Docker & Docker Compose installed
- Root or sudo access

## 1. Install Docker (if not installed)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose -y

# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and back in for group changes
```

## 2. Deploy Application

```bash
# Navigate to project directory
cd /path/to/ppt-excel-automation

# Create .env file in backend
cd backend
cp .env.example .env

# Edit .env if needed (optional - API keys can be set via admin panel)
nano .env

# Go back to root
cd ..

# Build and start containers
docker-compose up -d

# Check logs
docker-compose logs -f
```

## 3. Access Application

Open your browser:
- **Frontend**: `http://your-server-ip`
- **Backend API**: `http://your-server-ip:8000`
- **Admin Panel**: `http://your-server-ip/admin`

**Default Login**: 
- Password: `admin123`
- ⚠️ **CHANGE THIS IMMEDIATELY!**

## 4. First-Time Setup

1. **Login to Admin Panel** (`/admin`)
2. **Change Password** (Settings section)
3. **Add API Keys**:
   - Claude: Get from https://console.anthropic.com/
   - OpenRouter: Get from https://openrouter.ai/ (optional)
4. **Test with a simple PPT file**

## 5. Useful Commands

```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Rebuild after code changes
docker-compose down
docker-compose build
docker-compose up -d

# Backup database
cp backend/app.db backend/app.db.backup

# Clean old files manually
docker-compose exec backend python -c "from utils.helpers import cleanup_old_files; print(f'Deleted {cleanup_old_files()} files')"
```

## 6. Troubleshooting

### Backend won't start
```bash
docker-compose logs backend
# Check for port conflicts, missing dependencies, etc.
```

### Frontend can't reach backend
```bash
# Check backend is running
curl http://localhost:8000/health

# Check nginx config
docker-compose exec frontend cat /etc/nginx/conf.d/default.conf
```

### Database errors
```bash
# Reset database (WARNING: deletes all data)
docker-compose down
rm backend/app.db
docker-compose up -d
```

### Out of disk space
```bash
# Check usage
df -h

# Clean Docker
docker system prune -a

# Clean old files via admin panel
# Go to /admin → File Cleanup → Cleanup button
```

## 7. Production Hardening (Optional)

### Add HTTPS with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Firewall Setup

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Restrict Admin Access

Edit `frontend/nginx.conf` and add:

```nginx
location /admin {
    allow 192.168.1.0/24;  # Your office IP range
    deny all;
    try_files $uri $uri/ /index.html;
}
```

## 8. Monitoring

### Check Application Health

```bash
# Backend health
curl http://localhost:8000/health

# Check database
docker-compose exec backend python -c "from models.database import init_db; import asyncio; asyncio.run(init_db()); print('DB OK')"
```

### View System Resources

```bash
# Container stats
docker stats

# Disk usage
du -sh backend/uploads backend/outputs
```

## 9. Updating the Application

```bash
# Pull latest code (if using git)
git pull

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d

# Verify
docker-compose ps
docker-compose logs -f
```

## 10. Backup Strategy

```bash
# Create backup script
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/ppt-excel"
mkdir -p $BACKUP_DIR

# Backup database
cp backend/app.db $BACKUP_DIR/app_$DATE.db

# Backup important files (last 7 days)
find backend/outputs -type f -mtime -7 -exec cp {} $BACKUP_DIR/ \;

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x backup.sh

# Run daily via cron
crontab -e
# Add: 0 2 * * * /path/to/backup.sh
```

## ✅ Verification Checklist

- [ ] Application accessible at http://your-server-ip
- [ ] Admin panel accessible and password changed
- [ ] API keys configured (Claude/OpenRouter)
- [ ] Test PPT translation with sample file
- [ ] Test Excel generation with sample data
- [ ] Logs showing no errors
- [ ] File cleanup working (check /admin stats)
- [ ] Backup script configured (optional)
- [ ] HTTPS configured (production only)
- [ ] Firewall configured (production only)

## 🆘 Getting Help

If something doesn't work:

1. **Check logs first**: `docker-compose logs -f`
2. **Verify services are running**: `docker-compose ps`
3. **Check backend health**: `curl http://localhost:8000/health`
4. **Verify API keys**: Login to `/admin` and check API Keys section
5. **Check server resources**: `df -h` and `free -h`

## 📊 Expected Performance

### Resource Usage
- RAM: ~2GB (backend + frontend)
- CPU: 2-4 cores recommended
- Disk: ~5GB + generated files

### Processing Speed
- PPT Translation: ~5-10 seconds per slide (depending on provider)
- Excel Generation: ~1-2 seconds per market
- File Retention: Auto-cleanup after 30 days

## 🎉 Success!

Your application should now be running. Test it with:
1. A simple Spanish or French PowerPoint
2. Upload client data + templates for Excel

Happy automating! 🚀
