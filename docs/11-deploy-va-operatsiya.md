# O'rnatish, Deploy va Operatsiya

Bu hujjat TTPU CRM loyihasini **lokal kompyuterda ishga tushirish**, **Docker** orqali ko'tarish va **production serverda** doimiy ishlatish (deploy) jarayonlarini bosqichma-bosqich tushuntiradi. Shuningdek, Gunicorn sozlamalari, production `.env` talablari, ma'lumotlar bazasi tanlovi (SQLite/Postgres), service-token o'rnatish va barcha boshqaruv (management) komandalari shu yerda yig'ilgan.

Hujjat loyihaga yangi qo'shilgan dasturchi uchun mo'ljallangan: shu yo'riqnomani o'qib, hech qanday tashqi bilimsiz tizimni ishga tushira olishi kerak.

> **MUHIM ESLATMA (eskirgan ma'lumotlar):** Avval loyihada **"Bot 1"** (`bot1_service`, `/api/v1/bot1`, `SERVICE_TOKEN_BOT1_HASH`, `ttpu-bot1` systemd/supervisor unit) mavjud edi. **U butunlay olib tashlangan va kodda mavjud emas.** Agar ba'zi eski hujjatlarda (`SERVICE_TOKEN_QOLLANMA.md`, `PROJECT_DOCUMENTATION.md`) hali "Bot 1" izlari uchrasa, ularga e'tibor bermang. Hozir loyiha faqat uchta komponentdan iborat:
>
> - **Backend** — Django + DRF (`server/`)
> - **Bot 2** — Telegram so'rovnoma boti (`bot2_service/`)
> - **Dashboard** — Next.js boshqaruv paneli (`dashboard/`)
>
> Quyida faqat hozir mavjud bo'lgan narsalar hujjatlashtirilgan.

---

## 1. Komponentlar va portlar

Loyiha uchta mustaqil servisdan iborat. Production'da odatda quyidagicha taqsimlanadi:

```
                                  ┌────────────────────────────┐
   Internet (HTTPS)               │           Server VPS        │
        │                         │                             │
        ▼                         │   ┌──────────────────────┐  │
  ┌──────────┐    api.example.uz  │   │  Gunicorn / Django   │  │
  │  Nginx   │ ─────────────────► │   │  127.0.0.1:8000      │  │  ← backend (server/)
  │ (reverse │                    │   └──────────────────────┘  │
  │  proxy)  │    crm.example.uz  │   ┌──────────────────────┐  │
  │  + TLS   │ ─────────────────► │   │  Next.js             │  │
  └──────────┘                    │   │  127.0.0.1:3000      │  │  ← dashboard (dashboard/)
                                  │   └──────────────────────┘  │
                                  │   ┌──────────────────────┐  │
   Telegram API ◄─────────────────►  │  Bot 2 (long polling)│  │  ← bot (bot2_service/)
                                  │   │  port ochmaydi       │  │
                                  │   └──────────────────────┘  │
                                  └────────────────────────────┘
```

| Komponent | Manba katalogi | Texnologiya | Port | Tashqi domen (misol) |
| --- | --- | --- | --- | --- |
| Backend API | `server/` | Python 3.12, Django 5, DRF, Gunicorn | `8000` | `api.example.uz` |
| Dashboard | `dashboard/` | Node 20, Next.js | `3000` | `crm.example.uz` |
| Bot 2 | `bot2_service/` | Python 3.11, aiogram 3 | port ochmaydi (Telegram'ga long-polling) | — |

> Bot 2 hech qanday port ochmaydi va Nginx ortida joylashmaydi — u Telegram serverlariga **chiquvchi** ulanish (long polling) o'rnatadi va backend API'ga `SERVER_BASE_URL` orqali murojaat qiladi.

---

## 2. Lokal ishga tushirish (development)

Pastdagi har bir komponentni alohida terminalda ishga tushirish mumkin. Eng oson yo'l — backend uchun SQLite ishlatish (`USE_SQLITE=1`), shunda Postgres o'rnatish shart emas.

### 2.1. Backend (Django)

Backend `server/` katalogida joylashgan. U **Poetry** bilan ham, oddiy `pip` + `requirements.txt` bilan ham o'rnatiladi.

**Variant A — Poetry bilan** (asosiy, `server/pyproject.toml` mavjud):

```bash
cd /Users/mac/projects/ttpu_crm/server
poetry install
cp .env.example .env
poetry run python manage.py migrate
poetry run python manage.py create_admin --email admin@example.com --password 'StrongPass!123'
poetry run python manage.py runserver
```

**Variant B — virtualenv + pip bilan**:

```bash
cd /Users/mac/projects/ttpu_crm/server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py create_admin --email admin@example.com --password 'StrongPass!123'
python manage.py runserver
```

Default holatda backend `http://127.0.0.1:8000` da ishlaydi. Tekshirish uchun:

```bash
curl -I http://127.0.0.1:8000/api/v1/healthz
curl -I http://127.0.0.1:8000/api/docs/
```

> `healthz` endpoint `server/crm_server/urls.py` ichida e'lon qilingan (`path("healthz", healthz, ...)`), to'liq yo'li `/api/v1/healthz`. Bu monitoring uchun ishlatiladi.

**Lokal `.env` (development)** — `server/.env.example` dan nusxa olib, development uchun quyidagicha o'zgartiring:

```env
DJANGO_DEBUG=true
USE_SQLITE=1
JWT_COOKIE_SECURE=false
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

`DJANGO_DEBUG=true` bo'lganda `ALLOWED_HOSTS` avtomatik `["*"]` bo'ladi (`server/crm_server/settings.py:16-24`), shuning uchun lokalda alohida sozlash shart emas.

### 2.2. Dashboard (Next.js)

```bash
cd /Users/mac/projects/ttpu_crm/dashboard
npm ci
npm run dev
```

Dashboard `http://localhost:3000` da ishga tushadi. U backend manzilini `NEXT_PUBLIC_API_URL` muhit o'zgaruvchisidan oladi (lokalda default odatda `http://localhost:8000`). `dashboard/` ichida `.env.example` mavjud emas, shuning uchun kerak bo'lsa qo'lda `.env.local` yarating:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

> Dashboard tafsilotlari uchun: [09-dashboard.md](09-dashboard.md).

### 2.3. Bot 2 (Telegram)

Bot 2 `bot2_service/` katalogida, manba kodi `bot2_service/src/bot2_service/` ichida (`python -m bot2_service.main` orqali ishlaydi). U **Python 3.11** ga moslangan (`bot2_service/pyproject.toml`: `python = "^3.11"`).

```bash
cd /Users/mac/projects/ttpu_crm/bot2_service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# .env ni tahrirlang: BOT_TOKEN, SERVICE_TOKEN, SERVER_BASE_URL
python -m bot2_service.main
```

Yoki Poetry bilan:

```bash
cd /Users/mac/projects/ttpu_crm/bot2_service
poetry install
poetry run python -m bot2_service.main
```

**Lokal `bot2_service/.env`** (`.env.example` dan):

```env
BOT_TOKEN=123456:telegram-bot-token
DEFAULT_LANGUAGE=uz
SERVER_BASE_URL=http://localhost:8000/api/v1
SERVICE_TOKEN=raw-bot2-service-token
DASHBOARD_EMAIL=
DASHBOARD_PASSWORD=
```

> Bot 2 ishlashi uchun backend `.env` da `SERVICE_TOKEN_BOT2_HASH` to'g'ri sozlangan bo'lishi shart — qarang [5. Service-token o'rnatish](#5-service-token-ornatish). Bot FSM oqimi tafsilotlari: [08-telegram-bot.md](08-telegram-bot.md).

---

## 3. Docker bilan ishga tushirish

Loyihaning to'liq Docker stacki loyiha **ildizidagi** `docker-compose.yml` da sozlangan: `db` (Postgres), `server` (Django), `bot2` (Telegram bot) va `dashboard` (Next.js). Har bir komponentning o'z `Dockerfile` i mavjud (`server/Dockerfile`, `bot2_service/Dockerfile`, `dashboard/Dockerfile`).

### 3.1. Backend Dockerfile

`server/Dockerfile` — `python:3.12-slim` bazasida Poetry bilan:

```dockerfile
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 POETRY_VERSION=1.8.3
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev ...
RUN pip install "poetry==$POETRY_VERSION"
COPY pyproject.toml /app/
RUN poetry config virtualenvs.create false && poetry install --no-interaction --no-ansi --no-root
COPY . /app
RUN chmod +x /app/entrypoint.sh
EXPOSE 8000
CMD ["/app/entrypoint.sh"]
```

Asosiy nuqtalar:

- Image `python:3.12-slim` ustiga quriladi (lokal Poetry bilan bir xil Python versiyasi).
- `libpq-dev` o'rnatiladi — Postgres bilan ishlash uchun (`psycopg2-binary` kompilyatsiyasi).
- Poetry virtualenv yaratmaydi (`virtualenvs.create false`), paketlar tizim Python'iga o'rnatiladi.
- Kontaynerni ishga tushirganda `entrypoint.sh` chaqiriladi.

### 3.2. entrypoint.sh

`server/entrypoint.sh` har safar kontayner ko'tarilganda quyidagini ketma-ket bajaradi:

```sh
#!/bin/sh
set -e
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn crm_server.wsgi:application --config /app/gunicorn.conf.py
```

Ya'ni: **migrate → collectstatic → gunicorn**. Migratsiyalar avtomatik qo'llanadi, statik fayllar yig'iladi (WhiteNoise orqali serve qilinadi), so'ng Gunicorn ishga tushadi.

### 3.3. docker-compose.yml

Yagona rasmiy compose fayli — loyiha **ildizidagi** `docker-compose.yml`. U to'liq stackni ko'taradi: `db` (Postgres + `postgres_data` volume), `server` (Django), `bot2` (Telegram bot) va `dashboard` (Next.js).

> **ESLATMA:** Eski `server/docker-compose.yml` **o'chirilgan**. Endi yagona compose — loyiha ildizidagi `docker-compose.yml`. Servis nomlari `db`, `server`, `bot2`, `dashboard`. Postgres ma'lumotlari `postgres_data` nomli volume'da saqlanadi (kontayner qayta yaratilsa ham yo'qolmaydi). `server` katalogi `bind-mount` qilingan (`./server:/app`), shuning uchun backend kodidagi o'zgarish kontaynerga darhol ko'rinadi.

```yaml
services:
  db:
    image: postgres:15
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-crm_server}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-crm_server}"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    build:
      context: ./server
    command: /app/entrypoint.sh
    restart: unless-stopped
    env_file:
      - ./server/.env
    volumes:
      - ./server:/app
    depends_on:
      db:
        condition: service_healthy
    ports:
      - "8000:8000"

  bot2:
    build:
      context: ./bot2_service
    command: python -m bot2_service.main
    restart: unless-stopped
    env_file:
      - ./bot2_service/.env
    volumes:
      - ./bot2_service/src:/app/src
    depends_on:
      server:
        condition: service_started

  dashboard:
    build:
      context: ./dashboard
      args:
        NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:8000}
    command: npm run start
    restart: unless-stopped
    ports:
      - "3000:3000"
    depends_on:
      - server

volumes:
  postgres_data:
```

Muhim jihatlar:

- `server` `db` `healthy` bo'lguncha kutadi (`depends_on ... condition: service_healthy`), `bot2` esa `server` ishga tushgach (`condition: service_started`) ko'tariladi.
- `server` o'z `.env` faylini (`./server/.env`) va `bot2` esa `./bot2_service/.env` ni `env_file` orqali o'qiydi.
- `dashboard` uchun `NEXT_PUBLIC_API_URL` build vaqtida client bundle'ga "baked" qilinadi — bu brauzer kira oladigan **public** API URL bo'lishi kerak (docker ichki hostnomi emas).
- Compose Postgres ishlatadi, shuning uchun `server/.env` da **`USE_SQLITE` ni o'chiring yoki `0` ga qo'ying** va `POSTGRES_HOST=db` qiling (compose ichidagi servis nomi `db`).

Ishga tushirish (loyiha ildizidan):

```bash
cd /Users/mac/projects/ttpu_crm
cp server/.env.example server/.env       # POSTGRES_HOST=db, USE_SQLITE=0 ga sozlang
cp bot2_service/.env.example bot2_service/.env
docker compose up --build
```

`migrate` va `collectstatic` `server/entrypoint.sh` ichida avtomatik bajariladi. Admin yaratish uchun kontayner ichida:

```bash
docker compose exec server python manage.py create_admin --email admin@example.com --password 'StrongPass!123'
```

---

## 4. Gunicorn sozlamalari

Production'da backend Gunicorn orqali yuritiladi. Konfiguratsiya `server/gunicorn.conf.py` da, barcha qiymatlar muhit o'zgaruvchilari (env) bilan override qilinadi.

| Parametr | Env o'zgaruvchisi | Default qiymat | Izoh |
| --- | --- | --- | --- |
| `bind` | `GUNICORN_BIND` | `127.0.0.1:8000` | Faqat localhost — Nginx ortida ishlash uchun. Public IP'ga bind qilmang. |
| `workers` | `GUNICORN_WORKERS` | `CPU * 2 + 1` | Worker processlar soni. |
| `worker_class` | `GUNICORN_WORKER_CLASS` | `gthread` | Thread-based worker. |
| `threads` | `GUNICORN_THREADS` | `4` | Har bir worker'dagi thread soni. |
| `timeout` | `GUNICORN_TIMEOUT` | `120` | So'rov timeout (sekund). |
| `graceful_timeout` | `GUNICORN_GRACEFUL_TIMEOUT` | `30` | To'xtatishda kutish vaqti. |
| `keepalive` | `GUNICORN_KEEPALIVE` | `5` | Keep-alive ulanish vaqti. |
| `max_requests` | `GUNICORN_MAX_REQUESTS` | `1000` | Worker shuncha so'rovdan keyin qayta tug'iladi (memory leak'ka qarshi). |
| `max_requests_jitter` | `GUNICORN_MAX_REQUESTS_JITTER` | `100` | `max_requests` ga tasodifiy qo'shimcha (workerlar bir vaqtda restart bo'lmasligi uchun). |
| `preload_app` | `GUNICORN_PRELOAD_APP` | `true` | Ilovani fork'dan oldin yuklash. |
| `accesslog` / `errorlog` | `GUNICORN_ACCESSLOG` / `GUNICORN_ERRORLOG` | `-` (stdout/stderr) | Loglar standart oqimga. |
| `loglevel` | `GUNICORN_LOGLEVEL` | `info` | Log darajasi. |

Qo'shimcha: `worker_tmp_dir` agar `/dev/shm` mavjud bo'lsa o'shanga qo'yiladi (kontayner/VM disk muammolaridan qochish uchun).

Qo'lda ishga tushirish (test):

```bash
cd /Users/mac/projects/ttpu_crm/server
gunicorn crm_server.wsgi:application -c gunicorn.conf.py
```

Bind'ni o'zgartirish misoli (masalan Unix socket yoki boshqa port):

```bash
GUNICORN_BIND=127.0.0.1:9000 GUNICORN_WORKERS=8 gunicorn crm_server.wsgi:application -c gunicorn.conf.py
```

> **`WORKER TIMEOUT (no URI read)` xatosi** odatda port'ga HTTP bo'lmagan ulanish (port skaner/probe) kelganda yuz beradi. Yechim: Gunicorn'ni `127.0.0.1` ga bind qilib, tashqi trafikni faqat Nginx orqali kiriting. Monitoring uchun `GET /api/v1/healthz` dan foydalaning.

---

## 5. Service-token o'rnatish

Service token — Bot 2 va backend o'rtasidagi **servisdan servisga** autentifikatsiya mexanizmi. Bot har bir API so'roviga `X-SERVICE-TOKEN` header'ini qo'shadi; backend uni tekshiradi. Token bo'lmasa yoki noto'g'ri bo'lsa `403 Forbidden` qaytadi (`SERVICE_TOKEN_REQUIRED` yoki `SERVICE_TOKEN_INVALID`).

> **ESLATMA:** Hozir **faqat Bot 2** service token ishlatadi. Settings'da (`server/crm_server/settings.py:175-177`) faqat `bot2` mavjud:
>
> ```python
> SERVICE_TOKENS = {
>     "bot2": os.getenv("SERVICE_TOKEN_BOT2_HASH", ""),
> }
> ```
>
> Eski `SERVICE_TOKEN_BOT1_HASH` o'zgaruvchisi **olib tashlangan** (settings'da ham o'qilmaydi) — endi faqat `SERVICE_TOKEN_BOT2_HASH` ishlatiladi.

### 5.1. Tamoyil: raw token bot'da, hash backend'da

```
┌────────────────────┐                         ┌──────────────────────┐
│  bot2_service/.env │                          │   server (.env / DB) │
│  SERVICE_TOKEN=    │   X-SERVICE-TOKEN: raw   │  SERVICE_TOKEN_BOT2_  │
│  <raw token>       │ ───────────────────────► │  HASH = sha256(raw)   │
└────────────────────┘                          │                       │
                                                │  sha256(kelgan raw)   │
                                                │     == hash ?         │
                                                │   ha → davom; yo'q→403 │
                                                └──────────────────────┘
```

- **Raw (xom) token** faqat `bot2_service/.env` da `SERVICE_TOKEN=` sifatida saqlanadi.
- Backend faqat **SHA-256 hash**'ni biladi — agar `.env` sizib chiqsa ham, raw tokenni tiklash qiyin.
- Tekshirish `hmac.compare_digest` bilan (timing attack'ga qarshi) — `server/common/auth.py:verify_service_token`.

### 5.2. Bosqichma-bosqich sozlash

**1-qadam — raw token yaratish:**

```bash
openssl rand -hex 32
# masalan: 9f2c... (kamida 32 belgili tasodifiy string)
```

**2-qadam — raw tokenni bot'ga qo'yish** (`bot2_service/.env`):

```env
SERVICE_TOKEN=9f2c...your-raw-token
```

**3-qadam — SHA-256 hash hisoblash:**

```bash
echo -n "9f2c...your-raw-token" | shasum -a 256
# yoki Linux'da: echo -n "..." | sha256sum
```

Yoki Python bilan:

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'9f2c...your-raw-token').hexdigest())"
```

**4-qadam — hash'ni backend'ga qo'yish** (`server/.env`):

```env
SERVICE_TOKEN_BOT2_HASH=<3-qadamda chiqqan sha256 hash>
```

**5-qadam — servislarni qayta ishga tushirish** va tekshirish. Tokenlar mos kelmasa bot 403 oladi.

### 5.3. ServiceToken DB modeli orqali (muqobil/qo'shimcha)

`.env` dagi static hash'dan tashqari, backend `ServiceToken` DB modelini ham qo'llab-quvvatlaydi (`server/common/models.py:ServiceToken`). Bu dinamik tokenlar uchun: ular `expires_at`, `last_used_at`, `is_active`, `scope` metadatalariga ega.

`verify_service_token` avval **DB'dan** qidiradi (`_verify_db_token`), topilmasa `settings.SERVICE_TOKENS` (`.env`) ga tushadi. DB token amaldagi (`is_active=True` va muddati o'tmagan) bo'lsa, `last_used_at` yangilanadi.

`ServiceToken.Service` choices: `bot2`, `dashboard`, `other`. Token yaratish uchun Django shell:

```bash
python manage.py shell
```

```python
import hashlib
from common.models import ServiceToken
raw = "9f2c...your-raw-token"
ServiceToken.objects.create(
    service_name="bot2",
    token_hash=hashlib.sha256(raw.encode()).hexdigest(),
    scope="default",
    is_active=True,
)
```

> Service token tafsilotlari va autentifikatsiya mexanizmi: [03-autentifikatsiya.md](03-autentifikatsiya.md).

---

## 6. Production `.env` talablari (backend)

Production'da `server/.env` quyidagi xavfsizlik qiymatlari bilan sozlanishi shart. Asosiy manba: `server/.env.example` va `server/crm_server/settings.py`.

```env
# Maxfiy kalit — kuchli tasodifiy string
DJANGO_SECRET_KEY=<openssl rand -hex 32>

