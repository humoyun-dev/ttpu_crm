# TTPU CRM System - Project Documentation

## Loyiha Haqida

**TTPU CRM 2** - Turin Polytechnic University in Tashkent uchun CRM tizimi. Tizim 3 ta asosiy komponentdan iborat:

1. **Django Backend (Server)** - REST API, ma'lumotlar bazasi, admin panel
2. **Bot1 Service** - Asosiy Telegram bot (aiogram 3.x)
3. **Bot2 Service** - Anketalash uchun qo'shimcha Telegram bot

---

## Arxitektura

```
┌─────────────────────────────────────────────────────────────┐
│                     Docker Compose                          │
├──────────────┬──────────────┬──────────────┬───────────────┤
│   Server     │    Bot1      │    Bot2      │   PostgreSQL  │
│  (Django)    │  (aiogram)   │  (aiogram)   │   Database    │
│  Port: 8000  │              │              │   Port: 5432  │
└──────────────┴──────────────┴──────────────┴───────────────┘
```

### Texnologiyalar

**Backend:**

- Django 5.2.10
- Django REST Framework 3.15.2
- PostgreSQL 15
- django-rest-framework-simplejwt 5.4.0
- django-filter 25.0

**Botlar:**

- aiogram 3.12.0
- httpx 0.27.0
- pydantic 2.10.6

### Ishga tushirish

```
docker compose up -d --build
```

- Django: `http://localhost:8000`
- Botlar: Telegram tokenlari `.env` ichida (`bot1_service/.env`, `bot2_service/.env`).
- Service tokenlari: `server/.env` dagi `SERVICE_TOKEN_BOT1_HASH`, `SERVICE_TOKEN_BOT2_HASH` (sha256 hash); bot envlarida `SERVICE_TOKEN` — xom token.

---

## Server Strukturasi

### Django Apps

```
server/
├── crm_server/          # Asosiy settings va URL konfiguratsiya
├── authn/               # Autentifikatsiya (JWT, login/logout)
├── catalog/             # Katalog tizimi (yo'nalishlar, fanlar, hududlar)
├── bot1/                # Bot1 uchun API endpointlari
├── bot2/                # Bot2 uchun API endpointlari
├── audit/               # Audit logging tizimi
├── analytics/           # Statistika va hisobotlar
└── common/              # Umumiy utillar (auth, permissions, pagination)
```

### Asosiy Modellar

#### Catalog (catalog/models.py)

```python
class CatalogItem:
    type = PROGRAM | DIRECTION | REGION | TRACK | SUBJECT
    code = CharField(unique=True)
    metadata = JSONField  # {name_uz, name_ru, name_en, ...}
    is_active = BooleanField
```

#### Bot1 (bot1/models.py)

- `Bot1Applicant` - Telegram foydalanuvchilar
- `Admissions2026Application` - Qabul arizalari
- `CampusTourRequest` - Campus Tour so'rovlari
- `FoundationRequest` - Foundation Year arizalari
- `PolitoAcademyRequest` - Polito Academy arizalari

#### Bot2 (bot2/models.py)

- `StudentRoster` - Talabalar ro'yxati
- `Bot2Student` - Bot2 foydalanuvchilar
- `Bot2SurveyResponse` - So'rovnoma javoblari

#### Audit / Analytics
- Audit har bir o‘zgarishni `audit_log` jadvaliga yozadi (actor, entity, action, meta).
- Analytics app DRF read-only statistikalarni beradi.

### API Endpoints (asosiylari)

- `/api/v1/auth/login` (POST) – email/password, JWT qaytaradi.
- `/api/v1/catalog/items/` – filter: `type`, `is_active=true`.
- Bot1 (service-token talab):
  - `POST /api/v1/bot1/applicants/upsert`
  - `POST /api/v1/bot1/admissions-2026/submit`
  - `POST /api/v1/bot1/campus-tour/submit`
  - `POST /api/v1/bot1/foundation/submit`
  - `POST /api/v1/bot1/polito-academy/submit`
- Bot2 (service-token talab):
  - `POST /api/v1/bot2/surveys/submit` (roster topilmasa program_id bo‘lsa auto-create)
  - `POST /api/v1/bot2/import-roster` (admin auth) – CSV/JSON bulk import.

