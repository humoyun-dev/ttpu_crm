# Umumiy ko'rinish va arxitektura

Bu hujjat TTPU CRM loyihasining umumiy ko'rinishini beradi: tizim nima qiladi, nima uchun kerak, kim foydalanadi va u qanday qatlamlardan tashkil topgan. Bu — butun `docs/` to'plamining **kirish nuqtasi**. Agar siz loyihaga yangi qo'shilgan dasturchi bo'lsangiz, avval shu hujjatni o'qing, so'ng quyidagi bo'limlarda keltirilgan chuqurroq hujjatlarga o'ting.

> **Muhim eslatma (hujjatlar drift):** Loyihaning eski hujjatlari (`PROJECT_DOCUMENTATION.md`, ildizdagi `README.md`, `SERVICE_TOKEN_QOLLANMA.md`, deploy qo'llanmalar) hozir mavjud bo'lmagan **"Bot 1"** (`server/bot1`, `/api/v1/bot1/*`, `SERVICE_TOKEN_BOT1_HASH`) haqida yozadi. Bot 1 `98dd68c` commitida olib tashlangan (`server/common/migrations/0002_drop_bot1_tables.py`). **Hozirgi tizim faqat backend + Bot 2 + dashboard'dan iborat.** Eski hujjatlardagi Bot 1 ga oid har qanday ma'lumotni e'tiborsiz qoldiring.

---

## 1. TTPU CRM nima?

**TTPU CRM** — Toshkentdagi Turin Politexnika Universiteti (Turin Polytechnic University in Tashkent, TTPU) uchun ishlab chiqilgan ichki Marketing/CRM tizimi.

Uning hozirgi vazifasi:

- **Talaba va bitiruvchilarning so'rovnoma (survey) ma'lumotlarini** Telegram bot orqali **yig'ish**;
- bu ma'lumotlarni markaziy backend'da **saqlash**;
- universitet xodimlariga ularni **ko'rish, tahrirlash va tahlil qilish** imkonini berish.

So'rovnoma asosan talabaning ish bilan bandligi (employment status), profil ma'lumotlari (region, dastur, kurs yili, jins, telefon) va rozilik (consent) savollarini qamrab oladi. Yig'ilgan ma'lumot keyinchalik **qoplama (coverage) analitikasi** uchun ishlatiladi — masalan, qaysi dastur / kurs yili bo'yicha qancha talaba javob berganini hisoblash.

---

## 2. Nima uchun kerak va kim foydalanadi?

Tizim uchta turdagi foydalanuvchini va ularning ehtiyojlarini bog'laydi:

| Foydalanuvchi | Nima qiladi | Qaysi komponent orqali | Qanday autentifikatsiya |
|---|---|---|---|
| **Talabalar / bitiruvchilar** | So'rovnoma savollariga javob beradi (bandlik, profil, rozilik) | Telegram bot (Bot 2) | Yo'q (Telegram identifikatsiyasi) |
| **CRM xodimlari** (admin va viewer) | So'rovlarni ko'radi/tahrirlaydi, katalogni boshqaradi, roster/enrollment yuritadi, analitikani o'qiydi | Next.js dashboard | JWT (login orqali) |
| **Bot servisi** (mashina mijozi) | Yig'ilgan so'rovnomani backend'ga yuboradi, katalogni o'qiydi | bot2_service → backend | Service token (`X-SERVICE-TOKEN`) + katalog o'qish uchun JWT |

Asosiy g'oya: **talaba bilan bevosita ishlash Telegram'da** (qulay, hammada bor), **xodimlar bilan ishlash brauzerdagi dashboard'da**, **ma'lumotlar esa bitta markazda — Django backend'da** saqlanadi. Bot inson emas, mashina sifatida backend'ga ulanadi va shuning uchun parol/JWT o'rniga **service token**dan foydalanadi.

---

## 3. Uch qatlamli arxitektura

Loyiha uchta mustaqil ishga tushiriladigan komponentdan (servisdan) iborat, ular bitta backend atrofida birlashadi:

| Qatlam | Texnologiya | Papka | Rol |
|---|---|---|---|
| **Backend** | Django 5 + Django REST Framework | `server/` | Tizimning yagona manbai (system of record). `/api/v1` ostida versiyalangan REST API, barcha modellar, autentifikatsiya, analitika agregatsiyasi. |
| **Dashboard** | Next.js 16 (App Router) + React 19 + TypeScript | `dashboard/` | Xodimlar uchun SPA (interfeys to'liq o'zbekcha), backend bilan JWT orqali ishlaydi. |
| **Telegram bot** | aiogram v3 (Python) | `bot2_service/` | Mustaqil servis: FSM asosidagi ko'p tilli so'rovnoma, natijalarni backend'ga uzatadi. |
| **Ma'lumotlar bazasi** | PostgreSQL 15 (yoki SQLite fallback) | — | Asosiy saqlovchi. `USE_SQLITE` env orqali boshqariladi. |

Diqqat: **ma'lumotlar bazasi sukut bo'yicha SQLite'dir.** `server/crm_server/settings.py:96` da `if os.getenv("USE_SQLITE", "1") == "1"` sharti bor — ya'ni `USE_SQLITE` o'rnatilmasa ham SQLite ishlaydi. PostgreSQL faqat `USE_SQLITE` `"1"` dan farq qilganda yoqiladi.

---

## 4. Arxitektura diagrammasi

Quyidagi diagramma komponentlar orasidagi bog'lanishlar va autentifikatsiya oqimlarini (JWT va `X-SERVICE-TOKEN`) ko'rsatadi.

```
                         Telegram foydalanuvchilari (talabalar / bitiruvchilar)
                                      │
                                      │  (Telegram Bot API, long-poll getUpdates)
                                      ▼
              ┌────────────────────────────────────────────────┐
              │   bot2_service  (aiogram v3, mustaqil servis)   │
              │   src/bot2_service/                             │
              │   - FSM so'rovnoma (states.py)                  │
              │   - CatalogCache (900s TTL, in-memory)          │
              │   - SingleInstanceLock (fcntl, host-local)      │
              └───────────────┬───────────────┬────────────────┘
                              │               │
        katalog o'qish (JWT)  │               │  so'rovnomani yuborish (X-SERVICE-TOKEN)
   GET /catalog/items?type=…  │               │  POST /bot2/surveys/submit
   Authorization: Bearer <jwt>│               │  header: X-SERVICE-TOKEN: <raw>
                              ▼               ▼
   ┌────────────────────────────────────────────────────────────────────┐
   │              Django 5 + DRF backend  (server/, /api/v1)             │
   │                                                                     │
   │   crm_server/  (settings.py, urls.py, wsgi.py/asgi.py)             │
   │   app'lar: common · authn · catalog · bot2 · audit · analytics     │
   │                                                                     │
   │   Kiruvchi autentifikatsiya:                                       │
   │   - Insonlar: CookieJWTAuthentication (Bearer header → cookie)     │
   │   - Botlar:   verify_service_token() → sha256 vs ServiceToken/ENV  │
   │                                                                     │
   │   custom_exception_handler → {error:{code,message,details}}        │
   └─────────────────┬───────────────────────────────────┬─────────────┘
                     │                                     │
   JWT (access+refresh cookie + body)│                     │  Gunicorn (gthread)
   GET/POST /api/v1/auth, /catalog,  │                     │  127.0.0.1:8000
   /bot2, /analytics                 │                     ▼
                     ▼                            ┌───────────────────┐
   ┌──────────────────────────────┐              │   PostgreSQL 15    │
   │  dashboard (Next.js 16 SPA)  │              │  (SQLite fallback  │
   │  - JWT localStorage'da       │              │   USE_SQLITE orqali│
   │  - proxy.ts cookie gate      │              │   — default!)      │
   │  - apiFetch 401→refresh→retry│              └───────────────────┘
   │  Xodimlar (admin / viewer)   │
   └──────────────────────────────┘
            ▲
            │ brauzer (HTTPS, Nginx orqali)
        CRM xodimlari
```

### 4.1 Ikkita autentifikatsiya oqimi

Tizimda ikki xil ishonch (trust) mexanizmi bor — ularni aralashtirib yubormaslik muhim.

**(A) JWT — insonlar uchun (xodimlar va katalog o'qishda bot).**

- Xodim dashboard'da `POST /api/v1/auth/login` orqali login qiladi. Backend `access` va `refresh` tokenlarni **ham JSON tanasida qaytaradi, ham HttpOnly cookie sifatida o'rnatadi**.
- Keyingi so'rovlarda dashboard `Authorization: Bearer <access>` sarlavhasini yuboradi (token `localStorage`dan olinadi).
- Backend `authn/authentication.py:CookieJWTAuthentication` orqali avval `Bearer` sarlavhasini, u yaroqsiz bo'lsa `access_token` cookie'sini sinab ko'radi.
- Access tokeni qisqa umrli (sukut ~15 daqiqa), refresh ~7 kun. 401 bo'lganda `POST /api/v1/auth/refresh` orqali yangilanadi.

**(B) Service token — mashina mijozlari uchun (bot so'rovnoma yuborganda).**

- Bot o'zining `.env` faylida **xom (raw)** tokenni saqlaydi (`SERVICE_TOKEN`).
- Backend faqat tokenning **SHA-256 hash**ini biladi — DB'dagi `ServiceToken.token_hash` ustunida yoki `settings.SERVICE_TOKENS["bot2"]` (env `SERVICE_TOKEN_BOT2_HASH`) orqali.
- Har bir `POST /bot2/surveys/submit` so'rovida bot `X-SERVICE-TOKEN: <raw>` sarlavhasini yuboradi.
- `server/common/auth.py:verify_service_token()` xom tokenni hash qilib, avval DB yozuvi bilan, so'ng `settings.SERVICE_TOKENS` bilan **konstant-vaqtli** (`hmac.compare_digest`) solishtiradi.
- Token yo'q bo'lsa → `403 SERVICE_TOKEN_REQUIRED`; mos kelmasa → `403 SERVICE_TOKEN_INVALID`.

Eslatma: bot katalogni **JWT bilan** o'qiydi (login qilib, `Bearer` token bilan `GET /catalog/items`), lekin so'rovnomani **service token bilan** yuboradi. Ya'ni bot ikkala mexanizmni ham ishlatadi.

---

## 5. Repozitoriya tuzilishi

Loyiha ildizi (`/Users/mac/projects/ttpu_crm/`) quyidagicha tashkil topgan:

```
ttpu_crm/
├── server/                 # Django 5 + DRF backend (system of record)
│   ├── crm_server/         # Loyiha konfiguratsiyasi
│   │   ├── settings.py     #   env-driven sozlamalar
│   │   ├── urls.py         #   ildiz URLConf, DRF router, /api/v1
│   │   ├── wsgi.py / asgi.py
│   ├── common/             # Umumiy: base modellar, xato envelope, service-token, permissions, ServiceToken
│   ├── authn/              # User, JWT cookie auth, login/refresh/logout/me, RevokedToken
│   ├── catalog/            # CatalogItem / CatalogRelation, Programs API, seed komandalar
│   ├── bot2/               # So'rovnoma domeni: StudentRoster, Bot2Student, Bot2SurveyResponse, ProgramEnrollment
│   ├── analytics/          # View-only analitika endpointlari (modelsiz)
│   ├── audit/              # AuditLog (append-only) + log_audit()
│   ├── tests/              # pytest + pytest-django
│   ├── manage.py
│   ├── gunicorn.conf.py    # Gunicorn (gthread, 127.0.0.1:8000)
│   ├── Dockerfile / entrypoint.sh / docker-compose.yml
│   └── pyproject.toml      # Poetry bog'liqliklar
│
├── dashboard/              # Next.js 16 admin SPA (interfeys o'zbekcha)
│   ├── app/                # App Router sahifalari (/login, /dashboard/*)
│   ├── components/         # UI komponentlar (Radix / shadcn)
│   ├── lib/                # api.ts, auth-context.tsx, constants.ts, hooks/
│   ├── proxy.ts            # cookie gate middleware
│   ├── next.config.ts      # standalone build, security headers
│   └── package.json
│
├── bot2_service/           # aiogram v3 Telegram bot (mustaqil servis)
│   ├── src/bot2_service/
│   │   ├── main.py         #   ishga tushirish nuqtasi
│   │   ├── handlers.py     #   FSM so'rovnoma handlerlari
│   │   ├── states.py       #   FSM holatlari
│   │   ├── keyboards.py    #   inline tugmalar
│   │   ├── api.py          #   backend bilan HTTP mijoz
│   │   ├── catalog_cache.py#   in-memory katalog cache (900s TTL)
│   │   ├── config.py       #   env konfiguratsiya
│   │   ├── texts.py        #   ko'p tilli matnlar (uz/ru/en)
│   │   └── single_instance.py # fcntl lock (bitta nusxa)
│   ├── data/
│   └── pyproject.toml
│
├── docs/                   # SHU hujjatlar to'plami
├── README.md               # (qisqa, production checklist)
├── DEPLOYMENT.md           # systemd + Nginx deploy (Bot 1 qismi eskirgan)
├── DEPLOYMENT_PM2_SUPERVISOR.md
├── PROJECT_DOCUMENTATION.md# (eskirgan — Bot 1 ni e'tiborsiz qoldiring)
└── docker-compose.yml      # ildizdagi compose
```

### 5.1 Backend app'lari qisqacha

`server/crm_server/settings.py:42-48` dagi `INSTALLED_APPS` ichida loyihaning o'z app'lari quyidagi tartibda ulangan: `common`, `authn`, `catalog`, `bot2`, `audit`, `analytics`.

| App | Vazifa |
|---|---|
| `common/` | Umumiy infratuzilma: abstrakt base modellar (`TimeStampedModel`, `UUIDModel`, `BaseModel`), xato envelope, service-token autentifikatsiya, paginatsiya, throttle, rol permissionlar, `ServiceToken` modeli. |
| `authn/` | Email asosidagi maxsus `User` modeli, JWT cookie auth (`CookieJWTAuthentication`), `login`/`refresh`/`logout`/`me`, `RevokedToken` denylist, `create_admin`/`cleanup_tokens` komandalar. |
| `catalog/` | Polimorfik `CatalogItem` + `CatalogRelation` ma'lumotnoma (programs, directions, subjects, tracks, regions). CRUD viewsetlar + read-only Programs API + seed komandalar. |
| `bot2/` | So'rovnoma domeni: `StudentRoster`, `Bot2Student`, `Bot2SurveyResponse`, `ProgramEnrollment`; roster import + survey submit endpointlari. |
| `analytics/` | **Modelsiz, faqat view.** 6 ta `@api_view` endpoint Bot 2 qoplama analitikasini hisoblaydi (`models.py` va `admin.py` bo'sh). |
| `audit/` | Append-only `AuditLog` + `log_audit()` utiliti (PII redaksiyasi bilan). Loglash **qo'lda/ixtiyoriy** — har bir yozuv yo'lida alohida chaqiriladi. |

`AUTH_USER_MODEL = "authn.User"` (`settings.py:122`).

---

## 6. Texnologiyalar steki

Quyidagi versiyalar haqiqiy `pyproject.toml` / `package.json` fayllaridan tasdiqlangan.

### Backend (`server/pyproject.toml`)

| Texnologiya | Versiya | Maqsad |
|---|---|---|
| Python | ^3.12 | Til |
| Django | ^5.0 | Web framework |
| Django REST Framework | ^3.16 | REST API |
| djangorestframework-simplejwt | ^5.5 | JWT autentifikatsiya |
| drf-spectacular | ^0.29 | OpenAPI schema / Swagger UI |
| django-cors-headers | ^4.9 | CORS |
| django-filter | ^25.2 | Query filtrlash |
| psycopg2-binary | ^2.9 | PostgreSQL drayveri |
| whitenoise | — | Statik fayllar (settings'da) |
| gunicorn | — | WSGI server |
| pytest / pytest-django | ^4.8 | Testlar |

### Dashboard (`dashboard/package.json`)

| Texnologiya | Versiya | Maqsad |
|---|---|---|
| Next.js | 16.1.3 | App Router SPA (standalone, turbopack) |
| React | 19.2.3 | UI |
| TypeScript | ^5 | Til |
| Tailwind CSS | ^4 | Stillar |
| Radix UI / shadcn | — | UI komponentlar |
| sonner | ^2.0 | Toast bildirishnomalar |
| xlsx | ^0.18 | Excel eksport |
| date-fns, lucide, next-themes | — | Yordamchi kutubxonalar |

### Telegram bot (`bot2_service/pyproject.toml`)

| Texnologiya | Versiya | Maqsad |
|---|---|---|
| Python | ^3.11 | Til |
| aiogram | ^3.12 | Telegram Bot framework (FSM) |
| python-dotenv | ^1.2 | env konfiguratsiya |

---

## 7. So'rov hayot tsikli (qisqacha)

Tizimning ikkita asosiy oqimini tasavvur qilish uchun:

**Talaba so'rovnomani to'ldiradi:**

```
Talaba → Telegram → bot2_service (FSM so'rovnoma)
   ├─ bot katalogni o'qiydi:  GET /api/v1/catalog/items?type=direction  (JWT)
   │                          GET /api/v1/catalog/items?type=region     (JWT)
   └─ bot natijani yuboradi:  POST /api/v1/bot2/surveys/submit          (X-SERVICE-TOKEN)
                                  ↓
                         backend: roster bo'yicha student/program ni tekshiradi,
                         Bot2Student va Bot2SurveyResponse yaratadi/yangilaydi
```

**Xodim ma'lumotni ko'radi:**

```
Xodim → brauzer → dashboard (Next.js)
   ├─ login:  POST /api/v1/auth/login   → access+refresh (cookie + body)
   ├─ ro'yxat: GET /api/v1/bot2/surveys  (Bearer JWT)
   ├─ analitika: GET /api/v1/analytics/bot2/course-year-coverage  (Bearer JWT)
   └─ 401 bo'lsa: POST /api/v1/auth/refresh → yangi access → so'rovni qayta urinish
```

To'liq, end-to-end ish jarayonlari uchun [13-ish-jarayonlari.md](13-ish-jarayonlari.md) ga qarang.

---

## 8. Asosiy kirish nuqtalari va URL'lar

`server/crm_server/urls.py` dagi ildiz URLConf quyidagi yo'llarni belgilaydi:

- `admin/` — Django admin paneli
- `api/schema/` — OpenAPI schema (`SpectacularAPIView`)
- `api/docs/` — Swagger UI (`SpectacularSwaggerView`)
- `api/v1/` ostida:
  - `healthz` — sog'liqni tekshirish (`{"ok": true}`)
  - `auth/login`, `auth/refresh`, `auth/logout`, `auth/me`
  - `catalog/items`, `catalog/relations`, `catalog/programs` (DRF router)
  - `bot2/roster`, `bot2/students`, `bot2/surveys`, `bot2/enrollments` (DRF router)
  - `admin/roster/import` — roster import (faqat ADMIN)
  - `bot2/surveys/submit` — so'rovnoma yuborish (service token bilan)
  - `analytics/bot2/*` — 6 ta analitika endpointi

Backend sukut bo'yicha **Gunicorn** orqali `127.0.0.1:8000` da ishlaydi (`server/gunicorn.conf.py`), Nginx esa uni tashqi domenga proksilaydi. To'liq endpoint ro'yxati uchun [07-api-malumotnoma.md](07-api-malumotnoma.md) ga qarang.

---

## 9. Keyingi qadamlar (qaysi hujjatni qachon o'qish)

- Backend tuzilishini chuqur tushunmoqchimisiz → [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md)
- Login, JWT, rollar, service token qanday ishlaydi → [03-autentifikatsiya.md](03-autentifikatsiya.md)
- Talaba bilan ishlaydigan botni ko'rmoqchimisiz → [08-telegram-bot.md](08-telegram-bot.md)
- Xodimlar interfeysi → [09-dashboard.md](09-dashboard.md)
- Ma'lumotlar qanday saqlanadi → [10-malumotlar-modeli.md](10-malumotlar-modeli.md)

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) — Backend tuzilishi (common, sozlamalar, asosiy modellar)
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
