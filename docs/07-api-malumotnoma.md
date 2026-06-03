# API Ma'lumotnoma

Bu hujjat — TTPU CRM backend'ining BARCHA HTTP endpointlari uchun yagona, amaliy ma'lumotnoma. Har bir endpoint uchun HTTP metod, to'liq yo'l, tavsif, autentifikatsiya talabi, permission (kim chaqira oladi), kirish parametrlari/body, javob misoli va mumkin bo'lgan xato kodlari keltirilgan. Hujjat frontend (dashboard) va Telegram bot dasturchilari uchun mo'ljallangan.

Barcha endpointlar `server/crm_server/urls.py` faylida ro'yxatdan o'tgan. Endpoint kodi quyidagi fayllarda yashaydi:
- Auth: `server/authn/views.py`
- Catalog: `server/catalog/views.py`
- Bot2: `server/bot2/views.py`
- Analytics: `server/analytics/views.py`

> Eslatma: butun loyihada faqat **backend + Bot 2 + dashboard** mavjud. "Bot 1", `server/bot1`, `/api/v1/bot1`, `SERVICE_TOKEN_BOT1_HASH` kabi narsalar ESKIRGAN va kodda yo'q.

---

## 1. Asosiy tushunchalar

### 1.1. Base URL va versiyalash

Barcha biznes endpointlari `/api/v1/` prefiksi ostida joylashgan. Faqat ba'zi xizmat endpointlari (`/admin/`, `/api/schema/`, `/api/docs/`) prefiksdan tashqarida turadi.

```
https://<host>/api/v1/...        ← biznes API
https://<host>/admin/            ← Django admin
https://<host>/api/schema/       ← OpenAPI schema (YAML/JSON)
https://<host>/api/docs/         ← Swagger UI
```

URL'larning oxirida (trailing) slash yo'q — masalan `/api/v1/auth/login` (slashsiz). DRF router endpointlarida esa slash bilan ishlatiladi (`/api/v1/catalog/items/`).

### 1.2. Autentifikatsiya turlari

Loyihada ikkita autentifikatsiya mexanizmi bor:

| Tur | Kim ishlatadi | Qanday yuboriladi |
|-----|----------------|--------------------|
| **JWT (cookie yoki header)** | Dashboard foydalanuvchilari | `Cookie: access_token=<jwt>` yoki `Authorization: Bearer <jwt>` |
| **Service token** | Telegram bot (bot2) | `X-SERVICE-TOKEN: <token>` HTTP header |

**JWT — cookie yoki header.** Autentifikatsiya klassi `server/authn/authentication.py:CookieJWTAuthentication`. U avval `Authorization: Bearer ...` header'ini tekshiradi; agar bo'lmasa yoki yaroqsiz bo'lsa, `access_token` cookie'siga o'tadi. Bu dashboard login qilganda cookie o'rnatilishini, lekin header orqali ham ishlash mumkinligini bildiradi. Har bir token revocation ro'yxatiga (`server/authn/models.py:RevokedToken`) qarshi tekshiriladi — bekor qilingan token `InvalidToken` qaytaradi.

**Service token.** `server/common/auth.py:verify_service_token` `X-SERVICE-TOKEN` header'idagi tokenni SHA-256 bilan hash qilib, avval DB'dagi `ServiceToken` jadvalidan, so'ng `settings.SERVICE_TOKENS` dan (`SERVICE_TOKEN_BOT2_HASH` env) tekshiradi. Faqat `submit_survey` endpoint'i shu turdan foydalanadi.

Standart DRF sozlamasi (`server/crm_server/settings.py`):
```python
"DEFAULT_AUTHENTICATION_CLASSES": ("authn.authentication.CookieJWTAuthentication",),
"DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
```
Ya'ni alohida ko'rsatilmasa, har bir endpoint JWT bilan autentifikatsiyalangan foydalanuvchini talab qiladi.

### 1.3. Rollar va permissionlar

Foydalanuvchining ikkita roli bor (`server/authn/models.py:User.Role`): `admin` va `viewer`. Endpointlar quyidagi permission klasslaridan foydalanadi (`server/common/permissions.py`):

| Permission klass | O'qish (GET/HEAD/OPTIONS) | Yozish (POST/PUT/PATCH/DELETE) |
|------------------|---------------------------|---------------------------------|
| `IsAdminUserRole` | faqat `admin` | faqat `admin` |
| `IsViewerOrAdminReadOnly` | har qanday autentifikatsiyalangan foydalanuvchi (`viewer` yoki `admin`) | faqat `admin` |
| `IsAdminCatalogWriter` | har qanday autentifikatsiyalangan foydalanuvchi | faqat `admin` |
| `ServiceTokenPermission` | to'g'ri `X-SERVICE-TOKEN` | to'g'ri `X-SERVICE-TOKEN` |

Qisqasi: **`viewer` faqat o'qiy oladi**, **`admin` yoza oladi**. `IsViewerOrAdminReadOnly` va `IsAdminCatalogWriter` amalda bir xil mantiqqa ega.

### 1.4. Umumiy xato envelopi

Loyihada barcha xatolar bitta umumiy formatga keltiriladi. Buni `server/common/exceptions.py:custom_exception_handler` (DRF `EXCEPTION_HANDLER`) va `build_error_response` boshqaradi:

```json
{
  "error": {
    "code": "NOT_AUTHENTICATED",
    "message": "Authentication credentials were not provided or are invalid.",
    "details": { "...": "ixtiyoriy, faqat validatsiya xatolarida" }
  }
}
```

- `code` — UPPERCASE mashina-o'qiy kod (masalan `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`).
- `message` — odam-o'qiy tavsif (matn yoki ro'yxat bo'lishi mumkin).
- `details` — ixtiyoriy; validatsiya xatolarida maydon-darajadagi xatolar joylashadi.

Standart kodlarning HTTP statuslari bilan mosligi:

