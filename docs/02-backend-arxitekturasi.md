# Backend arxitekturasi

Bu hujjat TTPU CRM backend (`server/`) ning umumiy tuzilishini va `common/` (umumiy) qatlamini batafsil tushuntiradi. Backend — bu butun tizimning "haqiqat manbasi" (system of record): u barcha ma'lumotlar modellarini, autentifikatsiyani, REST API ni va analitik agregatsiyani o'z ichiga oladi. Hujjat loyihaga yangi qo'shilgan dasturchi uchun mo'ljallangan — uni o'qib bo'lgach, siz Django loyihasi qanday sozlanganini, qaysi app nima vazifa bajarishini, so'rovlar qanday marshrutlanishini va kod bo'ylab takror ishlatiladigan `common/` qatlami qanday ishlashini tushunib olasiz.

> Eslatma: bu loyiha tarkibida tirik komponentlar faqat **backend + Bot 2 + dashboard**. Eski hujjatlardagi "Bot 1", `server/bot1`, `/api/v1/bot1/*`, `SERVICE_TOKEN_BOT1_HASH` ESKIRGAN va kodda mavjud emas (`98dd68c` commitda olib tashlangan, `common/migrations/0002_drop_bot1_tables.py` migratsiyasi bilan jadvallar tushirilgan).

---

## 1. Texnologik asos (stack)

Backend Python 3.12 da yozilgan va Django 5 + Django REST Framework (DRF) ustiga qurilgan. Asosiy paketlar (`server/pyproject.toml` va `server/requirements.txt` dan):

| Paket | Versiya cheklovi | Vazifasi |
|-------|------------------|----------|
| `django` | `^5.0` (`>=5.0,<6.0`) | Asosiy web-freymvork, ORM, admin |
| `djangorestframework` | `^3.16.1` | REST API qatlami (serializer, viewset, router) |
| `djangorestframework-simplejwt` | `^5.5.1` | JWT autentifikatsiya (access/refresh tokenlar) |
| `drf-spectacular` | `^0.29.0` | OpenAPI 3 schema va Swagger UI |
| `django-cors-headers` | `^4.9.0` | CORS sarlavhalarini boshqarish |
| `psycopg2-binary` | `^2.9.11` | PostgreSQL drayveri |
| `django-filter` | `^25.2` | Query-parametr asosida filtrlash (`DjangoFilterBackend`) |
| `python-dotenv` | `^1.2.1` | `.env` fayldan o'zgaruvchilarni yuklash (`load_dotenv()`) |
| `pytz` | `^2025.2` | Timezone yordamchisi |
| `gunicorn` | `^23.0.0` | WSGI ishlab chiqarish serveri |
| `whitenoise` | `^6.8.2` | Statik fayllarni xizmat ko'rsatish (middleware) |

Dev (test) bog'liqliklar: `pytest`, `pytest-django`, `model-bakery`, `pytest-cov`.

> Diqqat: bog'liqliklar **ikki joyda** ta'riflangan — `pyproject.toml` (Poetry, Docker tomonidan ishlatiladi) va `requirements.txt` (pip, deploy qo'llanmalarida ishlatiladi). Ikkalasi ham birga yashaydi.

---

## 2. Loyiha tuzilishi va app'lar

Backend kodi `server/` papkasida. Loyiha konfiguratsiyasi `server/crm_server/` ichida (`settings.py`, `urls.py`, `wsgi.py`, `asgi.py`), domen logikasi esa alohida Django app'larga bo'lingan.

### 2.1 INSTALLED_APPS ro'yxati va tartibi

`server/crm_server/settings.py:28` da `INSTALLED_APPS` quyidagi tartibda:

```python
INSTALLED_APPS = [
    # 1) Django contrib (ichki) app'lar
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # 2) Uchinchi tomon paketlari
    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "drf_spectacular",
    "django_filters",
    # 3) Loyiha (domen) app'lari
    "common",
    "authn",
    "catalog",
    "bot2",
    "audit",
    "analytics",
]
```

Tartib muhim: Django ichki app'lari → uchinchi tomon paketlari → loyiha app'lari. Loyiha app'lari ichida `common` birinchi turadi, chunki boshqa app'lar undan abstract modellar (`BaseModel`) va yordamchilarni import qiladi.

> Eslatma: `rest_framework_simplejwt.token_blacklist` o'rnatilgan bo'lsa-da, amalda foydalanilmaydi — JWT bekor qilish (revocation) uchun `authn` app'idagi maxsus `RevokedToken` modeli ishlatiladi. Batafsil: [03-autentifikatsiya.md](03-autentifikatsiya.md).

### 2.2 Har bir app ning roli

| App | Vazifasi | Asosiy fayllar |
|-----|----------|----------------|
| `common/` | Umumiy infratuzilma: abstract base modellar, xato envelope, service-token autentifikatsiya, pagination, throttle, rol permission klasslari, `ServiceToken` modeli, ISO sana parseri | `common/models.py`, `common/exceptions.py`, `common/auth.py`, `common/permissions.py`, `common/pagination.py`, `common/throttles.py`, `common/time.py` |
| `authn/` | Email-asosli maxsus `User`, JWT cookie autentifikatsiya (`CookieJWTAuthentication`), login/refresh/logout/me endpointlari, `RevokedToken` denylist, `create_admin`/`cleanup_tokens` komandalar | `authn/models.py`, `authn/authentication.py`, `authn/views.py` |
| `catalog/` | Polimorfik `CatalogItem` + `CatalogRelation` ma'lumotnoma (programmalar, yo'nalishlar, fanlar, treklar, regionlar). CRUD viewset'lar + read-only Programs API + seed komandalar | `catalog/models.py`, `catalog/serializers.py`, `catalog/views.py` |
| `bot2/` | So'rovnoma domeni: `StudentRoster`, `Bot2Student`, `Bot2SurveyResponse`, `ProgramEnrollment`; roster import + survey submit endpointlari; coverage annotatsiyalari | `bot2/models.py`, `bot2/services.py`, `bot2/views.py` |
| `analytics/` | **Modelsiz, faqat view.** 6 ta `@api_view` endpoint Bot 2 so'rovnoma qamrovini (coverage) hisoblaydi. `models.py` va `admin.py` bo'sh (0 bayt) | `analytics/views.py` |
| `audit/` | Faqat qo'shiladigan (append-only) `AuditLog` + PII redaksiyasi bilan `log_audit()` yordamchisi. Loglash **qo'lda/ixtiyoriy** — authn/bot2/catalog view'lariga ulangan | `audit/models.py`, `audit/utils.py` |