# Production'da DEBUG har doim false
DJANGO_DEBUG=false

# Faqat haqiqiy domenlar (vergul bilan). DEBUG=false bo'lsa bu MAJBURIY,
# aks holda Django barcha so'rovni rad etadi.
DJANGO_ALLOWED_HOSTS=api.example.uz

# CSRF uchun ishonchli originlar (sxema bilan)
CSRF_TRUSTED_ORIGINS=https://api.example.uz,https://crm.example.uz

# Dashboard origin (cookie auth credentials uchun)
CORS_ALLOWED_ORIGINS=https://crm.example.uz

# JWT cookie — HTTPS'da MAJBURIY true
JWT_COOKIE_SECURE=true
JWT_COOKIE_SAMESITE=Lax

# Bot 2 service token hash
SERVICE_TOKEN_BOT2_HASH=<sha256(raw-bot2-token)>

# Reverse proxy / HTTPS (Nginx ortida)
USE_X_FORWARDED_HOST=true
SECURE_PROXY_SSL_HEADER_ENABLED=true
SECURE_SSL_REDIRECT=true
SESSION_COOKIE_SECURE=true
CSRF_COOKIE_SECURE=true
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=true
SECURE_HSTS_PRELOAD=true
SECURE_REFERRER_POLICY=strict-origin-when-cross-origin
```

Settings'dagi muhim mantiq (`server/crm_server/settings.py`):

- `ALLOWED_HOSTS` — `DJANGO_ALLOWED_HOSTS` dan vergul bilan ajratib o'qiladi. Agar bo'sh va `DEBUG=true` bo'lsa `["*"]` bo'ladi. Har holatda `testserver` va `server` avtomatik qo'shiladi.
- `SECURE_PROXY_SSL_HEADER` — faqat `SECURE_PROXY_SSL_HEADER_ENABLED=true` bo'lsa `("HTTP_X_FORWARDED_PROTO", "https")` ga qo'yiladi. HTTPS ortida bu **shart**, aks holda Django so'rovni `http` deb hisoblab `SECURE_SSL_REDIRECT` cheksiz redirect loop yaratishi mumkin.
- `CORS_ALLOW_CREDENTIALS = True` doim yoqilgan (cookie JWT uchun). `CORS_ALLOWED_ORIGINS` bo'sh va `DEBUG=true` bo'lsa `CORS_ALLOW_ALL_ORIGINS=True`; aks holda `False`.
- `CORS_ALLOW_HEADERS` ga `x-service-token` qo'shilgan.

> **Dashboard `.env`** (production): `NEXT_PUBLIC_API_URL=https://api.example.uz`.
> **Bot 2 `.env`** (production): `SERVER_BASE_URL=https://api.example.uz/api/v1` va `SERVICE_TOKEN=<raw>`.