| `error.code` | HTTP status | Qachon |
|--------------|-------------|--------|
| `VALIDATION_ERROR` | 400 | DRF validatsiyasi yiqilganda (`message: "Validation error"`, `details` to'ldiriladi) |
| `NOT_AUTHENTICATED` | 401 | Token yo'q / yaroqsiz |
| `FORBIDDEN` | 403 | Rol yetarli emas (`PermissionDenied`) |
| `NOT_FOUND` | 404 | Resurs topilmadi |
| `SERVER_ERROR` | 500 | Kutilmagan ichki xato |

> **Diqqat (nomuvofiqlik):** Catalog endpointidagi `create()` override (`server/catalog/views.py`) `IntegrityError` ushlanganda envelopdan tashqari, eski DRF formatida javob qaytaradi: `{"detail": "...", "code": ["..."]}`. Bu yagona joy bu formatdan chetga chiqadi. Boshqa hamma joyda yuqoridagi `{"error": {...}}` envelopi amal qiladi.

### 1.5. Pagination formati

Standart pagination klassi `server/common/pagination.py:DefaultPagination` (DRF `PageNumberPagination` asosida). Sozlamalar: `PAGE_SIZE = 25`, `page_size_query_param = "page_size"`, `max_page_size = 500`.

Bu faqat ro'yxat (list) qaytaradigan DRF ViewSet endpointlariga tegishli (Catalog, Bot2 list'lar). Analytics endpointlari `@api_view` bo'lib, pagination'siz to'g'ridan-to'g'ri massiv/obyekt qaytaradi.

Pagination query parametrlari:

| Parametr | Tavsif | Misol |
|----------|--------|-------|
| `page` | Sahifa raqami (1 dan boshlanadi) | `?page=2` |
| `page_size` | Sahifadagi elementlar soni (max 500) | `?page_size=100` |

Paginatsiyalangan javob ko'rinishi:
```json
{
  "count": 137,
  "next": "https://host/api/v1/catalog/items/?page=2",
  "previous": null,
  "results": [ { "...": "..." } ]
}
```

### 1.6. Filtrlash, qidiruv, saralash

