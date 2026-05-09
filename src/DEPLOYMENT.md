# Deployment on VPS

## Prerequisites
- Docker & Docker Compose installed on VPS
- Linux server (Ubuntu 20.04+ recommended)

## Setup Steps

1. **Clone repo sau upload files pe VPS:**
   ```bash
   git clone <your-repo> && cd soso-pump-detector
   ```

2. **Create .env file:**
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   nano .env
   ```

3. **Build & start containers:**
   ```bash
   docker-compose up -d --build
   ```

4. **Check logs:**
   ```bash
   docker-compose logs -f app
   ```

5. **Access app:**
   Open `http://your-vps-ip:3000`

## Reverse Proxy (Nginx) - Optional

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
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Common Commands

```bash
# Stop containers
docker-compose down

# Restart
docker-compose restart

# View logs
docker-compose logs -f

# Update & redeploy
git pull && docker-compose up -d --build
```

## SSL/TLS (Let's Encrypt)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
``