---

## 7. Ma'lumotlar bazasi (SQLite / Postgres)

`server/crm_server/settings.py:83-100` da DB tanlovi quyidagicha:

```python
DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", ...}}

if os.getenv("USE_SQLITE", "1") == "1":
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
```

- **Default — SQLite.** `USE_SQLITE` o'zgaruvchisi belgilanmagan bo'lsa, qiymati `"1"` deb olinadi → SQLite ishlatiladi (`server/db.sqlite3`). Bu lokal development uchun qulay.
- **Postgres'ga o'tish:** `USE_SQLITE` ni `0` ga qo'ying (yoki olib tashlang va boshqa qiymat bering) hamda Postgres ulanish parametrlarini sozlang:

```env
USE_SQLITE=0
POSTGRES_DB=crm_server
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<kuchli parol>
POSTGRES_HOST=db          # docker compose ichida 'db', alohida server'da 'localhost' yoki DB host
POSTGRES_PORT=5432
```

Qo'shimcha sozlamalar: `POSTGRES_CONN_MAX_AGE` (default `60` s) va `CONN_HEALTH_CHECKS=True` allaqachon yoqilgan.

> `psycopg2-binary` `pyproject.toml`/`requirements.txt` da bor, Docker image'da `libpq-dev` o'rnatiladi — Postgres uchun qo'shimcha narsa kerak emas. SQLite'dan Postgres'ga o'tganda barcha migratsiyalarni yangi DB'da qaytadan ishga tushiring (`migrate`) — ma'lumotlar avtomatik ko'chmaydi.