Mufassal: backend modellari uchun [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) (shu hujjat) common qatlamini, domen app'lari uchun [03-autentifikatsiya.md](03-autentifikatsiya.md), [04-katalog.md](04-katalog.md), [05-bot2-backend.md](05-bot2-backend.md), [06-analitika-va-audit.md](06-analitika-va-audit.md) ga qarang.

### 2.3 AUTH_USER_MODEL va DEFAULT_AUTO_FIELD

`settings.py:122` da `AUTH_USER_MODEL = "authn.User"` — Django'ning standart `User` modeli o'rniga `authn` app'idagi maxsus email-asosli model ishlatiladi.

`settings.py:121` da `DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"`. Lekin amalda barcha domen modellari `common/models.py:BaseModel` orqali UUID primary key ishlatadi, shuning uchun `BigAutoField` faqat avtomatik (M2M through) jadvallar uchungina kuchga kiradi.

---

## 3. MIDDLEWARE

`settings.py:50` dagi middleware steki (tartibi muhim — yuqoridagilar so'rov bo'yicha birinchi ishlaydi):

```python
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",                    # 1) CORS sarlavhalari (eng yuqorida)
    "django.middleware.security.SecurityMiddleware",            # 2) SSL redirect, HSTS va h.k.
    "whitenoise.middleware.WhiteNoiseMiddleware",               # 3) Statik fayllarni xizmat qilish
    "django.contrib.sessions.middleware.SessionMiddleware",     # 4) Sessiya (asosan admin uchun)
    "django.middleware.common.CommonMiddleware",                # 5) Umumiy normalizatsiya
    "django.middleware.csrf.CsrfViewMiddleware",                # 6) CSRF himoyasi
    "django.contrib.auth.middleware.AuthenticationMiddleware",  # 7) request.user
    "django.contrib.messages.middleware.MessageMiddleware",     # 8) Flash xabarlar (admin)
    "django.middleware.clickjacking.XFrameOptionsMiddleware",   # 9) X-Frame-Options
]
```

