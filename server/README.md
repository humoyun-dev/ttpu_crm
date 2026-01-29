# Turin Polytechnic University Marketing CRM (Backend)

Django 5 + DRF asosidagi backend, PostgreSQL (yoki lokalda SQLite), SimpleJWT va drf-spectacular bilan ishlaydi. Telegram botlar (bot1, bot2) va ichki dashboard uchun API beradi.

## Papka tuzilmasi (server/)
- `crm_server/`: Django konfiguratsiyasi, `settings.py`, `urls.py`, ASGI/WSGI.
- `authn/`: Custom user (`email` login, `role=admin/viewer`), JWT cookie auth (`/api/v1/auth/login|refresh|logout|me`), token blacklist.
- `catalog/`: `CatalogItem` va `CatalogRelation` modellari; program/direction/track/subject/region katalogi, `seed_programs` management buyrug'i.
- `bot1/`: Abiturientlar va arizalar (`Admissions2026Application`, `CampusTourRequest`, `FoundationRequest`, `PolitoAcademyRequest`), service endpointlar `X-SERVICE-TOKEN` bilan, dashboard uchun read-only viewsetlar.
- `bot2/`: Talaba ro'yxati (`StudentRoster`), bot2 foydalanuvchilari (`Bot2Student`), so'rovnomalar (`Bot2SurveyResponse`), roster importi (API va CLI), service survey submit.
- `analytics/`: Bot1/Bot2 va katalog ma'lumotlari bo'yicha agregatsiyalar (model yo'q, faqat viewlar).
- `audit/`: `AuditLog` modeli va `audit.utils.log_audit` orqali barcha CRUD/auth hodisalarini yozib boradi.
- `common/`: Baza modellari (`BaseModel`, `ServiceToken`), servis token tekshiruvi, permissionlar, pagination, vaqt va exception utilitlari; management buyruqlari (`create_mock_data`, `seed_ttpumock`).
- `tests/`: Pytest testlari (auth, permissions, analytics, seed, bot2 survey va h.k.).
- `Dockerfile`, `docker-compose.yml`, `entrypoint.sh`: container orkestratsiyasi; `sql-structure.sql` – DB sxemasi nusxasi; `staticfiles/` – `collectstatic` natijasi.

## Asosiy modellar
- `authn.User`: UUID primary key, email bilan login, rollar (`admin`, `viewer`), cookie-based JWT. `RevokedToken` access/refresh jti larini bekor qiladi.
- `common.ServiceToken`: botlar va boshqa servislar uchun sha256 hash saqlanadi; `X-SERVICE-TOKEN` headeri bilan tekshiriladi.
- `catalog.CatalogItem`: type (`program`, `direction`, `subject`, `track`, `region`, `other`), ixtiyoriy `code`, `parent`, `is_active`, `metadata`, unique constraintlar. `CatalogRelation`: itemlar orasidagi bog'lanishlar (masalan program -> direction).
- `bot1.Bot1Applicant`: Telegram user/chat ID, kontaktlar, region (catalog). `Admissions2026Application`, `CampusTourRequest`, `FoundationRequest`, `PolitoAcademyRequest` – umumiy statuslar (`new/submitted/in_progress/approved/rejected`), `answers` JSON, `submitted_at` avtomatik to'ldiriladi.
- `bot2.StudentRoster`: tashqi ID, program (catalog `program`), kurs yili (1..4), `roster_campaign`, `is_active`. `Bot2Student`: roster bilan 1-1, gender/region/telegram ma'lumotlari. `Bot2SurveyResponse`: survey_campaign, employment maydonlari, consents/answers JSON, unique constraint (roster + campaign) va kurs/program tekshiruvlari.
- `audit.AuditLog`: actor (user yoki service), action (create/update/delete/login/logout/other), entity table/id, old/new payload (PII maydonlar maskalanadi), IP va user-agent.
- `analytics`: alohida model yo'q, Bot1/Bot2 dan `Count` asosida javoblar qaytaradi.

## API lar va oqimlar
- **Auth (cookie JWT)**: `/api/v1/auth/login`, `/refresh`, `/logout`, `/me`. Login refresh/access cookielarni HTTP-only sifatida o'rnatadi.
- **Catalog**: `/api/v1/catalog/items|relations` (CRUD, yozish faqat admin), `/api/v1/catalog/programs` (read-only filtrlar: `level`, `track`).
- **Bot1**: Dashboard uchun GET viewsetlar (`/api/v1/bot1/applicants`, `.../applications/*`). Bot servisi uchun POST endpointlar (token talab etiladi): `/api/v1/bot1/applicants/upsert`, `/bot1/admissions-2026/submit`, `/bot1/campus-tour/submit`, `/bot1/foundation/submit`, `/bot1/polito-academy/submit`.
- **Bot2**: Dashboard uchun GET roster/students/surveys. Admin uchun roster import: `POST /api/v1/admin/roster/import` (CSV fayl yoki JSON ro'yxat). Bot servisi uchun survey submit: `POST /api/v1/bot2/surveys/submit` (`student_external_id` va token shart).
- **Analytics**: `/api/v1/analytics/admissions-2026/by-direction|by-track`, `/analytics/polito-academy/by-subject`, `/analytics/bot2/course-year-coverage`, `/analytics/bot2/program-coverage`, `/analytics/bot2/program-course-matrix` (ko'pida `from`/`to` ISO datetime kerak).
- **OpenAPI**: `/api/schema/` (JSON), `/api/docs/` (Swagger UI).
- **Service tokens**: Botlar xom tokenni `X-SERVICE-TOKEN` headerida yuboradi; `.env` dagi sha256 hash bilan tekshiriladi.

## Ishga tushirish (Poetry)
1. Python 3.12+ va [Poetry](https://python-poetry.org/) o'rnating.
2. `cp .env.example .env` qilib DB va JWT sozlamalarini to'ldiring. Bot token hashlarini yaratish uchun:
   ```bash
   python - <<'PY'
   import hashlib
   print(hashlib.sha256(b'secret-token').hexdigest())
   PY
   ```
   `SERVICE_TOKEN_BOT1_HASH`, `SERVICE_TOKEN_BOT2_HASH` ga qo'ying. Lokal uchun `USE_SQLITE=1` qo'yib Postgres o'rniga `db.sqlite3` dan foydalanishingiz mumkin.
3. Bog'liqliklar: `poetry install`
4. Migratsiyalar: `poetry run python manage.py migrate`
5. Admin yaratish: `poetry run python manage.py create_admin --email admin@example.com --password pass1234`
6. Demo ma'lumotlar (ixtiyoriy): `poetry run python manage.py create_mock_data` yoki katta hajm uchun `seed_ttpumock --scale medium --seed 1`
7. Server: `poetry run python manage.py runserver 0.0.0.0:8000`

## Docker
1. `.env` faylini to'ldiring.
2. `docker compose up --build`

`entrypoint.sh` migratsiya, `collectstatic` va `gunicorn` (8000 port) ni ishga tushiradi.

## Management buyruqlari
- `create_admin --email ... --password ...` – admin user yaratadi.
- `seed_programs [--deactivate-missing]` – katalogga bakalavr/master dasturlarini yuklaydi.
- `import_roster --file roster.csv` – CSV orqali roster qo'shish/yangilash (server ichida ham API mavjud).
- `create_mock_data [--admin-password ... --viewer-password ...]` – minimal demo foydalanuvchi, catalog va bot ma'lumotlari.
- `seed_ttpumock [--scale small|medium|large] [--seed N] [--upsert]` – katta hajmli sintetik ma'lumot (bot1 arizalari, roster, survey).

## Testlar
`poetry run pytest` – pytest-django bilan asosiy oqimlar va management buyruqlari tekshiruvlari.