DRF list endpointlari odatda quyidagilarni qo'llaydi (har bir endpoint ostida aniq maydonlar ko'rsatilgan):
- `search=<matn>` — `SearchFilter` (belgilangan `search_fields` bo'yicha).
- `ordering=<maydon>` yoki `ordering=-<maydon>` — `OrderingFilter`.
- `DjangoFilterBackend` orqali to'g'ridan-to'g'ri maydon filtrlari (`?program=<id>` kabi).

### 1.7. Throttling (rate limiting)

Standart limitlar (`server/crm_server/settings.py`):

| Scope | Rate |
|-------|------|
| `user` (autentifikatsiyalangan) | 1000/kun |
| `anon` (anonim) | 100/kun |
| `login` (faqat login endpoint) | 10/daqiqa |

Limit oshsa, HTTP `429 Too Many Requests` qaytadi. Login uchun maxsus `server/common/throttles.py:LoginRateThrottle` ishlatiladi.

---

## 2. Auth endpointlari

Kod: `server/authn/views.py`, serializerlar: `server/authn/serializers.py`.

### 2.1. POST /api/v1/auth/login

Foydalanuvchini email + parol orqali tizimga kiritadi va JWT cookie'larini o'rnatadi.

| Xususiyat | Qiymat |
|-----------|--------|
| Metod / yo'l | `POST /api/v1/auth/login` |
| Autentifikatsiya | yo'q (`AllowAny`) |
| Permission | `AllowAny` |
| Throttle | `LoginRateThrottle` (10/daqiqa) |
| View | `LoginView` |

Body:
```json
{ "email": "admin@ttpu.uz", "password": "secret123" }
```

Muvaffaqiyatli javob (HTTP 200) — bundan tashqari `access_token` va `refresh_token` cookie'lari (`HttpOnly`) o'rnatiladi:
```json
{
  "user": {
    "id": "9f1c...uuid",
    "email": "admin@ttpu.uz",
    "role": "admin",
    "first_name": "Ali",
    "last_name": "Valiyev",
    "full_name": "Ali Valiyev"
  },
  "access": "<jwt-access-token>",
  "refresh": "<jwt-refresh-token>"
}
```

Cookie sozlamalari (`server/authn/views.py:_set_cookie`): `httponly=True`, `secure=JWT_COOKIE_SECURE`, `samesite=JWT_COOKIE_SAMESITE` (default `Lax`), `domain=JWT_COOKIE_DOMAIN`. Access token muddati: 15 daqiqa (`ACCESS_TOKEN_MINUTES`), refresh: 7 kun (`REFRESH_TOKEN_DAYS`).

Xatolar:

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| Email yoki parol noto'g'ri / user `is_active=False` | 400 | `VALIDATION_ERROR` (`message: "Validation error"`, `details` ichida `"Invalid credentials."`) |
| `email`/`password` maydon yetishmaydi yoki email formati noto'g'ri | 400 | `VALIDATION_ERROR` |
| Juda ko'p urinish | 429 | throttle |

> Login muvaffaqiyatli bo'lsa, audit logga `login` action yoziladi (`server/audit`).

### 2.2. POST /api/v1/auth/refresh

`refresh_token` cookie'sidan yangi access token oladi.

| Xususiyat | Qiymat |
|-----------|--------|
| Metod / yo'l | `POST /api/v1/auth/refresh` |
| Autentifikatsiya | refresh cookie (header'da JWT shart emas) |
| Permission | `AllowAny` |
| View | `RefreshView` |

Body talab qilinmaydi. Tizim `refresh_token` cookie'sini o'qiydi.

Muvaffaqiyatli javob (HTTP 200) — yangi `access_token` cookie'si ham o'rnatiladi:
```json
{ "access": "<yangi-jwt-access-token>" }
```

Xatolar:

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| `refresh_token` cookie yo'q | 401 | `NOT_AUTHENTICATED` (`"Refresh token missing."`) |
| Refresh token yaroqsiz | 401 | `NOT_AUTHENTICATED` / InvalidToken |
| Refresh token bekor qilingan (`RevokedToken`) | 401 | InvalidToken (`"Refresh token has been revoked."`) |

### 2.3. POST /api/v1/auth/logout

Foydalanuvchini chiqaradi: access va refresh tokenlarni bekor qiladi (`RevokedToken`) va cookie'larni tozalaydi.

| Xususiyat | Qiymat |
|-----------|--------|
| Metod / yo'l | `POST /api/v1/auth/logout` |
| Autentifikatsiya | JWT (cookie yoki header) |
| Permission | `IsAuthenticated` |
| View | `LogoutView` |

Body talab qilinmaydi.

Muvaffaqiyatli javob (HTTP 200):
```json
{ "success": true }
```

Xatolar:

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| Token yo'q / yaroqsiz | 401 | `NOT_AUTHENTICATED` |

> Logout audit logga `logout` action sifatida yoziladi. Cookie'lar o'tgan sanaga muddatlanib o'chiriladi.

### 2.4. GET /api/v1/auth/me

Joriy autentifikatsiyalangan foydalanuvchi ma'lumotini qaytaradi.

| Xususiyat | Qiymat |
|-----------|--------|
| Metod / yo'l | `GET /api/v1/auth/me` |
| Autentifikatsiya | JWT (cookie yoki header) |
| Permission | `IsAuthenticated` |
| View | `MeView` |

Javob (HTTP 200):
```json
{
  "id": "9f1c...uuid",
  "email": "admin@ttpu.uz",
  "role": "admin",
  "first_name": "Ali",
  "last_name": "Valiyev",
  "full_name": "Ali Valiyev"
}
```

Xatolar:

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| Token yo'q / yaroqsiz | 401 | `NOT_AUTHENTICATED` |

---

## 3. Catalog endpointlari

Kod: `server/catalog/views.py`, serializerlar: `server/catalog/serializers.py`, modellar: `server/catalog/models.py`.

CatalogItem turlari (`CatalogItem.ItemType`): `program`, `direction`, `subject`, `track`, `region`, `other`.

### 3.1. /api/v1/catalog/items — CatalogItem CRUD

To'liq CRUD ViewSet (`CatalogItemViewSet`). Universal katalog elementlari (dasturlar, viloyatlar, yo'nalishlar va h.k.).

| Xususiyat | Qiymat |
|-----------|--------|
| Base yo'l | `/api/v1/catalog/items/` |
| Autentifikatsiya | JWT |
| Permission | `IsAdminCatalogWriter` (o'qish — har kim; yozish — faqat `admin`) |
| Qidiruv (`search`) | `name`, `code` |
| Saralash (`ordering`) | `sort_order`, `name`, `type` |
| Maxsus filtrlar | `?type=<turi>`, `?is_active=true|false` |

Operatsiyalar:

| Metod | Yo'l | Tavsif |
|-------|------|--------|
| GET | `/api/v1/catalog/items/` | Ro'yxat (paginatsiyalangan) |
| POST | `/api/v1/catalog/items/` | Yangi element (faqat admin) |
| GET | `/api/v1/catalog/items/{id}/` | Bitta element |
| PUT | `/api/v1/catalog/items/{id}/` | To'liq yangilash (faqat admin) |
| PATCH | `/api/v1/catalog/items/{id}/` | Qisman yangilash (faqat admin) |
| DELETE | `/api/v1/catalog/items/{id}/` | O'chirish (faqat admin) |

POST body misoli (program turidagi element):
```json
{
  "type": "program",
  "name": "Computer Engineering",
  "name_uz": "Kompyuter injiniringi",
  "name_ru": "Компьютерная инженерия",
  "name_en": "Computer Engineering",
  "is_active": true,
  "sort_order": 10,
  "metadata": {
    "level": "bachelor",
    "track": "italian",
    "language": "English",
    "duration_years": 4
  }
}
```

Muhim qoidalar (`server/catalog/serializers.py:CatalogItemSerializer`):
- **`code` ixtiyoriy.** Berilmasa, create paytida avtomatik generatsiya qilinadi (masalan `PROGRAM-001`, `REGION-003`) — `_auto_generate_code`.
- **`(type, code)` juftligi noyob bo'lishi kerak** (code bo'sh bo'lmaganda). Takrorlansa validatsiya xatosi.
- **Program metadata validatsiyasi:** agar `type=program` va `metadata` bo'sh bo'lmasa, `metadata` ichida `level` (`bachelor`/`master`), `track` (`italian`/`uzbek`/`n/a`), `language` (bo'sh bo'lmagan satr), `duration_years` (musbat butun son) bo'lishi shart.

Javob misoli (GET bitta element, HTTP 200) — `fields = "__all__"` bo'lgani uchun barcha maydonlar qaytadi:
```json
{
  "id": "uuid",
  "type": "program",
  "code": "PROGRAM-001",
  "name": "Computer Engineering",
  "name_uz": "Kompyuter injiniringi",
  "name_ru": "Компьютерная инженерия",
  "name_en": "Computer Engineering",
  "parent": null,
  "is_active": true,
  "sort_order": 10,
  "metadata": { "level": "bachelor", "track": "italian", "language": "English", "duration_years": 4 },
  "created_at": "2026-01-10T08:00:00Z",
  "updated_at": "2026-01-10T08:00:00Z"
}
```

Xatolar:

| Holat | HTTP | Javob |
|-------|------|-------|
| Token yo'q | 401 | `{"error": {"code": "NOT_AUTHENTICATED", ...}}` |
| `viewer` yozmoqchi bo'lsa (POST/PUT/PATCH/DELETE) | 403 | `{"error": {"code": "FORBIDDEN", ...}}` |
| Validatsiya (metadata, takroriy code) | 400 | `{"error": {"code": "VALIDATION_ERROR", "details": {...}}}` |
| DB darajasida unique violation (`IntegrityError`) | 400 | `{"detail": "Bu turdagi element uchun bunday kod allaqachon mavjud.", "code": ["Unique constraint violated."]}` (eski format — yuqoridagi diqqatga qarang) |
| Topilmagan id | 404 | `{"error": {"code": "NOT_FOUND", ...}}` |

> Har bir create/update/delete audit logga yoziladi (before/after data bilan).

### 3.2. /api/v1/catalog/relations — CatalogRelation CRUD

Katalog elementlari orasidagi bog'lanishlar (`CatalogRelationViewSet`).

| Xususiyat | Qiymat |
|-----------|--------|
| Base yo'l | `/api/v1/catalog/relations/` |
| Autentifikatsiya | JWT |
| Permission | `IsAdminCatalogWriter` (o'qish — har kim; yozish — faqat `admin`) |
| Qidiruv (`search`) | `relation_type`, `from_item__name`, `to_item__name` |

`relation_type` qiymatlari (`CatalogRelation.RelationType`): `program_direction`, `program_track`, `subject_prereq`, `custom`.

Operatsiyalar: GET list, POST, GET `{id}`, PUT, PATCH, DELETE — Catalog items bilan bir xil sxema.

POST body misoli:
```json
{
  "from_item": "program-uuid",
  "to_item": "direction-uuid",
  "relation_type": "program_direction"
}
```

Javob misoli (HTTP 201):
```json
{
  "id": "uuid",
  "from_item": "program-uuid",
  "to_item": "direction-uuid",
  "relation_type": "program_direction",
  "created_at": "2026-01-10T08:00:00Z",
  "updated_at": "2026-01-10T08:00:00Z"
}
```

Xatolar: 401 / 403 / 400 (`(from_item, to_item, relation_type)` noyob bo'lishi kerak — `unique_catalog_relation`) / 404 — Catalog items bilan bir xil envelop.

### 3.3. /api/v1/catalog/programs — Programs (read-only)

Faqat `type=program` bo'lgan CatalogItem'larni qulay shaklda (metadata maydonlari yassi qilingan holda) qaytaradi (`ProgramViewSet`, `ReadOnlyModelViewSet`).

| Xususiyat | Qiymat |
|-----------|--------|
| Base yo'l | `/api/v1/catalog/programs/` |
| Metodlar | faqat `GET` (list va retrieve) |
| Autentifikatsiya | JWT |
| Permission | `IsViewerOrAdminReadOnly` (har qanday autentifikatsiyalangan foydalanuvchi o'qiy oladi) |
| Qidiruv (`search`) | `name`, `code` |
| Saralash (`ordering`) | `sort_order`, `name`, `code` |
| Maxsus filtrlar | `?level=bachelor|master`, `?track=italian|uzbek|n/a` (metadata bo'yicha) |

Javob misoli (GET list, `ProgramSerializer` — metadata yassi qilingan):
```json
{
  "count": 12,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "uuid",
      "code": "PROGRAM-001",
      "name": "Computer Engineering",
      "is_active": true,
      "level": "bachelor",
      "track": "italian",
      "language": "English",
      "duration_years": 4,
      "metadata": { "level": "bachelor", "track": "italian", "language": "English", "duration_years": 4 }
    }
  ]
}
```

Xatolar: 401 (token yo'q), 404 (topilmagan id).

---

## 4. Bot2 endpointlari

Kod: `server/bot2/views.py`, serializerlar: `server/bot2/serializers.py`, modellar: `server/bot2/models.py`, servislar: `server/bot2/services.py`.

Bu domen so'rovnoma (survey) jarayonini boshqaradi: ro'yxat (roster) → talaba (student) → so'rovnoma javobi (survey response) + dasturga yozilish hisobi (enrollment).

`course_year`: 1-4 — faol talabalar, 5 — bitiruvchilar.

### 4.1. /api/v1/bot2/roster — StudentRoster CRUD

Talabalar ro'yxati: kim qaysi dasturda, qaysi kursda (`Bot2StudentRosterViewSet`).

| Xususiyat | Qiymat |
|-----------|--------|
| Base yo'l | `/api/v1/bot2/roster/` |
| Autentifikatsiya | JWT |
| Permission | `IsAuthenticated` + `IsViewerOrAdminReadOnly` (o'qish — har kim; yozish — faqat `admin`) |
| Filtrlar (`DjangoFilterBackend`) | `program`, `course_year`, `is_active`, `roster_campaign` |
| Qidiruv (`search`) | `student_external_id` |
| Saralash (`ordering`) | `student_external_id`, `course_year`, `created_at` |

Operatsiyalar: GET list, POST, GET `{id}`, PUT, PATCH, DELETE.

POST body misoli:
```json
{
  "student_external_id": "U2026001",
  "roster_campaign": "default",
  "program": "program-uuid",
  "course_year": 2,
  "is_active": true,
  "metadata": {}
}
```

Javob misoli (`StudentRosterSerializer`, `fields="__all__"` + nested `program_details`):
```json
{
  "id": "uuid",
  "student_external_id": "U2026001",
  "roster_campaign": "default",
  "course_year": 2,
  "is_active": true,
  "metadata": {},
  "program": "program-uuid",
  "program_details": {
    "id": "program-uuid", "code": "PROGRAM-001", "name": "Computer Engineering",
    "name_uz": "...", "name_ru": "...", "name_en": "...", "type": "program"
  },
  "created_at": "2026-01-10T08:00:00Z",
  "updated_at": "2026-01-10T08:00:00Z"
}
```

Xatolar: 401, 403 (viewer yozmoqchi), 400 (`program` `type=program` bo'lmasa yoki `course_year` 1..5 oralig'ida bo'lmasa — model `clean`/validatorlari), 404.

### 4.2. /api/v1/bot2/students — Bot2Student CRUD

Telegram orqali ro'yxatdan o'tgan talabalarning profil ma'lumotlari (`Bot2StudentViewSet`).

| Xususiyat | Qiymat |
|-----------|--------|
| Base yo'l | `/api/v1/bot2/students/` |
| Autentifikatsiya | JWT |
| Permission | `IsAuthenticated` + `IsViewerOrAdminReadOnly` |
| Filtrlar | `gender`, `region` |
| Qidiruv (`search`) | `student_external_id`, `username`, `first_name`, `last_name` |
| Saralash (`ordering`) | `created_at` |

`gender` qiymatlari (`Bot2Student.Gender`): `male`, `female`, `other`, `unspecified`.

Javob misoli (`Bot2StudentSerializer`, `fields="__all__"`, `roster` — read-only, `region_details` nested):
```json
{
  "id": "uuid",
  "student_external_id": "U2026001",
  "telegram_user_id": 123456789,
  "username": "alivaliyev",
  "first_name": "Ali",
  "last_name": "Valiyev",
  "gender": "male",
  "phone": "+998901234567",
  "roster": "roster-uuid",
  "region": "region-uuid",
  "region_details": { "id": "region-uuid", "code": "REGION-001", "name": "Toshkent", "type": "region", "...": "..." },
  "created_at": "2026-01-10T08:00:00Z",
  "updated_at": "2026-01-10T08:00:00Z"
}
```

Xatolar: 401, 403 (viewer yozmoqchi), 400 (`region` `type=region` bo'lmasa), 404.

### 4.3. /api/v1/bot2/surveys — Bot2SurveyResponse CRUD

So'rovnoma javoblari (`Bot2SurveyResponseViewSet`). Odatda bot tomonidan `submit_survey` orqali yaratiladi; bu endpoint asosan dashboard'da o'qish/tahrirlash uchun.

| Xususiyat | Qiymat |
|-----------|--------|
| Base yo'l | `/api/v1/bot2/surveys/` |
| Autentifikatsiya | JWT |
| Permission | `IsAuthenticated` + `IsViewerOrAdminReadOnly` |
| Filtrlar | `program`, `course_year`, `survey_campaign` |
| Qidiruv (`search`) | `student__student_external_id`, `student__username` |
| Saralash (`ordering`) | `submitted_at`, `created_at` |
| Vaqt oralig'i filtrlari | `?from=<ISO>`, `?to=<ISO>` (`submitted_at` bo'yicha) |

`from`/`to` ISO datetime formatida bo'lishi kerak (`server/common/time.py:parse_iso_datetime`). Misol: `?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z`.

Javob misoli (`Bot2SurveyResponseSerializer`, `fields="__all__"` + `student_details` + `program_details`):
```json
{
  "id": "uuid",
  "student": "student-uuid",
  "student_details": { "id": "student-uuid", "first_name": "Ali", "...": "..." },
  "roster": "roster-uuid",
  "program": "program-uuid",
  "program_details": { "id": "program-uuid", "name": "Computer Engineering", "...": "..." },
  "course_year": 2,
  "survey_campaign": "default",
  "employment_status": "ishlayapman",
  "employment_company": "Acme LLC",
  "employment_role": "Junior Developer",
  "suggestions": "Ko'proq amaliyot kerak",
  "consents": { "data_processing": true },
  "answers": { "q1": "a", "q2": "b" },
  "submitted_at": "2026-03-15T10:30:00Z",
  "created_at": "2026-03-15T10:30:00Z",
  "updated_at": "2026-03-15T10:30:00Z"
}
```

Xatolar: 401, 403 (viewer yozmoqchi), 400 (model `clean` — survey'ning roster/program/course_year mosligi), 404.

### 4.4. /api/v1/bot2/enrollments — ProgramEnrollment CRUD

Har bir dastur + kurs uchun jami talaba soni (`ProgramEnrollmentViewSet`). Coverage hisoblashda "umumiy" (total) sifatida ishlatiladi.

| Xususiyat | Qiymat |
|-----------|--------|
| Base yo'l | `/api/v1/bot2/enrollments/` |
| Autentifikatsiya | JWT |
| Permission | `IsAuthenticated` + `IsViewerOrAdminReadOnly` |
| Filtrlar | `program`, `course_year`, `academic_year`, `campaign`, `is_active` |
| Qidiruv (`search`) | `program__name`, `notes` |
| Saralash (`ordering`) | `course_year`, `student_count`, `created_at` |

POST body misoli:
```json
{
  "program": "program-uuid",
  "course_year": 1,
  "student_count": 120,
  "academic_year": "2025-2026",
  "campaign": "default",
  "is_active": true,
  "notes": ""
}
```

Javob misoli (`ProgramEnrollmentSerializer`, `fields="__all__"` + hisoblangan maydonlar). `responded_count` — shu enrollment'ga mos so'rovnoma topshirgan noyob talabalar soni (viewset annotate qiladi); `coverage_percent` — `responded_count / student_count * 100`:
```json
{
  "id": "uuid",
  "program": "program-uuid",
  "program_details": { "id": "program-uuid", "name": "Computer Engineering", "code": "PROGRAM-001" },
  "course_year": 1,
  "student_count": 120,
  "academic_year": "2025-2026",
  "campaign": "default",
  "is_active": true,
  "notes": "",
  "responded_count": 84,
  "coverage_percent": 70.0,
  "created_at": "2026-01-10T08:00:00Z",
  "updated_at": "2026-01-10T08:00:00Z"
}
```

Xatolar: 401, 403 (viewer yozmoqchi), 400 (`(program, course_year, academic_year, campaign)` juftligi noyob — `unique_together`), 404.

### 4.5. POST /api/v1/admin/roster/import

CSV fayl yoki JSON ro'yxatdan talabalar ro'yxatini ommaviy import qiladi (`import_roster`).

| Xususiyat | Qiymat |
|-----------|--------|
| Metod / yo'l | `POST /api/v1/admin/roster/import` |
| Autentifikatsiya | JWT |
| Permission | `IsAuthenticated` + `IsAdminUserRole` (faqat `admin`) |
| Tranzaksiya | atomic |

Kirish formatlari (uchta variantdan biri):

**1) CSV fayl** (`multipart/form-data`, maydon nomi `file`):
```csv
student_external_id,program_id,program_code,course_year,is_active,campaign
U2026001,,PROGRAM-001,2,true,default
U2026002,program-uuid,,1,true,default
```

**2) JSON massiv** (`Content-Type: application/json`):
```json
[
  { "student_external_id": "U2026001", "program_code": "PROGRAM-001", "course_year": 2 },
  { "student_external_id": "U2026002", "program_id": "program-uuid", "course_year": 1 }
]
```

**3) JSON obyekt ichida `rows`**:
```json
{ "rows": [ { "student_external_id": "U2026001", "program_code": "PROGRAM-001", "course_year": 2 } ] }
```

Har bir qator qoidalari (`server/bot2/services.py:parse_roster_payload`):
- `student_external_id` — majburiy.
- `program_id` YOKI `program_code` — dasturni topish uchun (`type=program` yoki `type=direction` qabul qilinadi).
- `course_year` — majburiy, faqat **1..4** (import'da 5 qabul qilinmaydi).
- `campaign` — ixtiyoriy (default `default`).
- `is_active` — ixtiyoriy (default `true`).

Mavjud `student_external_id` topilsa yangilanadi (va denormalizatsiyalangan survey qatorlari sinxronlanadi), aks holda yangi roster yaratiladi.

Javob: agar barcha qatorlar muvaffaqiyatli bo'lsa HTTP **200**, agar bironta qatorda xato bo'lsa HTTP **207 Multi-Status**:
```json
{
  "created": 5,
  "updated": 2,
  "errors": [
    { "row": 3, "error": "course_year must be between 1 and 4." },
    { "row": 7, "error": "Program not found." }
  ]
}
```

Top-level xatolar:

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| Token yo'q | 401 | `NOT_AUTHENTICATED` |
| `viewer` chaqirsa | 403 | `FORBIDDEN` |
| Fayl/JSON ro'yxat yo'q | 400 | `INVALID_PAYLOAD` |

> Import natijasi audit logga `roster_import` meta bilan yoziladi.

### 4.6. POST /api/v1/bot2/surveys/submit

Telegram bot tomonidan chaqiriladigan asosiy endpoint: talaba so'rovnomasini yuboradi (`submit_survey`). Idempotent — bir talaba + campaign juftligi uchun qayta yuborilsa, mavjud javob yangilanadi.

| Xususiyat | Qiymat |
|-----------|--------|
| Metod / yo'l | `POST /api/v1/bot2/surveys/submit` |
| Autentifikatsiya | **Service token** (`X-SERVICE-TOKEN`, `service_name="bot2"`) |
| Permission | `[]` (DRF permission yo'q; ichkarida `verify_service_token` chaqiriladi) |
| Tranzaksiya | atomic |

Headerlar:
```
X-SERVICE-TOKEN: <bot2 service token>
Content-Type: application/json
```

Body misoli (to'liq):
```json
{
  "student_external_id": "U2026001",
  "telegram_user_id": 123456789,
  "course_year": 2,
  "program_id": "program-uuid",
  "survey_campaign": "default",
  "region_id": "region-uuid",
  "username": "alivaliyev",
  "first_name": "Ali",
  "last_name": "Valiyev",
  "gender": "male",
  "phone": "+998901234567",
  "employment_status": "ishlayapman",
  "employment_company": "Acme LLC",
  "employment_role": "Junior Developer",
  "suggestions": "Ko'proq amaliyot kerak",
  "consents": { "data_processing": true },
  "answers": { "q1": "a", "q2": "b" }
}
```

Maydonlar mantiqiy qoidalari:
- `student_external_id` — **majburiy**.
- `course_year` — ixtiyoriy, default 1, **1..5** oralig'ida. Lekin agar roster allaqachon mavjud bo'lsa, roster'ning `course_year` qiymati ustun keladi.
- `program_id` — roster mavjud bo'lmaganda **majburiy** (avto-roster yaratish uchun; `program` yoki `direction` turidagi CatalogItem bo'lishi kerak). Roster mavjud bo'lsa e'tiborga olinmaydi.
- `survey_campaign` — ixtiyoriy (default `default`).
- `region_id` — ixtiyoriy; berilsa `type=region` bo'lishi kerak.
- `telegram_user_id` — bor bo'lsa, talaba shu bo'yicha topiladi (student_external_id o'zgargan holatlarda ham), aks holda `student_external_id` bo'yicha update_or_create.

Muvaffaqiyatli javob (HTTP 200):
```json
{
  "ok": true,
  "roster": { "program_id": "program-uuid", "course_year": 2 },
  "response_id": "survey-response-uuid"
}
```

Xatolar:

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| `X-SERVICE-TOKEN` yo'q | 403 | `SERVICE_TOKEN_REQUIRED` |
| Token noto'g'ri | 403 | `SERVICE_TOKEN_INVALID` |
| `student_external_id` yo'q | 400 | `VALIDATION_ERROR` |
| `course_year` butun son emas yoki 1..5 dan tashqari | 400 | `INVALID_COURSE_YEAR` |
| Roster yo'q va `program_id` ham yo'q | 400 | `ROSTER_NOT_FOUND` |
| `program_id` program/direction emas | 400 | `INVALID_PROGRAM` |
| `region_id` region emas | 400 | `INVALID_REGION` |
| Model validatsiyasi yiqilsa | 400 | `VALIDATION_ERROR` |
| Kutilmagan xato | 500 | `SERVER_ERROR` |

> Survey yuborilganda audit logga `actor_type="service"`, `actor_service="bot2"` bilan yoziladi.

---

## 5. Analytics endpointlari

Kod: `server/analytics/views.py`. Bu endpointlar `@api_view(["GET"])` funksiyalari (DRF ViewSet emas), pagination'siz, to'g'ridan-to'g'ri JSON qaytaradi.

| Umumiy xususiyat | Qiymat |
|------------------|--------|
| Autentifikatsiya | JWT |
| Permission | `IsAuthenticated` + `IsViewerOrAdminReadOnly` (viewer ham o'qiy oladi) |

**Umumiy query parametrlari (deyarli barchasi):**

| Parametr | Majburiy | Tavsif |
|----------|----------|--------|
| `from` | ha (academic-years'dan tashqari) | ISO datetime — survey javoblari oralig'i boshi |
| `to` | ha (academic-years'dan tashqari) | ISO datetime — oralig' oxiri |
| `campaign` | yo'q | so'rovnoma campaign'i (default `default`) |
| `academic_year` | yo'q | masalan `2025-2026`; berilmasa eng yangi `ProgramEnrollment` avtomatik tanlanadi |
| `course_year` | ba'zilarida | 1..5; ba'zi endpointlarda majburiy |

`from`/`to` mantiqi (`_require_range`): ikkalasi ham bo'lishi, ISO formatda bo'lishi va `from < to` bo'lishi shart.

Coverage hisoblash mantiqi:
- **total** (umumiy talaba soni): agar `academic_year` aniqlangan bo'lsa — `ProgramEnrollment.student_count` yig'indisi; aks holda — `StudentRoster` qatorlari soni (`is_active=True`, mos campaign). Bitiruvchilar (course_year=5) doim roster'dan hisoblanadi.
- **responded**: oraliq ichida har bir talabaning **eng so'nggi** survey javobi (`_latest_responses_qs`), noyob talaba bo'yicha sanaladi.
- **coverage_percent** = `responded / total * 100`, 2 kasrgacha yaxlitlangan.

Umumiy oraliq xatolari (barcha 5 ta vaqt-talab qiluvchi endpointda):

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| `from` yoki `to` yo'q | 400 | `TIME_RANGE_REQUIRED` |
| ISO format noto'g'ri yoki `from >= to` | 400 | `INVALID_TIME_RANGE` |
| Token yo'q | 401 | `NOT_AUTHENTICATED` |

### 5.1. GET /api/v1/analytics/bot2/course-year-coverage

Har bir kurs (1..5) bo'yicha qamrov (`bot2_course_year_coverage`).

So'rov: `GET /api/v1/analytics/bot2/course-year-coverage?from=2026-01-01T00:00:00Z&to=2026-06-01T00:00:00Z&campaign=default`

Javob (HTTP 200) — har doim 5 ta element (1..5):
```json
[
  { "course_year": 1, "total": 320, "responded": 210, "coverage_percent": 65.63 },
  { "course_year": 2, "total": 300, "responded": 198, "coverage_percent": 66.0 },
  { "course_year": 3, "total": 280, "responded": 150, "coverage_percent": 53.57 },
  { "course_year": 4, "total": 260, "responded": 120, "coverage_percent": 46.15 },
  { "course_year": 5, "total": 90,  "responded": 30,  "coverage_percent": 33.33 }
]
```

### 5.2. GET /api/v1/analytics/bot2/program-coverage

Har bir dastur bo'yicha qamrov (`bot2_program_coverage`). Qo'shimcha ixtiyoriy `course_year` filtri bor.

So'rov: `GET /api/v1/analytics/bot2/program-coverage?from=...&to=...&course_year=2`

Javob (HTTP 200):
```json
[
  { "program_id": "uuid-1", "program_name": "Computer Engineering", "total": 120, "responded": 84, "coverage_percent": 70.0 },
  { "program_id": "uuid-2", "program_name": "Mechanical Engineering", "total": 100, "responded": 60, "coverage_percent": 60.0 }
]
```

### 5.3. GET /api/v1/analytics/bot2/program-course-matrix

Dastur × kurs matritsasi — heatmap uchun (`bot2_program_course_matrix`).

So'rov: `GET /api/v1/analytics/bot2/program-course-matrix?from=...&to=...`

Javob (HTTP 200):
```json
{
  "years": [1, 2, 3, 4, 5],
  "programs": [
    { "id": "uuid-1", "name": "Computer Engineering" },
    { "id": "uuid-2", "name": "Mechanical Engineering" }
  ],
  "cells": [
    { "program_id": "uuid-1", "course_year": 1, "total": 40, "responded": 30, "coverage_percent": 75.0 },
    { "program_id": "uuid-1", "course_year": 2, "total": 35, "responded": 20, "coverage_percent": 57.14 }
  ]
}
```

Har bir dastur uchun barcha 5 ta kurs bo'yicha katak (cell) qaytariladi.

### 5.4. GET /api/v1/analytics/bot2/program-details-by-year

Berilgan kurs uchun dasturlar kesimida tafsilot + bandlik (employment) statistikasi (`bot2_program_details_by_year`).

| Maxsus parametr | Majburiy | Tavsif |
|-----------------|----------|--------|
| `course_year` | **ha** | butun son (1..5) |

So'rov: `GET /api/v1/analytics/bot2/program-details-by-year?from=...&to=...&course_year=4`

Javob (HTTP 200) — total bo'yicha kamayish tartibida saralangan:
```json
[
  {
    "program_id": "uuid-1",
    "program_name": "Computer Engineering",
    "total": 60,
    "responded": 45,
    "coverage_percent": 75.0,
    "employed": 20,
    "unemployed": 25
  }
]
```

`employed`/`unemployed` — `employment_status` matnida `ishlayapman`/`employed`/`ишлаяпман` bo'lsa "employed", aks holda "unemployed" deb sanaladi.

Maxsus xatolar:

| Holat | HTTP | `error.code` |
|-------|------|--------------|
| `course_year` yo'q | 400 | `COURSE_YEAR_REQUIRED` |
| `course_year` butun son emas | 400 | `INVALID_COURSE_YEAR` |

### 5.5. GET /api/v1/analytics/bot2/enrollments-overview

Umumiy yig'ma ko'rsatkichlar: jami, kurslar va dasturlar kesimi bilan (`enrollments_overview`).

So'rov: `GET /api/v1/analytics/bot2/enrollments-overview?from=...&to=...&academic_year=2025-2026`

Javob (HTTP 200):
```json
{
  "total_students": 1250,
  "total_responded": 708,
  "coverage_percent": 56.64,
  "by_year": [
    { "course_year": 1, "total": 320, "responded": 210, "coverage_percent": 65.63 },
    { "course_year": 2, "total": 300, "responded": 198, "coverage_percent": 66.0 },
    { "course_year": 3, "total": 280, "responded": 150, "coverage_percent": 53.57 },
    { "course_year": 4, "total": 260, "responded": 120, "coverage_percent": 46.15 },
    { "course_year": 5, "total": 90,  "responded": 30,  "coverage_percent": 33.33 }
  ],
  "by_program": [
    { "program_id": "uuid-1", "program_name": "Computer Engineering", "course_year": 1, "total": 40, "responded": 30, "coverage_percent": 75.0 }
  ]
}
```

### 5.6. GET /api/v1/analytics/bot2/academic-years

Mavjud o'quv yillari ro'yxati, eng yangisi birinchi (`bot2_academic_years`). **Bu yagona analytics endpoint `from`/`to` talab qilmaydi.**

So'rov: `GET /api/v1/analytics/bot2/academic-years?campaign=default`

Javob (HTTP 200) — oddiy satrlar massivi:
```json
["2025-2026", "2024-2025", "2023-2024"]
```

Xatolar: 401 (token yo'q).

---

## 6. Boshqa (xizmat) endpointlari

### 6.1. GET /api/v1/healthz

Servis tirikligini tekshiradi (`healthz`, `server/crm_server/urls.py`). Autentifikatsiya talab qilinmaydi.

So'rov: `GET /api/v1/healthz`

Javob (HTTP 200):
```json
{ "ok": true }
```

### 6.2. GET /admin/

Django admin paneli (`django.contrib.admin`). Faqat `is_staff=True` foydalanuvchilar uchun, session autentifikatsiyasi bilan. `/api/v1/` prefiksidan tashqarida.

### 6.3. GET /api/schema/

OpenAPI 3 schema (`drf-spectacular` `SpectacularAPIView`). Mashina-o'qiy API spetsifikatsiyasi (YAML/JSON). `/api/v1/` prefiksidan tashqarida. `SERVE_INCLUDE_SCHEMA=False` (sozlamalar).

### 6.4. GET /api/docs/

Swagger UI (`SpectacularSwaggerView`) — yuqoridagi schema asosida interaktiv hujjat. Brauzerda API'ni sinab ko'rish uchun qulay. `/api/v1/` prefiksidan tashqarida.

---

## 7. Tez ko'rinma jadval (barcha endpointlar)

| Metod | Yo'l | Auth | Permission |
|-------|------|------|------------|
| POST | `/api/v1/auth/login` | yo'q | AllowAny |
| POST | `/api/v1/auth/refresh` | refresh cookie | AllowAny |
| POST | `/api/v1/auth/logout` | JWT | IsAuthenticated |
| GET | `/api/v1/auth/me` | JWT | IsAuthenticated |
| GET/POST | `/api/v1/catalog/items/` | JWT | IsAdminCatalogWriter |
| GET/PUT/PATCH/DELETE | `/api/v1/catalog/items/{id}/` | JWT | IsAdminCatalogWriter |
| GET/POST | `/api/v1/catalog/relations/` | JWT | IsAdminCatalogWriter |
| GET/PUT/PATCH/DELETE | `/api/v1/catalog/relations/{id}/` | JWT | IsAdminCatalogWriter |
| GET | `/api/v1/catalog/programs/` (+ `{id}/`) | JWT | IsViewerOrAdminReadOnly |
| GET/POST/PUT/PATCH/DELETE | `/api/v1/bot2/roster/` (+ `{id}/`) | JWT | IsViewerOrAdminReadOnly |
| GET/POST/PUT/PATCH/DELETE | `/api/v1/bot2/students/` (+ `{id}/`) | JWT | IsViewerOrAdminReadOnly |
| GET/POST/PUT/PATCH/DELETE | `/api/v1/bot2/surveys/` (+ `{id}/`) | JWT | IsViewerOrAdminReadOnly |
| GET/POST/PUT/PATCH/DELETE | `/api/v1/bot2/enrollments/` (+ `{id}/`) | JWT | IsViewerOrAdminReadOnly |
| POST | `/api/v1/admin/roster/import` | JWT | IsAdminUserRole |
| POST | `/api/v1/bot2/surveys/submit` | service token | (X-SERVICE-TOKEN, bot2) |
| GET | `/api/v1/analytics/bot2/course-year-coverage` | JWT | IsViewerOrAdminReadOnly |
| GET | `/api/v1/analytics/bot2/program-coverage` | JWT | IsViewerOrAdminReadOnly |
| GET | `/api/v1/analytics/bot2/program-course-matrix` | JWT | IsViewerOrAdminReadOnly |
| GET | `/api/v1/analytics/bot2/program-details-by-year` | JWT | IsViewerOrAdminReadOnly |
| GET | `/api/v1/analytics/bot2/enrollments-overview` | JWT | IsViewerOrAdminReadOnly |
| GET | `/api/v1/analytics/bot2/academic-years` | JWT | IsViewerOrAdminReadOnly |
| GET | `/api/v1/healthz` | yo'q | AllowAny |
| — | `/admin/` | session | is_staff |
| GET | `/api/schema/` | — | — |
| GET | `/api/docs/` | — | — |

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) — Backend tuzilishi (common, sozlamalar, xato envelopi, pagination)
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — Autentifikatsiya: User, JWT, rollar, service token
- [04-katalog.md](04-katalog.md) — Katalog (CatalogItem/CatalogRelation, dasturlar)
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovnoma domeni (roster, student, survey, enrollment)
- [06-analitika-va-audit.md](06-analitika-va-audit.md) — Analitika va Audit
- [08-telegram-bot.md](08-telegram-bot.md) — Telegram bot servisi va FSM oqimi
- [09-dashboard.md](09-dashboard.md) — Next.js boshqaruv paneli
- [10-malumotlar-modeli.md](10-malumotlar-modeli.md) — Ma'lumotlar modeli / ER diagramma
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari (workflows)
