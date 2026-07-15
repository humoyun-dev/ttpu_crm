# TTPU Bandlik Markazi — Loyiha Hujjati

**Versiya:** 2.0
**Sana:** 2026-06-29
**Loyiha:** Turin Politexnika Universiteti Toshkent — Bandlik Markazi CRM

---

## 1. Maqsad

Talabalardning bandlik holatini Telegram bot orqali to'plash, hujjatlarni sun'iy intellekt yordamida tekshirish, va vakansiyalarni Telegram kanal + bot orqali tarqatish.

---

## 2. Umumiy Arxitektura

```
┌─────────────────────────────────────────────────────────────┐
│                    docker-compose                           │
│                                                             │
│  ┌──────────┐   ┌────────────────┐   ┌──────────────────┐  │
│  │ db       │   │ server         │   │ dashboard        │  │
│  │ Postgres │◄──│ Django 5 + DRF │◄──│ Next.js          │  │
│  │ :5432    │   │ :9006→8000     │   │ :3000            │  │
│  └──────────┘   └───────┬────────┘   └──────────────────┘  │
│                          │                                  │
│                  ┌───────┴────────┐                         │
│                  │                │                         │
│           ┌──────┴──────┐  ┌──────┴──────┐                 │
│           │ bot2        │  │followup_cron│                  │
│           │ aiogram 3   │  │ har 60s:    │                  │
│           │ Telegram    │  │ process_    │                  │
│           │ Survey+Vac  │  │ followups + │                  │
│           └─────────────┘  │ post_pending│                  │
│                            │ _vacancies  │                  │
│                            └─────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Servislar

| Servis            | Texnologiya         | Port                  | Maqsad                  |
| ----------------- | ------------------- | --------------------- | ----------------------- |
| `db`            | PostgreSQL 15       | 5432 (localhost only) | Ma'lumotlar bazasi      |
| `server`        | Django 5 + Gunicorn | 9006→8000            | Backend API             |
| `bot2`          | aiogram 3           | —                    | Telegram bot            |
| `dashboard`     | Next.js             | 3000                  | Boshqaruv paneli        |
| `followup_cron` | server image        | —                    | Scheduled tasklar (60s) |

---

## 3. Server Modullari

| App                 | Asosiy modellar                                                                                                                              | Maqsad                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `authn`           | `User`, `RevokedToken`                                                                                                                   | JWT cookie auth, email login,`admin`/`viewer` rollar |
| `catalog`         | `CatalogItem`, `CatalogRelation`                                                                                                         | Dasturlar, yo'nalishlar, hududlar katalogi               |
| `bot2`            | `StudentRoster`, `Bot2Student`, `Bot2StudentAccount`, `Bot2SurveyResponse`, `Bot2Document`, `ProgramEnrollment`, `BotFsmState` | Bot foydalanuvchilari va so'rovnomalar                   |
| `ai_verification` | `DocumentVerification`, `AIUsageLog`                                                                                                     | Gemini 2.5 Flash orqali hujjat tekshiruvi                |
| `vacancies`       | `Vacancy`, `VacancyChannelPost`                                                                                                          | Vakansiyalar, outbox → Telegram kanal                   |
| `employers`       | Employer modellari                                                                                                                           | Ish beruvchi profillari                                  |
| `crm`             | Leads, Followups                                                                                                                             | Kontaktlar, kuzatuv xabarlari, employer access link      |
| `documents`       | Hujjat modellari                                                                                                                             | Hujjat boshqaruvi                                        |
| `analytics`       | — (model yo'q)                                                                                                                              | Bot2 va catalog bo'yicha agregatsiyalar                  |
| `audit`           | `AuditLog`                                                                                                                                 | Barcha CRUD/auth hodisalari (audit trail)                |
| `common`          | `BaseModel`, `ServiceToken`                                                                                                              | Umumiy bazaviy klasslar va utilitylar                    |
| `ai_gateway`      | —                                                                                                                                           | AI servislariga proksi-gateway                           |

---

## 4. Bot2 — Ish Oqimi

```
/start
  └─► Til tanlash (uz/ru)
       └─► Kontakt yuborish (telefon)
            └─► Student ID kiritish
                 └─► Ism → Familiya → Jins → Hudud
                      └─► Ishlaydimi?
                           ├─► Ha: Kompaniya → Lavozim
                           └─► Yo'q: Ish izlayaptimi?
                                └─► Taklif va fikrlar
                                     └─► Tasdiqlash → Submit
                                          └─► Asosiy menyu
                                               ├─► [💼 Vakansiyalar]
                                               └─► [📊 So'rovnomani yangilash]
```

**Muhim:** `Bot2SurveyResponse` **append-only** — har safar yangi yozuv. `idempotency_key` (UUIDv4) double-submit'dan himoya qiladi.

---

## 5. Vakansiya Tizimi

**Outbox pattern — Celery talab qilinmaydi:**

```
Xodim (Dashboard)       Backend                  followup_cron
       │                    │                          │
       │ POST /publish       │                          │
       ├───────────────────► │                          │
       │                     │ VacancyChannelPost       │
       │                     │ (pending) yoziladi       │
       │ 200 OK ◄────────────┤                          │
       │                     │                          │
       │                     │       har 60 soniya      │
       │                     │ ◄────────────────────────┤
       │                     │  post_pending_vacancies   │
       │                     ├─────────────────────────►│
       │                     │  Telegram sendMessage     │
       │                     │  message_id saqlanadi     │
```

**Telegram kanalga bot admin bo'lishi shart** — `sendMessage` huquqi.

**Vakansiya tahrirlansa** → kanaldagi post `editMessageText` orqali yangilanadi.
**Vakansiya yopilsa** → kanaldagi post `deleteMessage` orqali o'chiriladi.

Bot'da vakansiyalar uchun **survey darvozasi**: `VACANCY_REQUIRE_SURVEY=true` bo'lsa, faqat so'rovnoma to'ldirgan talabalar ko'ra oladi.

---

## 6. AI Hujjat Tekshiruvi (Gemini)

```
Bot yuklaydi (CV/sertifikat)
       │
       ▼
Bot2Document (fayl saqlash)
       │
       ▼
DocumentVerification (pending)
       │
       ▼
Gemini 2.5 Flash API
       │
       ▼
DocumentVerification (done):
  - confidence_level: green / yellow / red
  - confidence_score: 0.0 – 1.0
  - extracted_data: { name, date, issuer, ... }
  - flags: ["blurry_image", "date_mismatch", ...]
  - ai_summary: (o'zbek tilida xulosa)
       │
       ▼
AIUsageLog (har bir API chaqiruv uchun token + xarajat)
       │
       ▼
Dashboard (xodim ko'rib chiqadi → accepted / rejected)
```

---

## 7. Dashboard Sahifalari

| Yo'l                            | Maqsad                                  |
| ------------------------------- | --------------------------------------- |
| `/dashboard/students`         | Talabalar ro'yxati va profillari        |
| `/dashboard/students/[id]`    | Bitta talaba (survey tarixi, hujjatlar) |
| `/dashboard/surveys`          | So'rovnomalar ro'yxati va filtrlar      |
| `/dashboard/surveys/[id]`     | Bitta so'rovnoma tafsiloti              |
| `/dashboard/vacancies`        | Vakansiyalar (CRUD + Publish)           |
| `/dashboard/ai-verifications` | Hujjat tekshiruvlari (Gemini)           |
| `/dashboard/ai-costs`         | AI xarajatlar monitoringi               |
| `/dashboard/analytics`        | Bot2 tahlil grafiklari                  |
| `/dashboard/applications`     | Arizalar                                |
| `/dashboard/employers`        | Ish beruvchilar                         |
| `/dashboard/catalog`          | Katalog boshqaruvi                      |
| `/dashboard/documents`        | Hujjatlar                               |
| `/dashboard/import`           | Roster import                           |
| `/dashboard/leads`            | Leadlar                                 |
| `/dashboard/reports`          | Hisobotlar                              |
| `/dashboard/enrollments`      | Yo'nalish bo'yicha o'quvchilar soni     |

---

## 8. Environment Variables

Barcha servislar bitta **root `.env`** faylidan o'qiydi (`docker-compose env_file: ./.env`).

```env
# Django
DJANGO_SECRET_KEY=
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=yourdomain.com

# PostgreSQL
POSTGRES_DB=crm_server
POSTGRES_USER=crm_user
POSTGRES_PASSWORD=
POSTGRES_HOST=db
POSTGRES_PORT=5432

# JWT Cookie
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
JWT_COOKIE_SECURE=1
JWT_COOKIE_SAMESITE=Lax

# Servis tokenlar
SERVICE_TOKEN_BOT2_HASH=<sha256 of raw token>
SERVICE_TOKEN=<raw bot2 token>   # bot2 servisi o'qiydi

# Telegram
TELEGRAM_BOT_TOKEN=<bot token>
BOT_TOKEN=<bot token>            # bot2 servisi o'qiydi

# Vakansiya kanali
VACANCY_CHANNEL_ID=@kanal_username  # yoki -100xxxxxxxxxx
VACANCY_CHANNEL_LINK=https://t.me/kanal
VACANCY_REQUIRE_SURVEY=true

# Gemini AI
GEMINI_API_KEY=

# Dashboard
NEXT_PUBLIC_API_URL=http://localhost:9006
```

> **MUHIM:** `cp .env.example .env` bilan boshlang. `.env` faylini root papkada yarating — Docker servislar uni o'qiydi.

---

## 9. Ishga Tushirish

```bash
# Root papkada
cp .env.example .env
# .env ni to'ldiring (DB parol, bot token, Gemini key, ...)

docker compose up --build
```

Birinchi ishga tushirishdan keyin:

```bash
# Admin user yaratish
docker compose exec server python manage.py create_admin \
  --email admin@example.com --password yourpassword

# Katalog to'ldirish
docker compose exec server python manage.py seed_programs

# Roster import (CSV)
docker compose exec server python manage.py import_roster --file /app/roster.csv
```

---

## 10. Servis Token Yaratish

```bash
python -c "import hashlib; print(hashlib.sha256(b'your-raw-token').hexdigest())"
```

- `SERVICE_TOKEN_BOT2_HASH` ga sha256 hashni yozing
- `SERVICE_TOKEN` ga xom tokenni yozing (bot2 servisi o'qiydi)

---

## 11. Cron Tasklar

`followup_cron` servisi server image'ni qayta ishlatadi va har 60 soniyada ikki management buyrug'ini bajaradi:

| Buyruq                     | Maqsad                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `process_followups`      | Rejalashtirilgan followup xabarlarini yuboradi                                                    |
| `post_pending_vacancies` | Pending`VacancyChannelPost` larni Telegram kanalga joylaydi (max 50 ta / iteratsiya, 5 urinish) |

---

## 12. Testlar

```bash
cd server
pytest
```

---

## 13. Loyiha Tuzilmasi (Root)

```
ttpu_crm/
├── server/          # Django backend
├── bot2_service/    # aiogram Telegram bot
├── dashboard/       # Next.js frontend
├── docs/            # Texnik hujjatlar
├── docker-compose.yml
├── nginx.conf       # Reverse proxy konfiguratsiya
└── .env             # Barcha servislar uchun bitta sozlamalar fayli
```