---

## Mock Data Yaratish

Mock datalar Django management commands orqali yaratiladi:

### 1. Katalog Seed Commands

#### Directions va Regions (`seed_catalog.py`)

```bash
docker-compose exec server python manage.py seed_catalog
```

**Nima seed qilinadi:**

- 8 ta bakalavriat yo'nalishlari (DIRECTION)
  - 3 ta Italiya diplomi bilan 🇮🇹
  - 5 ta O'zbekiston diplomi bilan 🇺🇿
- 14 ta hudud (REGION)
  - Toshkent shahri, Andijon, Farg'ona, va h.k.

**Kod namunasi:**

```python
DIRECTIONS = [
    {
        "id": 1,
        "name_uz": "Mexanika muhandisligi 🇮🇹",
        "name_ru": "Машиностроительная инженерия 🇮🇹",
        "name_en": "Mechanical Engineering 🇮🇹",
        "code": "DIR-MECH-IT",
        "diploma": "italian",
    },
    # ... 7 ta yana
]

REGIONS = [
    {
        "code": "UZ-TAS",
        "name_uz": "Toshkent shahri",
        "name_ru": "город Ташкент",
        "name_en": "Tashkent city",
    },
    # ... 13 ta yana
]

# Seed logic
for direction in DIRECTIONS:
    CatalogItem.objects.update_or_create(
        code=direction["code"],
        defaults={
            "type": CatalogItem.ItemType.DIRECTION,
            "metadata": {
                "name_uz": direction["name_uz"],
                "name_ru": direction["name_ru"],
                "name_en": direction["name_en"],
            },
            "is_active": True,
        }
    )
```

#### Polito Tracks va Subjects (`seed_polito_admissions.py`)

```bash
docker-compose exec server python manage.py seed_polito_admissions
```

**Nima seed qilinadi:**

- 2 ta Polito Academy tracks (TRACK)
  - Italian Track 🇮🇹
  - Uzbek Track 🇺🇿
- 8 ta fan (SUBJECT)
  - Matematika, Fizika, Kimyo, Biologiya
  - Informatika, Ingliz, Rus, Tarix

**Kod namunasi:**

```python
POLITO_TRACKS = [
    {
        "code": "TRACK-ITALIAN",
        "name_uz": "Italiya yo'nalishi",
        "name_ru": "Итальянское направление",
        "name_en": "Italian Track",
    },
    # ...
]

ADMISSIONS_SUBJECTS = [
    {
        "code": "SUBJ-MATH",
        "name_uz": "Matematika",
        "name_ru": "Математика",
        "name_en": "Mathematics",
    },
    # ...
]
```

### 2. Yangi Mock Data Qo'shish

**Qadam 1:** Management command yarating

```bash
# server/catalog/management/commands/seed_mydata.py
from django.core.management.base import BaseCommand
from catalog.models import CatalogItem

class Command(BaseCommand):
    help = "Seed custom catalog data"

    def handle(self, *args, **options):
        items = [
            {
                "code": "MY-ITEM-1",
                "type": CatalogItem.ItemType.PROGRAM,
                "metadata": {
                    "name_uz": "Nomi o'zbekcha",
                    "name_ru": "Название русский",
                    "name_en": "Name in English",
                },
            },
        ]

        for item in items:
            CatalogItem.objects.update_or_create(
                code=item["code"],
                defaults={
                    "type": item["type"],
                    "metadata": item["metadata"],
                    "is_active": True,
                }
            )

        self.stdout.write(self.style.SUCCESS(f"✅ Seeded {len(items)} items"))
```

**Qadam 2:** Ishga tushirish

```bash
docker-compose exec server python manage.py seed_mydata
```

---

## Bot1 Service (aiogram)