---

## 8. Production deploy — systemd variant

Manba: `DEPLOYMENT.md`. Bu yo'l Nginx + Certbot + systemd unitlardan iborat.

> **ESLATMA:** "Bot 1" (`ttpu-bot1.service`) **olib tashlangan** — endi faqat `ttpu-server`, `ttpu-dashboard` va `ttpu-bot2` kerak.

### 8.1. Backend unit — `/etc/systemd/system/ttpu-server.service`

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

### 8.2. Dashboard unit — `/etc/systemd/system/ttpu-dashboard.service`

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

### 8.3. Bot 2 unit — `/etc/systemd/system/ttpu-bot2.service`

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

### 8.4. Yoqish va monitoring

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ttpu-server ttpu-dashboard ttpu-bot2
sudo systemctl status ttpu-server ttpu-dashboard ttpu-bot2

# loglar
journalctl -u ttpu-server -f
journalctl -u ttpu-dashboard -f
journalctl -u ttpu-bot2 -f
```

### 8.5. Nginx reverse proxy

`/etc/nginx/sites-available/ttpu.conf`:

```nginx
# API domain -> Gunicorn
server {
    listen 80;
    server_name api.example.uz;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;                 # ALLOWED_HOSTS tekshiruvi uchun shart
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;  # SECURE_PROXY_SSL_HEADER uchun
    }
}