Diqqatga sazovor nuqtalar:
- **`CorsMiddleware` eng yuqorida** turishi shart, aks holda CORS preflight so'rovlari boshqa middleware'lar tomonidan to'silib qolishi mumkin.
- **`WhiteNoiseMiddleware`** statik fayllarni Gunicorn orqali to'g'ridan-to'g'ri xizmat qiladi (Nginx'siz ham ishlaydi). `STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"` (`settings.py:116`) bilan birgalikda statik fayllar siqilgan va versiyalangan holda beriladi.
- Bu loyihada asosiy autentifikatsiya stateless JWT (DRF qatlamida) bo'lgani uchun `SessionMiddleware`/`CsrfViewMiddleware` asosan Django admin paneliga xizmat qiladi.

---

## 4. REST_FRAMEWORK sozlamalari

`settings.py:124` dagi `REST_FRAMEWORK` lug'ati DRF ning butun xulq-atvorini boshqaradi:

```python
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "authn.authentication.CookieJWTAuthentication",   # Bearer header → access cookie fallback
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",     # Hamma narsa default'da yopiq
    ),
    "DEFAULT_PAGINATION_CLASS": "common.pagination.DefaultPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.AnonRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {"user": "1000/day", "anon": "100/day", "login": "10/minute"},
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
}
```

Tushuntirish:
- **Autentifikatsiya:** Yagona default klass `CookieJWTAuthentication` (`authn` app'ida). U avval `Authorization: Bearer <token>` sarlavhasini tekshiradi, agar token noto'g'ri bo'lsa, `access_token` cookie'ga "jimgina" o'tadi. Batafsil: [03-autentifikatsiya.md](03-autentifikatsiya.md).
- **Default ruxsat:** `IsAuthenticated` — barcha endpointlar standart holda autentifikatsiyani talab qiladi. Ochiq endpointlar (`login`, `refresh`, `submit_survey`) ataylab `AllowAny` yoki `permission_classes=[]` bilan ochiladi.
- **Pagination:** Sahifa hajmi standart 25, lekin `common.pagination.DefaultPagination` orqali `?page_size=` query bilan o'zgartirilishi mumkin (max 500). Pastda batafsil.
- **Throttle (chastota cheklovi):** har bir autentifikatsiyalangan foydalanuvchi kuniga 1000 so'rov, anonim 100 so'rov, login esa daqiqasiga 10 marta (`LoginRateThrottle`).
- **Exception handler:** Barcha xatolar `common.exceptions.custom_exception_handler` orqali yagona `{error:{code,message,details}}` formatga keltiriladi (pastda batafsil).

### 4.1 SimpleJWT sozlamalari

`settings.py:145`:

```python
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("REFRESH_TOKEN_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": True,   # ROTATE=False bo'lgani uchun inert (kuchsiz)
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}
```

- Access token umri ~15 daqiqa, refresh token ~7 kun (env orqali sozlanadi).
- Maxsus `SIGNING_KEY` ko'rsatilmagan, shuning uchun tokenlar Django `SECRET_KEY` bilan HS256 algoritmida imzolanadi. Bu degani: `SECRET_KEY` sizib ketsa, barcha JWT'larni soxtalashtirish mumkin.
- `ROTATE_REFRESH_TOKENS=False` bo'lgani uchun `BLACKLIST_AFTER_ROTATION=True` amalda hech narsa qilmaydi.

JWT to'liq oqimi: [03-autentifikatsiya.md](03-autentifikatsiya.md).

---

## 5. URL marshrutlash

Asosiy URLconf — `server/crm_server/urls.py`. Barcha API endpointlari `/api/v1/` prefiks ostida joylashgan.

### 5.1 Tuzilish

```python
urlpatterns = [
    path("admin/", admin.site.urls),                                  # Django admin
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"), # OpenAPI schema
    path("api/docs/", SpectacularSwaggerView.as_view(...)),           # Swagger UI
    path("api/v1/", include([
        path("healthz", healthz, name="healthz"),                     # {"ok": true}
        path("", include(router.urls)),                               # DefaultRouter resurslari
        # Auth (APIView'lar)
        path("auth/login", LoginView.as_view(), name="auth-login"),
        path("auth/refresh", RefreshView.as_view(), name="auth-refresh"),
        path("auth/logout", LogoutView.as_view(), name="auth-logout"),
        path("auth/me", MeView.as_view(), name="auth-me"),
        # Bot2 funksional view'lar
        path("admin/roster/import", import_roster, name="bot2-roster-import"),
        path("bot2/surveys/submit", submit_survey, name="bot2-survey-submit"),
        # Analytics funksional view'lar
        path("analytics/bot2/course-year-coverage", bot2_course_year_coverage, ...),
        path("analytics/bot2/program-coverage", bot2_program_coverage, ...),
        path("analytics/bot2/program-course-matrix", bot2_program_course_matrix, ...),
        path("analytics/bot2/program-details-by-year", bot2_program_details_by_year, ...),
        path("analytics/bot2/enrollments-overview", enrollments_overview, ...),
        path("analytics/bot2/academic-years", bot2_academic_years, ...),
    ])),
]
```

### 5.2 DefaultRouter bilan ro'yxatdan o'tgan resurslar

ViewSet'lar `rest_framework.routers.DefaultRouter()` orqali avtomatik CRUD URL'larini oladi (`urls.py:31`):

```python
router = routers.DefaultRouter()
router.register(r"catalog/items",      CatalogItemViewSet,        basename="catalog-item")
router.register(r"catalog/relations",  CatalogRelationViewSet,    basename="catalog-relation")
router.register(r"catalog/programs",   ProgramViewSet,            basename="catalog-program")
router.register(r"bot2/roster",        Bot2StudentRosterViewSet,  basename="bot2-roster")
router.register(r"bot2/students",      Bot2StudentViewSet,        basename="bot2-student")
router.register(r"bot2/surveys",       Bot2SurveyResponseViewSet, basename="bot2-survey")
router.register(r"bot2/enrollments",   ProgramEnrollmentViewSet,  basename="bot2-enrollment")
```

Router har bir resurs uchun list (`GET /catalog/items/`), detail (`GET /catalog/items/{id}/`), create, update, delete URL'larini avtomatik yaratadi.

### 5.3 Marshrutlash oqimining ASCII diagrammasi

```
HTTP so'rov
   │
   ▼
/admin/                 → Django admin (sessiya-asosli)
/api/schema/            → OpenAPI 3 schema (drf-spectacular)
/api/docs/              → Swagger UI
/api/v1/
   ├── healthz                          → {"ok": true} (sog'liq tekshiruvi)
   ├── (router)
   │     ├── catalog/items/             → CatalogItemViewSet     (CRUD)
   │     ├── catalog/relations/         → CatalogRelationViewSet (CRUD)
   │     ├── catalog/programs/          → ProgramViewSet         (ReadOnly)
   │     ├── bot2/roster/               → Bot2StudentRosterViewSet
   │     ├── bot2/students/             → Bot2StudentViewSet
   │     ├── bot2/surveys/              → Bot2SurveyResponseViewSet
   │     └── bot2/enrollments/          → ProgramEnrollmentViewSet
   ├── auth/login | refresh | logout | me
   ├── admin/roster/import              → import_roster (ADMIN)
   ├── bot2/surveys/submit             → submit_survey (service token)
   └── analytics/bot2/...               → 6 ta analitika endpointi
```

To'liq endpoint ro'yxati va so'rov/javob misollari: [07-api-malumotnoma.md](07-api-malumotnoma.md).

---

## 6. Env-asosidagi sozlamalar

Barcha muhim sozlamalar `os.getenv(...)` orqali muhit o'zgaruvchilaridan o'qiladi. `settings.py:9` da `load_dotenv()` chaqiriladi, ya'ni `.env` faylidagi qiymatlar avtomatik yuklanadi.

### 6.1 Asosiy sozlamalar

| O'zgaruvchi | Default | Tavsifi |
|-------------|---------|---------|
| `DJANGO_SECRET_KEY` | `"dev-secret-key-change-me"` | JWT imzo kaliti hamdir. Productionda **majburiy** o'zgartirilishi kerak. |
| `DJANGO_DEBUG` | `"false"` | `"true"` bo'lsa DEBUG yoqiladi. |
| `DJANGO_ALLOWED_HOSTS` | (bo'sh) | Vergul bilan ajratilgan hostlar. Bo'sh va DEBUG bo'lsa → `["*"]`. |
| `CSRF_TRUSTED_ORIGINS` | (bo'sh) | Vergul bilan ajratilgan ishonchli originlar. |
| `TIME_ZONE` | `"UTC"` | Server timezone'i. |

`ALLOWED_HOSTS` qurilishi (`settings.py:16`):

```python
ALLOWED_HOSTS: List[str] = []
raw_allowed_hosts = os.getenv("DJANGO_ALLOWED_HOSTS")
if raw_allowed_hosts:
    ALLOWED_HOSTS = [host.strip() for host in raw_allowed_hosts.split(",") if host.strip()]
elif DEBUG:
    ALLOWED_HOSTS = ["*"]            # DEBUG'da hamma host ruxsat
for host in ("testserver", "server"):
    if host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(host)   # testlar va docker-compose 'server' uchun
```

`testserver` (pytest test mijozi uchun) va `server` (docker-compose host nomi) har doim qo'shiladi.

### 6.2 Ma'lumotlar bazasi (DB)

`settings.py:83` da standart engine PostgreSQL:

```python
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "crm_server"),
        "USER": os.getenv("POSTGRES_USER", "postgres"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "postgres"),
        "HOST": os.getenv("POSTGRES_HOST", "localhost"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": int(os.getenv("POSTGRES_CONN_MAX_AGE", "60")),
        "CONN_HEALTH_CHECKS": True,
    }
}
```

Lekin pastda muhim SQLite fallback bor (`settings.py:96`):

```python
if os.getenv("USE_SQLITE", "1") == "1":
    DATABASES["default"] = {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
```

> **Diqqat:** `USE_SQLITE` ning default qiymati `"1"`. Ya'ni hech narsa sozlanmasa, tizim PostgreSQL emas, **SQLite** ishlatadi. PostgreSQL faqat `USE_SQLITE` qiymati `"1"` dan boshqa bo'lganda kuchga kiradi (masalan `USE_SQLITE=0`). Bu nuance deploy paytida tez-tez chalkashlik keltiradi. Batafsil: [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md).

### 6.3 JWT cookie sozlamalari

`settings.py:179`:

| O'zgaruvchi | Default | Tavsifi |
|-------------|---------|---------|
| `ACCESS_COOKIE_NAME` | `"access_token"` | Access JWT cookie nomi. |
| `REFRESH_COOKIE_NAME` | `"refresh_token"` | Refresh JWT cookie nomi. |
| `JWT_COOKIE_SECURE` | `"false"` | `true` bo'lsa cookie faqat HTTPS orqali yuboriladi. Productionda `true` qilish kerak. |
| `JWT_COOKIE_SAMESITE` | `"Lax"` | SameSite siyosati (CSRF mitigatsiyasi). |
| `JWT_COOKIE_DOMAIN` | `None` | Cookie domeni (subdomainlar uchun). |
| `ACCESS_TOKEN_MINUTES` | `"15"` | Access token umri (daqiqa). |
| `REFRESH_TOKEN_DAYS` | `"7"` | Refresh token umri (kun). |

### 6.4 CORS sozlamalari

`settings.py:161`:

```python
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in
    os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()]

if not CORS_ALLOWED_ORIGINS and DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True   # DEBUG'da originlar bo'sh bo'lsa, hammasi ruxsat
else:
    CORS_ALLOW_ALL_ORIGINS = False

CORS_ALLOW_HEADERS = list(default_headers) + ["x-service-token"]
```

- `CORS_ALLOW_CREDENTIALS = True` — dashboard cookie va `credentials: include` ishlatgani uchun zarur.
- `x-service-token` sarlavhasiga ruxsat berilgan, chunki Bot 2 so'rovnoma yuborganda shu sarlavhani jo'natadi.

### 6.5 Service token sozlamasi

`settings.py:175`:

```python
SERVICE_TOKENS = {
    "bot2": os.getenv("SERVICE_TOKEN_BOT2_HASH", ""),
}
```

Faqat `bot2` ulangan (Bot 1 olib tashlangan). Bu lug'at xeshlangan service tokenni env'dan o'qiydi va `verify_service_token` ning DB fallback'i sifatida ishlatiladi (pastda 7.6-bo'limda batafsil).

### 6.6 Production xavfsizlik tugmalari (security knobs)

`settings.py:185` da barcha production xavfsizlik sozlamalari env-bilan boshqariladi va **standart holda OFF** — productionda ularni yoqish kerak:

| O'zgaruvchi | Default | Productiondagi tavsiyaviy qiymat |
|-------------|---------|----------------------------------|
| `USE_X_FORWARDED_HOST` | `false` | `true` (Nginx orqasida) |
| `SECURE_PROXY_SSL_HEADER_ENABLED` | `false` | `true` → `("HTTP_X_FORWARDED_PROTO","https")` |
| `SECURE_SSL_REDIRECT` | `false` | `true` |
| `SESSION_COOKIE_SECURE` | `false` | `true` |
| `CSRF_COOKIE_SECURE` | `false` | `true` |
| `SECURE_HSTS_SECONDS` | `0` | masalan `31536000` |
| `SECURE_HSTS_INCLUDE_SUBDOMAINS` | `false` | `true` |
| `SECURE_HSTS_PRELOAD` | `false` | `true` |
| `SECURE_REFERRER_POLICY` | `"strict-origin-when-cross-origin"` | — |

Productionda env sozlash bo'yicha to'liq ro'yxat: [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md).

### 6.7 drf-spectacular va logging

`settings.py:154` da OpenAPI schema metadata sozlangan (`TITLE`, `DESCRIPTION`, `VERSION="1.0.0"`, `SERVE_INCLUDE_SCHEMA=False`). `settings.py:200` da oddiy console logging (`verbose` formatter, root level `INFO`) sozlangan — barcha loglar stdout/stderr ga chiqadi (Gunicorn/Docker uchun qulay).

---

## 7. `common/` qatlami — umumiy infratuzilma

`common/` app'i barcha boshqa app'lar foydalanadigan takrorlanuvchi kodni saqlaydi: abstract modellar, xato envelope, autentifikatsiya yordamchilari, pagination, throttle, permission va sana parseri.

### 7.1 Abstract base modellar (`common/models.py`)

Uchta abstract model ierarxiyasi mavjud:

```python
class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)   # yaratilgan vaqt (faqat bir marta)
    updated_at = models.DateTimeField(auto_now=True)       # har save'da yangilanadi

    class Meta:
        abstract = True
        ordering = ("-created_at",)                        # default tartib: eng yangi birinchi


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class BaseModel(UUIDModel, TimeStampedModel):
    class Meta:
        abstract = True
```

- **`TimeStampedModel`** — `created_at` (yaratilganda bir marta o'rnatiladi) va `updated_at` (har saqlashda yangilanadi). Default tartiblash `-created_at` (eng yangisi birinchi).
- **`UUIDModel`** — `id` maydoni UUIDv4 primary key, `editable=False` (qo'lda o'zgartirib bo'lmaydi).
- **`BaseModel`** = `UUIDModel` + `TimeStampedModel`. Loyihaning har bir domen modeli shu `BaseModel` dan meros oladi, demak har bir model UUID PK va ikkita timestamp maydoniga ega bo'ladi.

Misol — `CatalogItem` va boshqa modellar shunchaki `BaseModel(...)` dan meros oladi va avtomatik UUID + timestamplar oladi:

```python
# catalog/models.py (soddalashtirilgan)
from common.models import BaseModel

class CatalogItem(BaseModel):   # id (UUID), created_at, updated_at avtomatik keladi
    type = models.CharField(...)
    name = models.CharField(...)
    ...
```

### 7.2 `ServiceToken` modeli (`common/models.py:27`)

Servislar (masalan Bot 2) backendga autentifikatsiya qilishi uchun DB-asosli xeshlangan kredensial:

```python
class ServiceToken(BaseModel):
    class Service(models.TextChoices):
        BOT2 = "bot2", "Bot2"
        DASHBOARD = "dashboard", "Dashboard"
        OTHER = "other", "Other"

    service_name = models.CharField(max_length=50, choices=Service.choices)
    token_hash = models.CharField(max_length=64, unique=True)   # SHA-256 xesh (64 hex belgi)
    scope = models.CharField(max_length=100, default="default")
    expires_at = models.DateTimeField(null=True, blank=True)    # ixtiyoriy muddat
    last_used_at = models.DateTimeField(null=True, blank=True)  # oxirgi ishlatilgan vaqt
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ("service_name", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["service_name", "scope"],
                condition=models.Q(is_active=True),
                name="active_service_scope_unique",   # bir (service, scope) uchun faqat 1 aktiv token
            )
        ]
```

Muhim jihatlar:
- **Faqat xesh saqlanadi.** Asl (raw) token hech qachon DB'ga yozilmaydi — faqat uning SHA-256 xeshi (`token_hash`). Asl tokenni faqat Bot 2 o'z `.env` faylida saqlaydi.
- **Partial unique constraint:** har bir `(service_name, scope)` juftligi uchun faqat bitta `is_active=True` token bo'lishi mumkin. Bu eski tokenni `is_active=False` qilib, yangisini yaratishga imkon beradi.
- Modellar UUID PK va timestamplar oladi, chunki `BaseModel` dan meros olgan.

### 7.3 Xato envelope (`common/exceptions.py`)

Butun API yagona, bashorat qilinadigan xato formatini qaytaradi:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation error",
    "details": { "name": ["This field is required."] }
  }
}
```

`details` ixtiyoriy — faqat mavjud bo'lganda qo'shiladi.

#### `APIError` — maxsus xato sinfi

```python
class APIError(exceptions.APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "BAD_REQUEST"
    default_detail = _("Bad request")

    def __init__(self, code=None, detail=None, status_code=None):
        if code:
            self.default_code = code
        if status_code:
            self.status_code = status_code
        super().__init__(detail=detail or self.default_detail, code=self.default_code)
```

`APIError` view'larda maxsus biznes xatolarni chiqarish uchun ishlatiladi. Misol (service token tekshiruvidan):

```python
raise APIError(code="SERVICE_TOKEN_REQUIRED",
               detail="X-SERVICE-TOKEN header is required.",
               status_code=403)
```

Bu chaqiruv quyidagi javobni hosil qiladi:

```json
{ "error": { "code": "SERVICE_TOKEN_REQUIRED", "message": "X-SERVICE-TOKEN header is required." } }
```

#### `build_error_response` — yagona shakllantiruvchi

```python
def build_error_response(code, message, status_code, details=None) -> Response:
    payload = {"error": {"code": code, "message": message}}
    if details:
        payload["error"]["details"] = details
    return Response(payload, status=status_code)
```

Bu yordamchi exception handler'da ham, ba'zi view'larda to'g'ridan-to'g'ri ham ishlatiladi (xato javobini qo'lda yasash uchun).

#### `custom_exception_handler` — exception → envelope

`settings.py` da `EXCEPTION_HANDLER` sifatida ro'yxatdan o'tgan. Mantiqi:

```python
def custom_exception_handler(exc, context) -> Response:
    response = drf_exception_handler(exc, context)

    if isinstance(exc, APIError):
        # APIError → o'z kodi (katta harf) + status
        return build_error_response(str(exc.default_code).upper(), exc.detail,
                                    getattr(exc, "status_code", 400))

    if response is None:
        # DRF tomonidan ishlov berilmagan → logga yoz + 500 SERVER_ERROR
        logger.exception("Unhandled exception in API", exc_info=exc)
        return build_error_response("SERVER_ERROR", "Internal server error", 500)

    code = getattr(exc, "default_code", None) or "error"
    message = response.data if response.data else str(exc)

    if isinstance(exc, exceptions.ValidationError):
        return build_error_response(code.upper(), "Validation error",
                                    response.status_code, details=response.data)

    if isinstance(exc, exceptions.PermissionDenied):
        return build_error_response("FORBIDDEN", "You do not have permission ...",
                                    response.status_code)

    if isinstance(exc, exceptions.NotAuthenticated):
        return build_error_response("NOT_AUTHENTICATED", "Authentication credentials ...",
                                    response.status_code)

    if isinstance(exc, exceptions.NotFound):
        return build_error_response("NOT_FOUND", "Resource not found.", response.status_code)

    return build_error_response(str(code).upper(), message, response.status_code)
```

Xato turlari va ularning standart kodlari:

| Exception | `code` | HTTP status |
|-----------|--------|-------------|
| `APIError(code="X", status_code=N)` | `X` (katta harf) | `N` (yoki 400) |
| `ValidationError` | `<default_code>` katta harf (odatda `INVALID`) + `details` | 400 |
| `PermissionDenied` | `FORBIDDEN` | 403 |
| `NotAuthenticated` | `NOT_AUTHENTICATED` | 401 |
| `NotFound` | `NOT_FOUND` | 404 |
| Ishlov berilmagan (`response is None`) | `SERVER_ERROR` (logga ham yoziladi) | 500 |
| Boshqa DRF xatolari | `<default_code>` katta harf | DRF status'i |

### 7.4 Pagination (`common/pagination.py`)

```python
class DefaultPagination(PageNumberPagination):
    page_size_query_param = "page_size"
    max_page_size = 500
```

- Sahifa-raqam (page-number) asosida pagination.
- Standart sahifa hajmi 25 (`settings.py:PAGE_SIZE`).
- Mijoz `?page_size=` query bilan hajmni o'zgartirishi mumkin, lekin maksimum 500.

DRF list javobi formati:

```json
{
  "count": 137,
  "next": "http://.../catalog/items/?page=2",
  "previous": null,
  "results": [ /* ... */ ]
}
```

> Dashboard `page_size=1` (faqat `count` olish uchun KPI kartochkalarda) va `page_size=500` (Excel eksport) kabi hiylalardan foydalanadi. Batafsil: [09-dashboard.md](09-dashboard.md).

### 7.5 Throttle (`common/throttles.py`)

```python
class LoginRateThrottle(AnonRateThrottle):
    scope = "login"
```

`AnonRateThrottle` dan meros olgan va `"login"` scope'ini ishlatadi. Tezligi `settings.py` dagi `DEFAULT_THROTTLE_RATES["login"] = "10/minute"` bilan belgilanadi. Bu klass faqat `LoginView` ga ulanadi (login brute-force hujumini cheklash uchun).

> Diqqat: `RefreshView` va `submit_survey` da maxsus throttle yo'q. `submit_survey` faqat service token bilan himoyalangan, rate limit yo'q.

### 7.6 Service-token autentifikatsiya (`common/auth.py`)

Servislar (Bot 2) backendga autentifikatsiya qilishi uchun kalit funksiya. Bot asl tokenni `X-SERVICE-TOKEN` sarlavhasida yuboradi, backend uni xeshlab solishtiradi.

```python
def _hashed(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _verify_db_token(incoming_hash, service_name) -> bool:
    now = timezone.now()
    qs = ServiceToken.objects.filter(token_hash=incoming_hash, is_active=True) \
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))   # muddati o'tmagan
    if service_name:
        qs = qs.filter(service_name=service_name)
    token = qs.order_by("-created_at").first()
    if not token:
        return False
    # last_used_at ni 60 soniyada bir marta yangilash (DB yozuvini kamaytirish)
    if not token.last_used_at or (now - token.last_used_at).total_seconds() > 60:
        ServiceToken.objects.filter(pk=token.pk).update(last_used_at=now)
    return True


def verify_service_token(raw_token, service_name=None) -> None:
    if not raw_token:
        raise APIError(code="SERVICE_TOKEN_REQUIRED",
                       detail="X-SERVICE-TOKEN header is required.", status_code=403)

    incoming_hash = _hashed(raw_token)

    # 1) Avval DB'dagi ServiceToken'ni tekshirish
    try:
        if _verify_db_token(incoming_hash, service_name):
            return
    except Exception:
        # DB mavjud bo'lmasligi mumkin (masalan testlarda) → settings tokenlarga o'tish
        pass

    # 2) Fallback: settings.SERVICE_TOKENS dagi env xeshlar
    hashes = []
    if service_name:
        hash_value = settings.SERVICE_TOKENS.get(service_name)
        if hash_value:
            hashes.append(hash_value)
    else:
        hashes = [value for value in settings.SERVICE_TOKENS.values() if value]

    if not hashes:
        raise exceptions.PermissionDenied("Service tokens are not configured.")

    for expected in hashes:
        if expected and hmac.compare_digest(incoming_hash, expected):   # konstanta-vaqt solishtiruv
            return

    raise APIError(code="SERVICE_TOKEN_INVALID", detail="Invalid service token.", status_code=403)
```

Tekshiruv oqimi:

```
X-SERVICE-TOKEN: <raw>
   │
   ▼
Bo'shmi? ──► ha ──► 403 SERVICE_TOKEN_REQUIRED
   │ yo'q
   ▼
SHA-256 xesh hisoblash
   │
   ▼
1) DB ServiceToken qidirish (is_active, muddati o'tmagan, service_name)
   ├── topildi → OK (last_used_at yangilash) ✓
   └── topilmadi/DB xato → 2) ga o'tish
   │
   ▼
2) settings.SERVICE_TOKENS dagi env xesh bilan solishtirish (hmac.compare_digest)
   ├── hech token sozlanmagan → 403 PermissionDenied "Service tokens are not configured"
   ├── mos keldi → OK ✓
   └── mos kelmadi → 403 SERVICE_TOKEN_INVALID
```

Muhim jihatlar:
- **Konstanta-vaqt solishtiruv:** `hmac.compare_digest` timing-attack'larni oldini oladi.
- **DB → env fallback:** DB istisno (`except Exception`) yuz bersa, jimgina env tokenlarga o'tadi. Bu testlar uchun qulay, lekin DB nosozliklarini yashirib qo'yishi mumkin.
- Bu funksiya ikki joyda chaqiriladi: `common.permissions.ServiceTokenPermission` (deklarativ) va `bot2.views.submit_survey` (to'g'ridan-to'g'ri, `service_name='bot2'`).

Service token konfiguratsiyasi va Bot 2 bilan ishlash: [08-telegram-bot.md](08-telegram-bot.md).

### 7.7 Permission klasslari (`common/permissions.py`)

To'rtta permission klassi mavjud:

```python
class IsAdminUserRole(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == User.Role.ADMIN)


class IsViewerOrAdminReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:                  # GET/HEAD/OPTIONS
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == User.Role.ADMIN)


class IsAdminCatalogWriter(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_authenticated
                    and request.user.role == User.Role.ADMIN)


class ServiceTokenPermission(BasePermission):
    message = "Service token is required."

    def has_permission(self, request, view):
        service_name = getattr(view, "service_name", None)
        verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name=service_name)
        return True
```

| Klass | Read (SAFE_METHODS) | Write (POST/PUT/PATCH/DELETE) |
|-------|---------------------|-------------------------------|
| `IsAdminUserRole` | Faqat ADMIN | Faqat ADMIN |
| `IsViewerOrAdminReadOnly` | Har qanday autentifikatsiyalangan (admin/viewer) | Faqat ADMIN |
| `IsAdminCatalogWriter` | Har qanday autentifikatsiyalangan | Faqat ADMIN |
| `ServiceTokenPermission` | — (`verify_service_token` orqali, view'ning `service_name` atributini o'qiydi) | — |

> Diqqat (kod taqlidi): `IsViewerOrAdminReadOnly` va `IsAdminCatalogWriter` **bayt-ba-bayt bir xil**. Ular ikkita alohida nom bilan mavjud, lekin mantiqlari aynan teng — kelajakda biri olib tashlanishi yoki birlashtirilishi mumkin.

`ServiceTokenPermission` view'dan `service_name` atributini o'qiydi va `verify_service_token` ni chaqiradi. Agar token noto'g'ri bo'lsa, funksiya `APIError`/`PermissionDenied` chiqaradi (`True` qaytmaydi).

Rollar va `User.Role` enum batafsil: [03-autentifikatsiya.md](03-autentifikatsiya.md).

### 7.8 ISO sana parseri (`common/time.py`)

Analitika va `?from`/`?to` filtrlarida ISO 8601 sana-vaqtni xavfsiz pars qilish uchun:

```python
def parse_iso_datetime(value: str):
    dt = parse_datetime(value)              # Django'ning standart parseri
    if dt is None:
        try:
            dt = datetime.fromisoformat(value)   # zaxira: Python ISO format
        except Exception:
            return None                     # pars qilib bo'lmadi → None
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone=timezone.utc)   # naive → UTC aware
    return dt