- Joylashuv: `bot1_service/src/bot1_service`
- Oqim: `/start` -> til -> kontakt -> ism/familiya -> gender/hudud/birthdate -> asosiy menu.
- Bo‘limlar: Campus Tour, Admissions 2026, Foundation Year, Polito Academy, Profile, Arizalarim, Sozlamalar.
- Katalog keshi: `catalog_cache` region/track/direction/subjectlarni DRF’dan oladi, dashboard JWT bilan.
- API klient: `api.py` – service token header, dashboard login (Bearer), katalog GET trailing slash.
- Saqlash: `store.py` JSON (data/bot1_store.json), profil va arizalar (meta bilan).
- Inline kalendar: `calendar.py` (minimal yil = hozirgi yil - 17).
- Arizalarim: oxirgi 5 arizani formatda ko‘rsatadi (admissions track/direction, polito subject, campus org+vaqt, foundation).

## Bot2 Service (aiogram)

- Joylashuv: `bot2_service/src/bot2_service`
- Oqim: `/start` -> til -> contact -> ism/familiya -> jins -> hudud -> student_id -> dastur (program/direction) -> kurs yili (1-4) -> ishlaysizmi? -> branch:
  - Ha: kompaniya -> lavozim -> thanks
  - Yo‘q: universitet yordam/consent -> kanallar -> thanks
- API klient: `api.py` – service token, dashboard login (Bearer), `submit_survey` POST.
- Catalog keishi: `catalog_cache.py` – programs/regions pull.
- States: `SurveyState` (waiting_course_year kiritilgan).
- Text/klaviatura: `texts.py`, `keyboards.py` (course_year_keyboard 1–4).

## Docker-compose

- `db`: postgres:15, port 5432 (host mapping configurable).
- `server`: build `./server`, command `entrypoint.sh` (migrate, collectstatic, gunicorn with longer timeouts).
- `bot1`: build `./bot1_service`, command `python -m bot1_service.main`.
- `bot2`: build `./bot2_service`, command `python -m bot2_service.main`.

Portlar:
- Server: 8000 (published)
- Bots: outbound only.

## Muhim sozlamalar

- `server/.env`:
  - `DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,server,0.0.0.0`
  - `SERVICE_TOKEN_BOT1_HASH`, `SERVICE_TOKEN_BOT2_HASH` (sha256)
- `bot1_service/.env`:
  - `BOT_TOKEN`, `SERVER_BASE_URL=http://server:8000/api/v1`, `SERVICE_TOKEN=<raw>`, `DASHBOARD_EMAIL/PASSWORD`, `DEFAULT_LANGUAGE`, `CATALOG_CACHE_TTL`
- `bot2_service/.env`: xuddi shunday, Bot2 tokeni va service tokeni.

## Arxitektura tavsiflari

- **Ma’lumot oqimi**: bot -> api.py -> server DRF -> DB; bot1 local store, bot2 state orqali.
- **Service Auth**: `X-SERVICE-TOKEN` + server hash tekshiruv (`common.auth.verify_service_token`).
- **Dashboard Auth**: katalog/program GET uchun `/auth/login` Bearer token.
- **Idempotensiya**:
  - Bot1: applicant+model bo‘yicha get_or_create + partial update.
  - Bot2: roster+campaign bo‘yicha update-or-create.

## Model detallari (maydonlar)

- `CatalogItem`: `id (UUID)`, `type`, `code`, `metadata{name_uz,name_ru,name_en,...}`, `is_active`.
- `Bot1Applicant`: `telegram_user_id`, `telegram_chat_id`, `username`, `first_name`, `last_name`, `phone`, `email`, `region(FK)`, `created_at`.
- `Admissions2026Application`: `applicant FK`, `direction FK`, `track FK`, `status`, `answers JSON`, `submitted_at`.
- `CampusTourRequest`: `applicant FK`, `preferred_date`, `status`, `answers JSON`, `submitted_at`.
- `FoundationRequest`: `applicant FK`, `status`, `answers JSON`, `submitted_at`.
- `PolitoAcademyRequest`: `applicant FK`, `subject FK`, `status`, `answers JSON`, `submitted_at`.
- `StudentRoster`: `student_external_id`, `program FK`, `course_year (1-4)`, `roster_campaign`, `is_active`, `metadata`.
- `Bot2Student`: `student_external_id`, `roster FK`, `telegram_user_id`, `username`, `first_name`, `last_name`, `gender`, `phone`, `region FK`.
- `Bot2SurveyResponse`: `student FK`, `roster FK`, `program FK`, `course_year`, `survey_campaign`, `employment_status/company/role`, `suggestions`, `consents JSON`, `answers JSON`, `submitted_at`.

