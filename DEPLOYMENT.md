# TTPU CRM Deployment Guide (Docker'siz)

> PM2 (Next.js) va Supervisor (Django+botlar) orqali deploy varianti uchun: `DEPLOYMENT_PM2_SUPERVISOR.md`.

Ushbu yo'riqnoma loyiha komponentlarini Docker ishlatmasdan, VPS/serverda doimiy ishlatish uchun.

## 1) Arxitektura (domain -> IP)

Misol:

- Server public IP: `203.0.113.10`
- API domain: `api.example.uz`
- Dashboard domain: `crm.example.uz`

DNS:

- `api.example.uz A 203.0.113.10`
- `crm.example.uz A 203.0.113.10`

Nginx domen so'rovini ichki local portlarga yuboradi:

- `api.example.uz` -> `127.0.0.1:8000` (Django/Gunicorn)
- `crm.example.uz` -> `127.0.0.1:3000` (Next.js)

> Ya'ni foydalanuvchi domenni uradi, Nginx shu domenni local IP/portga reverse-proxy qiladi.

---

## 2) Server (Django) run

### 2.1. Install

```bash
cd /opt/ttpu_crm/server
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### 2.2. Muhim `.env` production qiymatlar

```env
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=api.example.uz
CSRF_TRUSTED_ORIGINS=https://api.example.uz,https://crm.example.uz
CORS_ALLOWED_ORIGINS=https://crm.example.uz

JWT_COOKIE_SECURE=true
JWT_COOKIE_SAMESITE=Lax

USE_X_FORWARDED_HOST=true
SECURE_PROXY_SSL_HEADER_ENABLED=true
SECURE_SSL_REDIRECT=true
SESSION_COOKIE_SECURE=true
CSRF_COOKIE_SECURE=true
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=true
SECURE_HSTS_PRELOAD=true
```

### 2.3. Migrate + admin

```bash
cd /opt/ttpu_crm/server
source .venv/bin/activate
python manage.py migrate
python manage.py create_admin --email admin@example.com --password 'StrongPass!123'
```

### 2.4. Gunicorn (manual test)

```bash
cd /opt/ttpu_crm/server
source .venv/bin/activate
gunicorn crm_server.wsgi:application -c gunicorn.conf.py
```

---

## 3) Dashboard (Next.js) run

### 3.1. Install/build

```bash
cd /opt/ttpu_crm/dashboard
npm ci
cp .env.example .env
```

`.env`:

```env
NEXT_PUBLIC_API_URL=https://api.example.uz
```

Build + start:

```bash
npm run build
npm run start -- -p 3000 -H 127.0.0.1
```

---

## 4) Bot1/Bot2 run

### 4.1. Bot1

```bash
cd /opt/ttpu_crm/bot1_service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m bot1_service.main
```

### 4.2. Bot2

```bash
cd /opt/ttpu_crm/bot2_service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python -m bot2_service.main
```

Bot `.env` uchun muhim:

```env
SERVER_BASE_URL=https://api.example.uz/api/v1
SERVICE_TOKEN=<raw-service-token>
```

---

## 5) Systemd (doimiy run)

Quyidagi service fayllarni `/etc/systemd/system/` ga qo'ying.

### 5.1 ttpu-server.service

```ini
[Unit]
Description=TTPU CRM Django API (Gunicorn)
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/ttpu_crm/server
Environment=PATH=/opt/ttpu_crm/server/.venv/bin
ExecStart=/opt/ttpu_crm/server/.venv/bin/gunicorn crm_server.wsgi:application -c gunicorn.conf.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 5.2 ttpu-dashboard.service

```ini
[Unit]
Description=TTPU CRM Dashboard (Next.js)
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/ttpu_crm/dashboard
ExecStart=/usr/bin/npm run start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### 5.3 ttpu-bot1.service

```ini
[Unit]
Description=TTPU Bot1 Service
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/ttpu_crm/bot1_service
Environment=PATH=/opt/ttpu_crm/bot1_service/.venv/bin
ExecStart=/opt/ttpu_crm/bot1_service/.venv/bin/python -m bot1_service.main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 5.4 ttpu-bot2.service

```ini
[Unit]
Description=TTPU Bot2 Service
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/ttpu_crm/bot2_service
Environment=PATH=/opt/ttpu_crm/bot2_service/.venv/bin
ExecStart=/opt/ttpu_crm/bot2_service/.venv/bin/python -m bot2_service.main
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ttpu-server ttpu-dashboard ttpu-bot1 ttpu-bot2
sudo systemctl status ttpu-server ttpu-dashboard ttpu-bot1 ttpu-bot2
```

---

## 6) Nginx config (domain -> IP -> local service)

`/etc/nginx/sites-available/ttpu.conf`:

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

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/ttpu.conf /etc/nginx/sites-enabled/ttpu.conf
sudo nginx -t
sudo systemctl reload nginx
```

### SSL (tavsiya)

```bash
sudo apt-get install certbot python3-certbot-nginx -y
sudo certbot --nginx -d api.example.uz -d crm.example.uz
```

---

## 7) Domain -> IP bo'yicha muhim izohlar

1. `proxy_set_header Host $host;` ni qoldiring — Django `ALLOWED_HOSTS` tekshiruvi uchun kerak.
2. `DJANGO_ALLOWED_HOSTS` ichiga **domain** kiradi (`api.example.uz`), IP emas (agar IP orqali ham kirsa, IPni ham qo'shing).
3. HTTPS ishlaganda `SECURE_PROXY_SSL_HEADER_ENABLED=true` bo'lishi shart, aks holda Django request'ni `http` deb qabul qilishi mumkin.
4. Dashboard `.env` da `NEXT_PUBLIC_API_URL` har doim API domain bo'lsin (`https://api.example.uz`).
5. Botlarda `SERVER_BASE_URL=https://api.example.uz/api/v1` ishlating (IP emas, domain).

---

## 8) Tezkor diagnostika

```bash
# service loglar
journalctl -u ttpu-server -f
journalctl -u ttpu-dashboard -f
journalctl -u ttpu-bot1 -f
journalctl -u ttpu-bot2 -f

# API health (misol)
curl -I https://api.example.uz/api/docs/

# dashboard
curl -I https://crm.example.uz/login
```

## 9) Gunicorn `WORKER TIMEOUT (no URI read)` haqida

Bu xatolik odatda server portiga HTTP bo'lmagan ulanish (scanner/probe) kelganda yuz beradi.
Amaliy yechimlar:

1. Gunicornni public IPga emas, `127.0.0.1`ga bind qiling va tashqi trafikni faqat Nginx orqali kiriting.
2. Nginx health-check yoki monitoring uchun `GET /api/v1/healthz` ishlating.
3. Gunicorn konfiguratsiyasini `server/gunicorn.conf.py` orqali yuriting (`timeout=120`, `gthread` worker).
