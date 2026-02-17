# TTPU CRM Deployment Guide (PM2 + Supervisor, Docker'siz)

Ushbu yo‘riqnoma `server/` (Django API) + `dashboard/` (Next.js) + `bot1_service/` va `bot2_service/` (Python Telegram bot servislar) ni **Docker ishlatmasdan** VPS/production serverda doimiy ishlatish uchun.

- **Next.js**: PM2 orqali
- **Django + bot servislar**: Supervisor orqali
- Reverse-proxy va TLS: Nginx (+ Certbot) orqali

> Mos OS: Ubuntu 22.04+/Debian 12+. Buyruqlar Debian/Ubuntu uchun yozilgan.

---

## 0) Arxitektura (domain -> local port)

Misol:

- Server public IP: `203.0.113.10`
- API domain: `api.example.uz`
- Dashboard domain: `crm.example.uz`

Nginx domen so‘rovini ichki local portlarga reverse-proxy qiladi:

- `api.example.uz` -> `127.0.0.1:8000` (Gunicorn/Django)
- `crm.example.uz` -> `127.0.0.1:3000` (Next.js)

---

## 1) OS tayyorgarlik (paketlar)

```bash
sudo apt-get update
sudo apt-get install -y git curl nginx supervisor python3 python3-venv python3-pip
```

### Node.js (dashboard uchun)

Node’ni LTS’ga o‘rnating (18/20/22 LTS’dan biri). Masalan Node 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### PM2

PM2’ni global o‘rnating:

```bash
sudo npm i -g pm2
```

---

## 2) Kodni serverga joylash

Ko‘p hollarda qulay joy: `/opt/ttpu_crm`.

> Agar loyiha sizda boshqa joyda turgan bo‘lsa (masalan `pwd` → `/home/giga/ttpu_crm`), shu yo‘riqnomadagi barcha `/opt/ttpu_crm` pathlarni **o‘zingizdagi real path**ga almashtiring. Supervisor’dagi `directory=` va `command=` aynan shu path’ga mos bo‘lishi shart.

```bash
sudo mkdir -p /opt/ttpu_crm
sudo chown -R $USER:$USER /opt/ttpu_crm
cd /opt/ttpu_crm

# Repo’ni clone qiling (yoki rsync/scp bilan ko‘chiring)
# git clone <YOUR_REPO_URL> .
```

> Agar sizda repo allaqachon bor bo‘lsa, shunchaki shu strukturani `/opt/ttpu_crm`ga ko‘chiring.

---

## 3) Backend (Django API) sozlash

### 3.1. Virtualenv + requirements

```bash
cd /opt/ttpu_crm/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3.2. `.env` tayyorlash

```bash
cd /opt/ttpu_crm/server
cp .env.example .env
```

Production uchun minimal muhim qiymatlar (misol):

```env
DJANGO_SECRET_KEY=replace-me-with-strong-secret
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=api.example.uz
CSRF_TRUSTED_ORIGINS=https://api.example.uz,https://crm.example.uz
CORS_ALLOWED_ORIGINS=https://crm.example.uz

# DB: tez start uchun SQLite
USE_SQLITE=1

# JWT cookie security (HTTPS bo‘lsa true)
JWT_COOKIE_SECURE=true
JWT_COOKIE_SAMESITE=Lax

# Service token hashlar (botlar uchun)
SERVICE_TOKEN_BOT1_HASH=<sha256-of-bot1-raw-token>
SERVICE_TOKEN_BOT2_HASH=<sha256-of-bot2-raw-token>

# Reverse proxy / HTTPS (Nginx ortida)
USE_X_FORWARDED_HOST=true
SECURE_PROXY_SSL_HEADER_ENABLED=true
SECURE_SSL_REDIRECT=true
SESSION_COOKIE_SECURE=true
CSRF_COOKIE_SECURE=true
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=true
SECURE_HSTS_PRELOAD=true
```

> Service tokenlar haqida batafsil: [SERVICE_TOKEN_QOLLANMA.md](SERVICE_TOKEN_QOLLANMA.md).

### 3.3. Migrate + collectstatic + admin

```bash
cd /opt/ttpu_crm/server
source .venv/bin/activate
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py create_admin --email admin@example.com --password 'StrongPass!123'
```

---

## 4) Bot1/Bot2 servislar sozlash

### 4.1. Bot1

```bash
cd /opt/ttpu_crm/bot1_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

`bot1_service/.env` ichida production uchun:

```env
BOT_TOKEN=<telegram-bot-token>
SERVER_BASE_URL=https://api.example.uz/api/v1
SERVICE_TOKEN=<raw-bot1-service-token>
DASHBOARD_EMAIL=admin@example.com
DASHBOARD_PASSWORD=StrongPass!123
DEFAULT_LANGUAGE=uz
CATALOG_CACHE_TTL=900
```

### 4.2. Bot2