## Seed / Test

- Seed katalog va polito ma’lumotlari:
  - `docker compose exec server python manage.py seed_catalog`
  - `docker compose exec server python manage.py seed_polito_admissions`
- Mock ttpumock (medium scale):
  - `docker compose exec server python manage.py seed_ttpumock --scale medium --upsert`

## Qo‘llab-quvvatlovchi skriptlar

- `server/entrypoint.sh`: migrate, collectstatic, gunicorn (timeout 120s).
- `bot1_service/main.py`, `bot2_service/main.py`: botlarni ishga tushiradi.

## Tez-tez uchraydigan muammolar

- 301/401 katalog GET: SERVER_BASE_URL trailing slash + dashboard login.
- Service token mos emas: server hash va bot raw token bir xil bo‘lsin.
- DisallowedHost: `DJANGO_ALLOWED_HOSTS` ga `server` va `0.0.0.0` qo‘shilganini tekshiring.
- Bot2 duplicate survey: endi update-or-create; baribir xato bo‘lsa, campaign nomini o‘zgartiring.

## Bot1 Service

### Funksiyalar

Bot1 - asosiy ariza qabul qilish boti:

1. **Campus Tour** - Universitet kampusini ko'rish uchun ariza

   - Tashkilot, lavozim, telefon, sana, vaqt

2. **Qabul 2026** - Talabaga qabul arizasi

   - Track tanlash (Italian/Uzbek)
   - Yo'nalish tanlash (8 ta variant)
   - Hudud
   - Ikkinchi telefon

3. **Foundation Year** - Tayyorlov kursi uchun ariza

   - Qo'shimcha telefon

4. **Polito Academy** - Akademiya uchun ariza
   - Fan tanlash
   - Ball kiritish (0-100)

### Keyboard Tizimi

