# Deployment Guide

## Quick Deployment Steps

1. **Clone the repository** (already done)
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   # Copy the example configuration
   cp .env .env.production
   
   # Edit with your HikCentral credentials
   nano .env.production
   ```

4. **Update configuration** in `.env.production`:
   ```env
   # Replace with your actual HikCentral server details
   HIKCENTRAL_BASE_URL=https://your-hikcentral-server.com/artemis
   HIKCENTRAL_APP_KEY=your-app-key
   HIKCENTRAL_APP_SECRET=your-app-secret
   HIKCENTRAL_USER_ID=your-username
   HIKCENTRAL_ORG_INDEX_CODE=your-org-code
   HIKCENTRAL_VERIFY_SSL=true  # Set to true for production
   ```

5. **Start the application**:
   ```bash
   # For development/testing
   node app.js
   
   # For production (recommended)
   npm install -g pm2
   pm2 start app.js --name "hikcentral-middleware"
   pm2 save
   pm2 startup
   ```

## Production Deployment Options

### Option 1: Direct Node.js (Simple)
```bash
# Install dependencies
npm install

# Start with production config
NODE_ENV=production node app.js
```

### Option 2: PM2 Process Manager (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start application
pm2 start app.js --name hikcentral-middleware

# Save current processes
pm2 save

# Setup startup script
pm2 startup

# View logs
pm2 logs hikcentral-middleware

# Monitor processes
pm2 monit
```

### Option 3: Systemd Service (Linux)
Create `/etc/systemd/system/hikcentral-middleware.service`:
```ini
[Unit]
Description=HikCentral Middleware
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/your/app
ExecStart=/usr/bin/node app.js
Restart=always
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_PATH=/usr/lib/node_modules

[Install]
WantedBy=multi-user.target
```

Then enable and start:
```bash
sudo systemctl enable hikcentral-middleware
sudo systemctl start hikcentral-middleware
sudo systemctl status hikcentral-middleware
```

## Firewall Configuration

Allow port 3000:
```bash
# Ubuntu/Debian
sudo ufw allow 3000

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

## SSL/HTTPS Setup

### Option 1: Nginx Reverse Proxy + Let's Encrypt
```bash
# Install Nginx
sudo apt install nginx  # Ubuntu/Debian
sudo yum install nginx  # CentOS/RHEL

# Install Certbot
sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian
sudo yum install certbot python3-certbot-nginx  # CentOS/RHEL

# Configure Nginx
sudo nano /etc/nginx/sites-available/hikcentral-middleware
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable SSL:
```bash
sudo ln -s /etc/nginx/sites-available/hikcentral-middleware /etc/nginx/sites-enabled
sudo nginx -t
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

### Option 2: Direct SSL in Node.js
Update `app.js` to use HTTPS:
```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('/path/to/private.key'),
  cert: fs.readFileSync('/path/to/certificate.crt')
};

https.createServer(options, app).listen(3000);
```

## Environment Variables

For production, set environment variables:
```bash
# Create .env file with production values
echo "HIKCENTRAL_BASE_URL=https://your-server.com/artemis" >> .env
echo "HIKCENTRAL_APP_KEY=your-key" >> .env
echo "HIKCENTRAL_APP_SECRET=your-secret" >> .env
echo "HIKCENTRAL_VERIFY_SSL=true" >> .env
```

## Monitoring and Logs

### PM2 Logs
```bash
pm2 logs hikcentral-middleware
pm2 logs hikcentral-middleware --lines 100
```

### System Logs
```bash
# View systemd logs
sudo journalctl -u hikcentral-middleware -f

# View application logs
tail -f /path/to/your/app/hikcentral_middleware.db
```

## Health Check

Test your deployment:
```bash
# Test API endpoint
curl http://localhost:3000/residents?email=test@example.com

# Test Admin UI
curl http://localhost:3000/

# Test HikCentral connectivity
curl http://localhost:3000/logs
```

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   sudo lsof -i :3000
   sudo kill -9 <PID>
   ```

2. **Permission denied**:
   ```bash
   sudo chown -R $USER:$USER /path/to/your/app
   ```

3. **Database permissions**:
   ```bash
   chmod 644 hikcentral_middleware.db
   ```

4. **Environment variables not loaded**:
   ```bash
   # Check if .env file exists and has correct permissions
   ls -la .env
   # Restart application after changes
   ```

### Debug Mode
```bash
# Start with debug logging
DEBUG=* node app.js

# Check database
sqlite3 hikcentral_middleware.db ".tables"
sqlite3 hikcentral_middleware.db "SELECT * FROM residents LIMIT 5;"
```

## Security Considerations

1. **Firewall**: Only allow necessary ports
2. **SSL**: Always use HTTPS in production
3. **Environment Variables**: Never commit .env files
4. **Database**: Backup regularly
5. **Updates**: Keep Node.js and dependencies updated

## Performance Optimization

1. **Increase Node.js memory**:
   ```bash
   node --max-old-space-size=4096 app.js
   ```

2. **Use clustering**:
   ```javascript
   const cluster = require('cluster');
   const numCPUs = require('os').cpus().length;
   
   if (cluster.isMaster) {
     for (let i = 0; i < numCPUs; i++) {
       cluster.fork();
     }
   } else {
     app.listen(3000);
   }
   ```

3. **Enable compression**:
   ```bash
   npm install compression
   app.use(require('compression')());
   ```

## Backup Strategy

1. **Database backup**:
   ```bash
   sqlite3 hikcentral_middleware.db ".backup backup_$(date +%Y%m%d).db"
   ```

2. **Application backup**:
   ```bash
   tar -czf backup_$(date +%Y%m%d).tar.gz app.js admin.html package*.json
   ```

3. **Automate backups**:
   ```bash
   # Add to crontab
   0 2 * * * /path/to/backup-script.sh