```bash
cd /opt/ttpu_crm/bot2_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

`bot2_service/.env` ichida production uchun:

```env
BOT_TOKEN=<telegram-bot-token>
SERVER_BASE_URL=https://api.example.uz/api/v1
SERVICE_TOKEN=<raw-bot2-service-token>
DEFAULT_LANGUAGE=uz
DASHBOARD_EMAIL=
DASHBOARD_PASSWORD=
```

---

## 5) Supervisor orqali doimiy ishga tushirish (API + botlar)

Supervisor konfiguratsiyalari odatda: `/etc/supervisor/conf.d/*.conf`

### 5.1. Django API (Gunicorn)

Fayl yarating: `/etc/supervisor/conf.d/ttpu-api.conf`

```ini
[program:ttpu-api]
directory=/opt/ttpu_crm/server
command=/opt/ttpu_crm/server/.venv/bin/gunicorn crm_server.wsgi:application -c gunicorn.conf.py
user=www-data
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/ttpu-api.out.log
stderr_logfile=/var/log/ttpu-api.err.log
environment=PATH="/opt/ttpu_crm/server/.venv/bin",PYTHONUNBUFFERED="1"
```

### 5.2. Bot1

Fayl yarating: `/etc/supervisor/conf.d/ttpu-bot1.conf`

```ini
[program:ttpu-bot1]
directory=/opt/ttpu_crm/bot1_service
command=/opt/ttpu_crm/bot1_service/.venv/bin/python -m bot1_service.main
user=www-data
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/ttpu-bot1.out.log
stderr_logfile=/var/log/ttpu-bot1.err.log
environment=PATH="/opt/ttpu_crm/bot1_service/.venv/bin",PYTHONUNBUFFERED="1"
```

### 5.3. Bot2

Fayl yarating: `/etc/supervisor/conf.d/ttpu-bot2.conf`

```ini
[program:ttpu-bot2]
directory=/opt/ttpu_crm/bot2_service
command=/opt/ttpu_crm/bot2_service/.venv/bin/python -m bot2_service.main
user=www-data
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/ttpu-bot2.out.log
stderr_logfile=/var/log/ttpu-bot2.err.log
environment=PATH="/opt/ttpu_crm/bot2_service/.venv/bin",PYTHONUNBUFFERED="1"
```

### 5.4. Supervisor’ni reload qilish

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status
```

Log ko‘rish:

```bash
sudo tail -n 200 /var/log/ttpu-api.err.log
sudo tail -n 200 /var/log/ttpu-bot1.err.log
sudo tail -n 200 /var/log/ttpu-bot2.err.log
```

---

## 6) Dashboard (Next.js) – PM2 orqali

### 6.1. `.env`

```bash
cd /opt/ttpu_crm/dashboard
cp .env.example .env 2>/dev/null || true
```

`dashboard/.env`:

```env
NEXT_PUBLIC_API_URL=https://api.example.uz
```

### 6.2. Install + build

```bash
cd /opt/ttpu_crm/dashboard
npm ci
npm run build
```

### 6.3. PM2 bilan start

Variant A (oddiy):

```bash
cd /opt/ttpu_crm/dashboard
pm2 start npm --name ttpu-dashboard -- start -- -p 3000 -H 127.0.0.1
pm2 save
```

Autostart (reboot’dan keyin ham turishi uchun):

```bash
pm2 startup systemd
# Chiqqan buyruqni sudo bilan ishga tushiring
pm2 save
```

> Agar PM2’ni `www-data` yoki alohida `deploy` user ostida yuritmoqchi bo‘lsangiz, `pm2 startup systemd -u <user> --hp /home/<user>` ishlating.

Log:

```bash
pm2 logs ttpu-dashboard --lines 200
```

---

## 7) Nginx reverse proxy (API + Dashboard)

Fayl: `/etc/nginx/sites-available/ttpu.conf`

```nginx
# API domain
server {
    listen 80;
    server_name api.example.uz;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Dashboard domain
server {
    listen 80;
    server_name crm.example.uz;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable + tekshirish:

```bash
sudo ln -sf /etc/nginx/sites-available/ttpu.conf /etc/nginx/sites-enabled/ttpu.conf
sudo nginx -t
sudo systemctl reload nginx
```

### TLS (Certbot, tavsiya)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.uz -d crm.example.uz
```

---

## 8) Update (release) qilish tartibi

### Backend

```bash
cd /opt/ttpu_crm
# git pull
cd server
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo supervisorctl restart ttpu-api
```

### Dashboard

```bash
cd /opt/ttpu_crm/dashboard
# git pull
npm ci
npm run build
pm2 restart ttpu-dashboard
```

### Botlar

```bash
cd /opt/ttpu_crm/bot1_service
source .venv/bin/activate
pip install -r requirements.txt
sudo supervisorctl restart ttpu-bot1

cd /opt/ttpu_crm/bot2_service
source .venv/bin/activate
pip install -r requirements.txt
sudo supervisorctl restart ttpu-bot2
```

---

## 9) Tez-tez uchraydigan muammolar

- **Cookie auth ishlamayapti (dashboard login/refresh)**: production’da `JWT_COOKIE_SECURE=true` bo‘lishi va sayt HTTPS’da ishlashi kerak. `CSRF_TRUSTED_ORIGINS` va `CORS_ALLOWED_ORIGINS` domenlarga moslanganini tekshiring.
- **Botlar 403 qaytaryapti**: bot `.env` dagi `SERVICE_TOKEN` (raw) va `server/.env` dagi `SERVICE_TOKEN_BOT*_HASH` bir-biriga mos (sha256) ekanini tekshiring.
- **Nginx 502**: `sudo supervisorctl status` (API/botlar) va `pm2 status` (dashboard) tekshiring; portlar `127.0.0.1:8000` va `127.0.0.1:3000` band emasligini ko‘ring.