# Dashboard domain -> Next.js
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

```bash
sudo ln -sf /etc/nginx/sites-available/ttpu.conf /etc/nginx/sites-enabled/ttpu.conf
sudo nginx -t
sudo systemctl reload nginx
```

### 8.6. SSL (Certbot)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.uz -d crm.example.uz
```

HTTPS yoqilgach, `server/.env` da `JWT_COOKIE_SECURE=true`, `SECURE_PROXY_SSL_HEADER_ENABLED=true`, `SECURE_SSL_REDIRECT=true` va HSTS o'zgaruvchilari yoqilganini tasdiqlang.

---

## 9. Production deploy — PM2 + Supervisor variant

Manba: `DEPLOYMENT_PM2_SUPERVISOR.md`. Bu yo'lda:

- **Next.js dashboard** → PM2 orqali
- **Django API va Bot 2** → Supervisor orqali
- Reverse-proxy/TLS → Nginx + Certbot

> **ESLATMA:** "Bot 1" (`ttpu-bot1` supervisor program) **olib tashlangan** — faqat `ttpu-api` va `ttpu-bot2` ishlating.

### 9.1. OS tayyorgarlik

```bash
sudo apt-get update
sudo apt-get install -y git curl nginx supervisor python3 python3-venv python3-pip
# Node 20 (dashboard uchun)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm i -g pm2
```

### 9.2. Supervisor — Django API — `/etc/supervisor/conf.d/ttpu-api.conf`

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

### 9.3. Supervisor — Bot 2 — `/etc/supervisor/conf.d/ttpu-bot2.conf`

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

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl status
sudo tail -n 200 /var/log/ttpu-api.err.log
```