**ReplyKeyboardMarkup** ishlatiladi (to'liq navigatsiya):

```python
# Asosiy menyu
[Campus Tour] [Qabul 2026]
[Foundation Year] [Polito Academy]
[Profil] [Arizalarim]
[Sozlamalar]

# Navigatsiya
[◀️ Ortga] [🏠 Bosh sahifa]

# Tasdiqlash
[✅ Ha] [❌ Yo'q]
```

### State Management (FSM)

```python
class AdmissionsState(StatesGroup):
    track = State()          # Track tanlash
    direction = State()      # Yo'nalish
    region = State()         # Hudud
    second_phone = State()   # Telefon
    confirm = State()        # Tasdiqlash
```

### API Client

```python
class CrmApiClient:
    async def login_dashboard(self) -> bool
    async def get_catalog_items(self, item_type: str) -> list[dict]
    async def submit_admissions(self, payload: dict) -> ApiResult
    async def submit_campus_tour(self, payload: dict) -> ApiResult
    async def submit_foundation(self, payload: dict) -> ApiResult
    async def submit_polito_academy(self, payload: dict) -> ApiResult
```

---

## Bot2 Service

### Funksiyalar

Bot2 - talabalar uchun anketalash boti:

1. **Registratsiya Flow**

   - Til tanlash (O'zbek/Русский/English)
   - Telefon raqam
   - Ism, familiya
   - Jins
   - Hudud
   - Talaba ID
   - Program tanlash
   - Ish holati (ishlaymi?)

2. **Conditional Logic**
   - Agar ishlamasa → "/start" tugadi
   - Agar ishlasa → ish joyi, ish vaqti, maosh so'raladi

### Data Flow

```
Bot2 → Server API → StudentRoster + Bot2Student + Bot2SurveyResponse
```

---

## API Endpoints

### Authentication (`/api/v1/auth/`)

```
POST /login          # Email/password login
POST /refresh        # JWT refresh token
POST /logout         # Logout
```

### Catalog (`/api/v1/catalog/`)

```
GET  /items/         # List catalog items
                     # ?type=direction&is_active=true
POST /items/         # Create (admin only)
GET  /items/{id}/    # Detail
PATCH /items/{id}/   # Update (admin only)
```

### Bot1 (`/api/v1/bot1/`)

```
POST /applicants/upsert              # Create/update applicant
POST /campus-tour/submit             # Submit campus tour
POST /foundation/submit              # Submit foundation
POST /polito-academy/submit          # Submit polito academy
POST /admissions-2026/submit         # Submit admissions
```

### Bot2 (`/api/v1/bot2/`)

```
POST /submit-survey                  # Submit survey response
```

---

## Authentication

### 1. JWT Authentication (Dashboard)

Dashboard login uchun:

```python
POST /api/v1/auth/login
{
    "email": "admin@ttpu.uz",
    "password": "password123"
}

Response:
{
    "user": {...},
    "access": "eyJ0eXAi...",
    "refresh": "eyJ0eXAi..."
}
```

Keyingi so'rovlarda:

```
Authorization: Bearer <access_token>
```

### 2. Service Token Authentication (Bots)

Botlar uchun SHA256 hash token:

```python
# .env
BOT1_SERVICE_TOKEN_RAW=raw-bot1-service-token
BOT1_SERVICE_TOKEN_HASH=sha256(raw-bot1-service-token)
```

So'rovda:

```
X-SERVICE-TOKEN: raw-bot1-service-token
```

Server tekshiradi:

```python
def verify_service_token(token: str, service_name: str):
    expected_hash = settings.SERVICE_TOKENS.get(service_name)
    actual_hash = hashlib.sha256(token.encode()).hexdigest()
    if actual_hash != expected_hash:
        raise PermissionDenied("Invalid service token")
```

---

## Ma'lumotlar Bazasi

### Catalog Schema

```sql
CREATE TABLE catalog_catalogitem (
    id UUID PRIMARY KEY,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    type VARCHAR(50),  -- PROGRAM, DIRECTION, REGION, TRACK, SUBJECT
    code VARCHAR(100) UNIQUE,
    metadata JSONB,
    is_active BOOLEAN
);
```

### Metadata Strukturasi

```json
{
  "name_uz": "Dasturiy ta'minot muhandisligi",
  "name_ru": "Программная инженерия",
  "name_en": "Software Engineering",
  "description_uz": "...",
  "icon": "💻"
}
```

### Index va Constraints

```sql
-- Type-based filtering
CREATE INDEX idx_catalogitem_type ON catalog_catalogitem(type);

-- Active items only
CREATE INDEX idx_catalogitem_active ON catalog_catalogitem(is_active)
WHERE is_active = true;

-- Unique code
ALTER TABLE catalog_catalogitem
ADD CONSTRAINT unique_code UNIQUE(code);
```

---

## Testing

### Server Tests

```bash
# Barcha testlarni ishga tushirish
docker-compose exec server pytest

# Faqat bot2 testlari
docker-compose exec server pytest tests/test_bot2_survey.py

# Coverage bilan
docker-compose exec server pytest --cov=server --cov-report=html
```

**Test Coverage:**

- 32 passing tests
- 68% bot2 coverage
- Integration tests: authentication, catalog, survey submission

### Manual Testing

```bash
# Bot1 ni test qilish
# Telegram da @turin_register_bot ga /start yuboring

# Bot2 ni test qilish
# Telegram da bot2 ga /start yuboring

# API ni test qilish
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ttpu.uz","password":"admin123"}'
```

---

## Deployment

### Development

```bash
# Barcha servislarni ishga tushirish
docker-compose up -d

# Loglarni ko'rish
docker-compose logs -f server
docker-compose logs -f bot1
docker-compose logs -f bot2

# Database migration
docker-compose exec server python manage.py migrate

# Superuser yaratish
docker-compose exec server python manage.py createsuperuser

# Mock data seed
docker-compose exec server python manage.py seed_catalog
docker-compose exec server python manage.py seed_polito_admissions
```

### Production Checklist

- [ ] `DEBUG=False` qilish
- [ ] `SECRET_KEY` ni secure qilish
- [ ] `ALLOWED_HOSTS` ni to'g'ri sozlash
- [ ] PostgreSQL SSL connection
- [ ] Nginx reverse proxy
- [ ] SSL/TLS sertifikat (Let's Encrypt)
- [ ] Backup strategiyasi
- [ ] Monitoring (Sentry, Prometheus)
- [ ] Log aggregation (ELK Stack)

---

## Environment Variables

### Server (.env)

```bash
# Django
SECRET_KEY=your-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Database
POSTGRES_DB=ttpu_crm
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_HOST=db
POSTGRES_PORT=5432

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Service Tokens
BOT1_SERVICE_TOKEN_HASH=sha256_hash_here
BOT2_SERVICE_TOKEN_HASH=sha256_hash_here

# Admin
DJANGO_SUPERUSER_EMAIL=admin@ttpu.uz
DJANGO_SUPERUSER_PASSWORD=admin123
```

### Bot1 (.env)

```bash
BOT_TOKEN=your_telegram_bot_token
SERVER_BASE_URL=http://server:8000/api/v1
SERVICE_TOKEN=raw-bot1-service-token
DASHBOARD_EMAIL=admin@ttpu.uz
DASHBOARD_PASSWORD=admin123
```

### Bot2 (.env)

```bash
BOT_TOKEN=your_telegram_bot_token
SERVER_BASE_URL=http://server:8000/api/v1
SERVICE_TOKEN=raw-bot2-service-token
```

---

## Common Issues & Solutions

### 1. "Object of type ApiResult is not JSON serializable"

**Sabab:** ApiResult obyekti to'g'ridan-to'g'ri JSON ga convert bo'lmaydi

**Yechim:**

```python
# XATO
app = ApplicationRecord(kind="admissions", response=resp)

# TO'G'RI
app = ApplicationRecord(kind="admissions", response=resp.data if resp.ok else None)
```

### 2. "null value in column violates not-null constraint"

**Sabab:** Required field (masalan, direction_id) None

**Yechim:** Payload tekshiring

```python
logger.info(f"Payload: {payload}")  # Debug
```

### 3. Bot javob bermayapti

**Tekshirish:**

```bash
# Bot loglarini ko'rish
docker-compose logs -f bot1

# Polling active ekanini tekshirish
# Log da "Start polling" bo'lishi kerak
```

### 4. Catalog itemlar topilmayapti

**Yechim:** Seed commandlarni qayta ishga tushiring

```bash
docker-compose exec server python manage.py seed_catalog
docker-compose exec server python manage.py seed_polito_admissions
```

---

## Yangi Feature Qo'shish

### Backend API Endpoint

1. **Model yaratish** (`server/myapp/models.py`)

```python
class MyModel(models.Model):
    name = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
```

2. **Serializer** (`server/myapp/serializers.py`)

```python
class MyModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = MyModel
        fields = '__all__'
```

3. **View** (`server/myapp/views.py`)

```python
@api_view(['POST'])
@permission_classes([])
def my_endpoint(request):
    verify_service_token(request.headers.get('X-SERVICE-TOKEN'))
    # Logic here
    return Response(data, status=201)
```

4. **URL** (`server/crm_server/urls.py`)

```python
path('api/v1/myapp/submit', my_endpoint),
```

5. **Migration**

```bash
docker-compose exec server python manage.py makemigrations
docker-compose exec server python manage.py migrate
```

### Bot Flow

1. **State** (`bot1_service/states.py`)

```python
class MyFlowState(StatesGroup):
    step1 = State()
    step2 = State()
    confirm = State()
```

2. **Handler** (`bot1_service/handlers.py`)

```python
@router.message(F.text == "My Feature")
async def start_flow(message: Message, state: FSMContext):
    await state.set_state(MyFlowState.step1)
    await message.answer("Step 1", reply_markup=my_keyboard())
```

3. **API Client** (`bot1_service/api.py`)

```python
async def submit_my_feature(self, payload: dict) -> ApiResult:
    return await self._post_service("/myapp/submit", payload)
```

---

## Project Statistics

- **Kod qatorlari:** ~15,000+
- **Django apps:** 8 ta
- **API endpoints:** 25+
- **Bot states:** 15+
- **Database tables:** 20+
- **Mock catalog items:** 32 ta
  - 8 directions
  - 14 regions
  - 2 tracks
  - 8 subjects

---

## Team & Contacts

**Developer:** AI Assistant
**Project:** TTPU CRM System v2
**Started:** January 2026
**Status:** Active Development

---

## License

Proprietary - Turin Polytechnic University in Tashkent

---

**Last Updated:** January 19, 2026