```

- Avval Django `parse_datetime`, keyin `datetime.fromisoformat` zaxira sifatida.
- Agar ikkalasi ham muvaffaqiyatsiz bo'lsa, `None` qaytaradi (chaqiruvchi tomon xatoni o'zi hal qiladi, masalan `TIME_RANGE_REQUIRED`).
- Timezone'siz (naive) sanani avtomatik UTC ga aylantiradi — `USE_TZ = True` bilan mos.

Misol — `bot2/surveys/?from=...&to=...` filtridagi yoki analitika endpointlaridagi vaqt oralig'ini pars qilishda ishlatiladi. Analitikadagi qo'llanilishi: [06-analitika-va-audit.md](06-analitika-va-audit.md).

---

## 8. Kirish nuqtalari (entrypoints)

| Fayl | Vazifasi |
|------|----------|
| `server/manage.py` | CLI buyruqlar (`migrate`, `runserver`, `seed_*`, `create_admin` va h.k.). `DJANGO_SETTINGS_MODULE = "crm_server.settings"` o'rnatadi. |
| `server/crm_server/wsgi.py` | WSGI kirish nuqtasi. `application = get_wsgi_application()`. Gunicorn shuni ishlatadi (`gunicorn crm_server.wsgi`). |
| `server/crm_server/asgi.py` | ASGI kirish nuqtasi. `application = get_asgi_application()` — oddiy, Channels/WebSocket yo'q (`ASGI_APPLICATION` sozlangan bo'lsa-da, real-time hech narsa ulanmagan). |

Gunicorn, entrypoint.sh va deploy: [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md).

---

## 9. Migratsiyalar haqida eslatma

`common/migrations/` ichida ikkita migratsiya bor:
- `0001_initial.py` — `ServiceToken` modelini yaratadi.
- `0002_drop_bot1_tables.py` — eskirgan Bot 1 jadvallarini tushiradi (refaktoring natijasi).

Bu `common` app'i Bot 1 tarixini ham o'z ichiga olganini ko'rsatadi, lekin hozir faqat `ServiceToken` modeli tirik.

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — Autentifikatsiya: User, JWT, rollar, service token
- [04-katalog.md](04-katalog.md) — Katalog (CatalogItem/CatalogRelation, dasturlar)
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovnoma domeni (roster, student, survey, enrollment)
- [06-analitika-va-audit.md](06-analitika-va-audit.md) — Analitika va Audit
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma (barcha endpointlar)
- [08-telegram-bot.md](08-telegram-bot.md) — Telegram bot servisi va FSM oqimi
- [09-dashboard.md](09-dashboard.md) — Next.js boshqaruv paneli
- [10-malumotlar-modeli.md](10-malumotlar-modeli.md) — Ma'lumotlar modeli / ER diagramma
- [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md) — O'rnatish, deploy, gunicorn, seed komandalar
- [12-testlar.md](12-testlar.md) — Test qoplamasi
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari (workflows)