### 9.4. PM2 — Dashboard

```bash
cd /opt/ttpu_crm/dashboard
npm ci
npm run build
pm2 start npm --name ttpu-dashboard -- start -- -p 3000 -H 127.0.0.1
pm2 save
# reboot'dan keyin avtomatik start
pm2 startup systemd
# chiqqan buyruqni sudo bilan ishga tushiring, so'ng:
pm2 save
pm2 logs ttpu-dashboard --lines 200
```

### 9.5. Release (yangilash) tartibi

**Backend:**

```bash
cd /opt/ttpu_crm/server && source .venv/bin/activate
git pull
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
sudo supervisorctl restart ttpu-api
```

**Dashboard:**

```bash
cd /opt/ttpu_crm/dashboard
git pull && npm ci && npm run build
pm2 restart ttpu-dashboard
```

**Bot 2:**

```bash
cd /opt/ttpu_crm/bot2_service && source .venv/bin/activate
git pull && pip install -r requirements.txt
sudo supervisorctl restart ttpu-bot2
```

---

## 10. Seed va boshqaruv (management) komandalari

Quyidagi management komandalar `server/` ichida, `python manage.py <komanda>` (yoki Poetry/Docker bilan) orqali chaqiriladi. Joylashuvi `<app>/management/commands/`.

