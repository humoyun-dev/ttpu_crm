# TTPU Bandlik Markazi — Backend (Django)

Django 5 + DRF asosidagi backend. PostgreSQL, SimpleJWT (cookie-based), drf-spectacular.

## Papka tuzilmasi (server/)

| App | Maqsad |
|-----|--------|
| `authn/` | Custom user (email login, `admin`/`viewer` roli), JWT cookie auth, token blacklist |
| `catalog/` | `CatalogItem` (program/direction/subject/track/region/other), `CatalogRelation` |
| `bot2/` | `StudentRoster`, `Bot2Student`, `Bot2StudentAccount`, `Bot2SurveyResponse`, `Bot2Document`, `ProgramEnrollment`, `BotFsmState` |
| `ai_gateway/` | AI servislariga proksi-gateway |
| `ai_verification/` | Gemini 2.5 Flash orqali hujjat tekshiruvi (`DocumentVerification`, `AIUsageLog`) |
| `vacancies/` | `Vacancy`, `VacancyChannelPost` — outbox pattern, Telegram kanal posting |
| `employers/` | Employer profillari va bog'liq endpointlar |
| `crm/` | Leads, followup xabarlari, employer access link (`/l/<uuid>/`) |
| `documents/` | Hujjat boshqaruvi |
| `analytics/` | Bot2 va catalog agregatsiyalari (alohida model yo'q) |
| `audit/` | `AuditLog` — barcha CRUD/auth hodisalarini yozadi |
| `common/` | `BaseModel` (UUID PK, timestamps), `ServiceToken`, permissionlar, pagination |
| `crm_server/` | Django konfiguratsiyasi (`settings.py`, `urls.py`) |
| `tests/` | Pytest testlari |

## Asosiy modellar

- **`authn.User`** — UUID PK, email login, `role=admin/viewer`. `RevokedToken` JWT jti larini bekor qiladi.
- **`catalog.CatalogItem`** — type (`program`, `direction`, `subject`, `track`, `region`, `other`), ixtiyoriy `code`, `parent`, `is_active`, `metadata`.
- **`bot2.StudentRoster`** — tashqi talaba ID, `program` (catalog), `course_year` (1–4, 5=bitiruvchi), `roster_campaign`.
- **`bot2.Bot2Student`** — shaxsiy ma'lumotlar (ism/jins/telefon/hudud), `state` (FSM), `language`, `is_job_seeking`.
- **`bot2.Bot2StudentAccount`** — bir talabaning bir nechta Telegram akkauntlari. `telegram_user_id` unique; `/logout` `is_active=False` qiladi, yozuv saqlanadi.
- **`bot2.Bot2SurveyResponse`** — so'rovnoma javobi (append-only). `idempotency_key` ikki marta submit'dan himoya qiladi.
- **`bot2.Bot2Document`** — bot orqali yuklangan hujjatlar (cv/certificate/employment).
- **`bot2.ProgramEnrollment`** — program + course_year bo'yicha jami talaba soni.
- **`bot2.BotFsmState`** — DB-based FSM storage (bot restartdan keyin davom etish uchun).
- **`ai_verification.DocumentVerification`** — Gemini orqali tekshirilgan hujjat. `confidence_level` (green/yellow/red), `extracted_data`, `flags`, `ai_summary`.
- **`ai_verification.AIUsageLog`** — har bir Gemini API chaqiruvi uchun token + xarajat yozuvi (append-only).
- **`vacancies.Vacancy`** — vakansiya: `title`, `company_name`, `employment_type`, `work_format`, `schedule`, `experience`, `tags`, `address`, `image`, maosh, ariza usuli, `status` (draft/published/closed/archived).
- **`vacancies.VacancyChannelPost`** — outbox: vakansiyani Telegram kanalga joylash navbati. `action` (create/edit/delete), `media_type` (text/photo), `idempotency_key`.

## API endpointlar

### Auth
```
POST /api/v1/auth/login        # email + password → cookie set
POST /api/v1/auth/refresh      # refresh token → yangi access
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

### Catalog
```
GET|POST|PATCH|DELETE /api/v1/catalog/items
GET|POST|PATCH|DELETE /api/v1/catalog/relations
GET                   /api/v1/catalog/programs
```

### Bot2 — Dashboard
```
GET /api/v1/bot2/roster
GET /api/v1/bot2/students
GET /api/v1/bot2/surveys
GET /api/v1/bot2/enrollments
GET /api/v1/bot2/documents
GET /api/v1/bot2/documents/<id>/download/
```

### Bot2 — Bot servisi (X-SERVICE-TOKEN)
```
POST /api/v1/bot/verify              # student_external_id tekshirish
POST /api/v1/bot/register            # ro'yxatdan o'tish
POST /api/v1/bot/logout
POST /api/v1/bot/followup-answer
GET  /api/v1/bot/catalog/items
GET  /api/v1/bot/profile
GET  /api/v1/bot/fsm/<user_id>
POST /api/v1/bot/document            # hujjat yuklash

POST /api/v1/bot2/surveys/submit     # so'rovnoma submit (append-only)
POST /api/v1/admin/roster/import     # roster import (CSV / JSON)
```

### Analytics
```
GET /api/v1/analytics/bot2/course-year-coverage
GET /api/v1/analytics/bot2/program-coverage
GET /api/v1/analytics/bot2/program-course-matrix
GET /api/v1/analytics/bot2/program-details-by-year
GET /api/v1/analytics/bot2/enrollments-overview
GET /api/v1/analytics/bot2/academic-years
GET /api/v1/analytics/students-by-direction
GET /api/v1/analytics/students-by-direction.xlsx
```

### AI Tekshiruv
```
GET|POST /api/v1/ai-verification/   # hujjat tekshiruvi CRUD
```

### Vakansiyalar
```
GET|POST   /api/v1/vacancies/              # ro'yxat + yaratish
GET|PATCH|DELETE /api/v1/vacancies/<id>   # bitta vakansiya
POST       /api/v1/vacancies/<id>/publish  # e'lon qilish → outbox
GET        /api/v1/vacancies/feed          # bot uchun (service token)
```

### Employer, CRM, Documents
```
/l/<uuid:token>/   # Employer access link (nginx /l/ proksi)
/api/v1/           # employers.urls, crm.urls, documents.urls (yo'nalishlar ulardan)
```

### Tizim
```
GET /healthz
GET /api/v1/healthz
GET /api/schema/    # OpenAPI JSON
GET /api/docs/      # Swagger UI
GET /superadmin/    # Django admin
```

## Servis tokenlar

Bot `X-SERVICE-TOKEN` headerida xom tokenni yuboradi. `settings.py` dagi `SERVICE_TOKENS` dict'da uning sha256 hashi saqlanadi:

```python
SERVICE_TOKENS = {
    "bot2": os.getenv("SERVICE_TOKEN_BOT2_HASH", ""),
}
```

`.env`:
```env
SERVICE_TOKEN_BOT2_HASH=<sha256 of raw token>
SERVICE_TOKEN=<raw token>  # bot2 servisi o'qiydi
```

## Ishga tushirish (Docker — tavsiya etiladi)

```bash
# Root papkada
cp .env.example .env   # sozlamalarni to'ldiring
docker compose up --build
```

`docker-compose.yml` servislari:
- `db` — PostgreSQL 15 (port 5432, localhost only)
- `server` — Gunicorn, port 9006→8000
- `bot2` — aiogram bot
- `dashboard` — Next.js, port 3000
- `followup_cron` — har 60s: `process_followups` + `post_pending_vacancies`

## Ishga tushirish (lokal, `.venv`)

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export USE_SQLITE=1   # SQLite (lokaldagi qulay variant)
python manage.py migrate
python manage.py create_admin --email admin@example.com --password pass1234
python manage.py runserver 0.0.0.0:8000
```

## Management buyruqlari

| Buyruq | Maqsad |
|--------|--------|
| `create_admin --email ... --password ...` | Admin user yaratadi |
| `seed_programs [--deactivate-missing]` | Katalogga bakalavr/master dasturlarini yuklaydi |
| `import_roster --file roster.csv` | CSV orqali roster qo'shish/yangilash |
| `post_pending_vacancies` | Outbox draeni — pending VacancyChannelPost yozuvlarini Telegram kanalga joylaydi |
| `process_followups` | Followup xabarlarini yuboradi |
| `create_mock_data` | Minimal demo ma'lumotlar |
| `seed_ttpumock [--scale small\|medium\|large]` | Katta hajmli sintetik ma'lumot |

## Production sozlamalari

```env
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com
USE_X_FORWARDED_HOST=1
SECURE_PROXY_SSL_HEADER_ENABLED=1
SECURE_SSL_REDIRECT=1
JWT_COOKIE_SECURE=1
SESSION_COOKIE_SECURE=1
CSRF_COOKIE_SECURE=1
SECURE_HSTS_SECONDS=31536000
```

## Testlar

```bash
cd server
pytest
```

## Gunicorn

```bash
cd server
source .venv/bin/activate
gunicorn crm_server.wsgi:application -c gunicorn.conf.py
```

Nginx health-check uchun `GET /api/v1/healthz` endpointdan foydalaning.