| Komanda | Fayl | Vazifasi | Argumentlar |
| --- | --- | --- | --- |
| `create_admin` | `authn/management/commands/create_admin.py` | Admin (`role=ADMIN`, `is_staff=True`) foydalanuvchi yaratadi | `--email` (majburiy), `--password` (majburiy) |
| `cleanup_tokens` | `authn/management/commands/cleanup_tokens.py` | Muddati o'tgan `RevokedToken` yozuvlarini o'chiradi | — |
| `seed_programs` | `catalog/management/commands/seed_programs.py` | Bachelor/Master dasturlarini `catalog_items` ga seed qiladi (idempotent) | `--deactivate-missing` (ro'yxatda yo'q dasturlarni o'chiradi) |
| `seed_catalog` | `catalog/management/commands/seed_catalog.py` | Yo'nalish (direction) va hududlarni (region) seed qiladi (idempotent) | (opsiyalar mavjud) |
| `seed_polito_admissions` | `catalog/management/commands/seed_polito_admissions.py` | Polito Academy treklari va Admissions 2026 fanlarini seed qiladi (idempotent) | (opsiyalar mavjud) |
| `seed_ttpumock` | `common/management/commands/seed_ttpumock.py` | Sintetik TTPU mock ma'lumotlarini seed qiladi (idempotent) | `--seed` (int), `--days` (default 120), `--scale` (small/medium/...), `--upsert` |
| `create_mock_data` | `common/management/commands/create_mock_data.py` | Lokal development uchun mock ma'lumot (admin/viewer foydalanuvchilar va h.k.) | `--admin-password` (default `pass1234`), `--viewer-password` (default `pass1234`) |
| `import_roster` | `bot2/management/commands/import_roster.py` | CSV fayldan studentlar ro'yxatini (roster) import qiladi | `--file` (majburiy) |

Misollar:

```bash
# Admin yaratish
python manage.py create_admin --email admin@example.com --password 'StrongPass!123'

# Katalogni to'ldirish (odatda deploy'dan keyin bir marta)
python manage.py seed_programs
python manage.py seed_catalog
python manage.py seed_polito_admissions

# Mock ma'lumot (development)
python manage.py seed_ttpumock --scale medium --days 120 --seed 42
python manage.py create_mock_data

# Roster import (CSV)
python manage.py import_roster --file /path/to/roster.csv

# Eskirgan revoked tokenlarni tozalash (masalan cron orqali kuniga bir marta)
python manage.py cleanup_tokens
```

`import_roster` kutadigan CSV ustunlari (`bot2/management/commands/import_roster.py` help matni): `student_external_id`, `program_id`/`program_code`, `course_year`, `is_active` (opsional). Har bir qator `bot2.services.parse_roster_payload` + `upsert_roster_row` orqali qayta ishlanadi.

> Katalog modellari uchun [04-katalog.md](04-katalog.md), roster/student domeni uchun [05-bot2-backend.md](05-bot2-backend.md), seed bilan to'ldiriladigan ma'lumotlar modeli uchun [10-malumotlar-modeli.md](10-malumotlar-modeli.md).

---

## 11. Tezkor diagnostika va tipik muammolar

```bash
# Backend sog'lik
curl -I https://api.example.uz/api/v1/healthz
curl -I https://api.example.uz/api/docs/

# Dashboard
curl -I https://crm.example.uz/login

# Servis holati (systemd)
sudo systemctl status ttpu-server ttpu-dashboard ttpu-bot2
# yoki Supervisor + PM2
sudo supervisorctl status && pm2 status
```

| Belgi | Ehtimoliy sabab | Yechim |
| --- | --- | --- |
| Dashboard login/refresh ishlamayapti | Cookie `Secure` lekin sayt HTTP'da, yoki CORS/CSRF noto'g'ri | HTTPS yoqing; `JWT_COOKIE_SECURE=true`, `CORS_ALLOWED_ORIGINS` va `CSRF_TRUSTED_ORIGINS` domenlarga mos bo'lsin |
| Bot 2 → 403 (`SERVICE_TOKEN_INVALID`) | `bot2_service/.env` `SERVICE_TOKEN` (raw) va `server/.env` `SERVICE_TOKEN_BOT2_HASH` mos emas | `echo -n "<raw>" \| shasum -a 256` natijasi backend hash'iga teng ekanini tekshiring |
| Nginx 502 | Backend/dashboard ishlamayapti yoki port band | Servis holatini tekshiring; `127.0.0.1:8000`/`127.0.0.1:3000` band emasligini ko'ring |
| Cheksiz HTTPS redirect | `SECURE_SSL_REDIRECT=true` lekin proxy header sozlanmagan | `SECURE_PROXY_SSL_HEADER_ENABLED=true` va Nginx'da `X-Forwarded-Proto $scheme` borligini tasdiqlang |
| `DisallowedHost` xatosi | Domen `DJANGO_ALLOWED_HOSTS` da yo'q | Domeningizni `DJANGO_ALLOWED_HOSTS` ga qo'shing |
| Gunicorn `WORKER TIMEOUT (no URI read)` | Port skaner/probe public IP'ga uradi | Gunicorn'ni `127.0.0.1` ga bind qiling, faqat Nginx kirsin |

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) — Backend tuzilishi va sozlamalar
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — User, JWT, rollar, service token
- [04-katalog.md](04-katalog.md) — Katalog (CatalogItem/CatalogRelation, dasturlar)
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovnoma domeni (roster, student, survey)
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma
- [08-telegram-bot.md](08-telegram-bot.md) — Telegram bot servisi va FSM oqimi
- [09-dashboard.md](09-dashboard.md) — Next.js boshqaruv paneli
- [10-malumotlar-modeli.md](10-malumotlar-modeli.md) — Ma'lumotlar modeli / ER diagramma
- [12-testlar.md](12-testlar.md) — Test qoplamasi
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari
