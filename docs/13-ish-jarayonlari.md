# Ish jarayonlari (End-to-end workflows)

Bu hujjat TTPU CRM tizimidagi asosiy biznes-jarayonlarni (workflows) boshidan oxirigacha tasvirlaydi. Har bir jarayon uchun: kim ishtirok etadi (aktor), qadamlar ketma-ketligi, qaysi komponentlar va endpointlar chaqiriladi, hamda ma'lumotlar bazasida nima o'zgaradi — ASCII ketma-ketlik diagrammasi bilan ko'rsatilgan.

Hujjat loyihaga yangi qo'shilgan dasturchi uchun mo'ljallangan: bu yerda alohida fayllar va modellar emas, balki ularning **birgalikda qanday ishlashi** tushuntiriladi. Har bir tushuncha haqida chuqurroq ma'lumot kerak bo'lsa, oxiridagi "Tegishli hujjatlar" bo'limidagi havolalardan foydalaning.

Tizimning uch qatlami quyidagilar:

- **Backend** (`server/`) — Django 5 + DRF, barcha ma'lumotlar manbai. API `/api/v1` ostida.
- **Dashboard** (`dashboard/`) — Next.js boshqaruv paneli (xodimlar uchun), to'liq o'zbek tilida.
- **Bot 2** (`bot2_service/`) — aiogram v3 Telegram bot, talabalardan so'rovnoma yig'adi.

Ikki xil autentifikatsiya ishlatiladi:

- **Odamlar (xodimlar va bot login):** JWT (`Authorization: Bearer <access>` header yoki `access_token` cookie).
- **Mashina (bot survey yuborishi):** service token (`X-SERVICE-TOKEN: <raw>` header).

---

## 1. Talaba so'rovnomadan o'tishi (Bot 2 to'liq oqimi)

Bu eng murakkab va asosiy jarayon. Talaba Telegram orqali botga `/start` yuboradi, FSM (Finite State Machine) orqali 16 ta bosqichli savol-javobdan o'tadi, oxirida bot ma'lumotni backendga yuboradi.

**Aktor:** Talaba/bitiruvchi (Telegram foydalanuvchisi).

**Ishtirokchi komponentlar:** `bot2_service` (FSM + `CrmApiClient` + `CatalogCache`) → Backend (`/auth/login`, `/catalog/items/`, `/bot2/surveys/submit`).

### 1.1 Diqqatga sazovor: ikki xil autentifikatsiya bitta oqimda

Bot so'rovnoma davomida backendga ikki maqsadda murojaat qiladi:

1. **Katalog o'qish (hududlar, yo'nalishlar)** — bu JWT bilan amalga oshiriladi. Bot o'zi `/auth/login` orqali "dashboard foydalanuvchisi" sifatida tizimga kiradi va olingan `access` JWT'ni keshlab, `Authorization: Bearer` header bilan `GET /catalog/items/` qiladi.
2. **So'rovnomani yuborish** — bu service token bilan amalga oshiriladi. Bot `POST /bot2/surveys/submit` ga `X-SERVICE-TOKEN: <raw>` header bilan murojaat qiladi (JWT yo'q).

> Eslatma: bot konfiguratsiyasida `SERVER_BASE_URL` allaqachon `/api/v1` qismini o'z ichiga oladi (`bot2_service/src/bot2_service/config.py:settings`, standart `http://localhost:8000/api/v1`). Shu sababli bot kodida yo'llar `/auth/login`, `/catalog/items/`, `/bot2/surveys/submit` ko'rinishida, `/api/v1` prefiksisiz yoziladi.

### 1.2 FSM bosqichlari (`bot2_service/src/bot2_service/handlers.py`)

`SurveyState` (`states.py`) 16 ta holatdan iborat. `/start` har doim avvalgi holatni tozalaydi (`state.clear()`). Oqim quyidagicha (ishlaydigan/ishlamaydigan tarmoqlanish bilan):

```
/start  (cmd_start → state.clear())
  │
  ▼ waiting_language     set_language      — tugma matnidan til aniqlanadi (uz/ru/en)
  ▼ waiting_contact      set_contact       — F.contact → phone, telegram_user_id, username, chat_id
  ▼ waiting_first_name   set_first_name
  ▼ waiting_last_name    set_last_name
  ▼ waiting_gender       pick_gender       — callback "gender:"; KATALOG: regions keshdan o'qiladi
  ▼ waiting_region       pick_region       — callback "region:"; region_id/code/label saqlanadi
  ▼ waiting_student_id   set_student_id    — talaba ID matni; KATALOG: programs keshdan o'qiladi
  ▼ waiting_program      pick_program      — callback "program:"; program_id/code/label saqlanadi
  ▼ waiting_course_year  pick_course_year  — callback "course:1..5" (5 = bitirgan)
  ▼ waiting_employment   employment_choice — callback "employment:yes|no" → TARMOQLANADI
        │
        ├── employed (yes) ─► waiting_company → set_company
        │                     waiting_role    → set_role ───────────────┐
        │                                                               │
        └── unemployed (no) ─► waiting_help    → pick_help              │
                  │                                                     │
                  ├── help:yes ─► waiting_share_consent → pick_share    │
                  │               (channels keyboard ko'rsatiladi) ─────┤
                  │                                                     │
                  └── help:no  ────────────────────────────────────────┤
                                                                        │
  ▼ waiting_suggestions  set_suggestions ◄──────────────────────────────┘
  │
  ▼ _final_submit   — payload yig'iladi va backendga yuboriladi
```

> Eslatma: `SurveyState.waiting_channels` holati e'lon qilingan, lekin hech qaysi handler uni ishlatmaydi (kanal ro'yxati shunchaki `channels_keyboard()` bilan xabar sifatida ko'rsatiladi). `CatalogCache.get_subjects/get_tracks` ham so'rovnomada chaqirilmaydi.

### 1.3 Katalog o'qish oqimi (JWT, `api.py:_get_catalog`)

`pick_gender` (`catalog.get_regions()`) va `set_student_id` (`catalog.get_programs()`) bosqichlarida bot katalogni o'qiydi. `CatalogCache` (`catalog_cache.py`) 900 soniya (15 daqiqa) TTL bilan xotirada keshlaydi; bo'sh/xato natija keshlanmaydi.

```
Bot (CrmApiClient)                         Backend
  │
  │  agar JWT yo'q bo'lsa:
  │  POST /auth/login {email,password}  ──────────►  LoginView
  │  ◄──── 200 {user, access, refresh}              (DASHBOARD_EMAIL/PASSWORD)
  │  access JWT keshlanadi (_auth_token)
  │
  │  GET /catalog/items/?type=region&is_active=true
  │      Authorization: Bearer <access>   ─────────►  CatalogItemViewSet
  │  ◄──── 200 {results:[...]}                        (IsAuthenticated)
  │
  │  agar 401 (token muddati o'tgan) bo'lsa:
  │  _auth_token tozalanadi, qayta login, 1 marta retry
```

- `get_programs()` aslida `type=direction` (yo'nalishlar) ni so'raydi — `api.py:CrmApiClient.get_programs`.
- `get_regions()` esa `type=region` ni so'raydi.
- Javob DRF paginatsiyali `{results:[…]}` yoki oddiy ro'yxat bo'lishi mumkin; ikkalasi ham qabul qilinadi.

### 1.4 So'rovnomani yuborish (service token, `_final_submit`)

`set_suggestions` handleri `_final_submit` ni chaqiradi. Bu yerda **muhim tekshiruv** bor: agar `student_id` bo'sh bo'lsa, bot **jim turib** "rahmat" xabarini ko'rsatadi va state'ni tozalaydi — backendga **hech narsa yubormaydi** (faqat `logger.error` yoziladi). Bu ma'lumot yo'qolishi xavfini keltirib chiqaradi.

So'ngra payload yig'iladi (`_final_submit` ichida) va `api_client.submit_survey(payload)` chaqiriladi. Backend `2xx` qaytarmasa, bot 1 soniya kutib bir marta qayta urinadi; ikkinchi marta ham muvaffaqiyatsiz bo'lsa — `submission_failed` xabari ko'rsatiladi. Har holda oxirida `state.clear()` chaqiriladi.

Yuboriladigan payload (`handlers.py:_final_submit`, `POST /bot2/surveys/submit`):

```json
{
  "student_external_id": "U12345",
  "telegram_user_id": 111222333,
  "username": "ali",
  "phone": "+99890...",
  "first_name": "Ali",
  "last_name": "Valiyev",
  "gender": "male",
  "region_id": "<uuid>",
  "region_code": "TSH",
  "program_id": "<uuid>",
  "program_code": "B-IT-COMPE",
  "course_year": 3,
  "language": "uz",
  "employment_status": "employed",
  "employment_company": "Acme",
  "employment_role": "Engineer",
  "suggestions": "...",
  "consents": { "share_with_employers": true, "want_help": false },
  "answers": { "region_label": "...", "program_label": "...", "course_year": 3 }
}
```

> Eslatma: bot `survey_campaign` maydonini **yubormaydi** (backend `"default"` ni ishlatadi), tasdiqlash (confirm) bosqichi ham yo'q. Eski README'dagi `survey_campaign`, confirm step va `answers.channel` haqidagi ma'lumot kod bilan mos kelmaydi.

### 1.5 Backend tomondagi qayta ishlash (`server/bot2/views.py:submit_survey`)

Bu endpoint `permission_classes=[]` bilan e'lon qilingan — ya'ni JWT talab qilmaydi, faqat service token bilan himoyalangan. Butun funksiya `@transaction.atomic`.

Qadamlar:

1. `verify_service_token(X-SERVICE-TOKEN, service_name="bot2")` — `common/auth.py`. Token yo'q → `403 SERVICE_TOKEN_REQUIRED`; noto'g'ri → `403 SERVICE_TOKEN_INVALID`.
2. `student_external_id` majburiy. Yo'q bo'lsa → `400 VALIDATION_ERROR`.
3. `course_year` ixtiyoriy, standart `1`, `1..5` oralig'ida bo'lishi shart, aks holda `400 INVALID_COURSE_YEAR`.
4. **Roster lookup:** `StudentRoster.objects.filter(student_external_id=...).first()`.
   - **Roster topilmasa:** `program_id` berilgan bo'lsa, avtomatik roster yaratiladi (`roster_campaign="bot2_auto"`). `program_id` `PROGRAM` yoki `DIRECTION` tipdagi `CatalogItem` ga ishora qilishi kerak, aks holda `400 INVALID_PROGRAM`. `program_id` umuman yo'q bo'lsa → `400 ROSTER_NOT_FOUND`.
   - **Roster topilsa:** roster — `program` va `course_year` uchun yagona haqiqat manbai. Ya'ni bot yuborgan `course_year` **e'tiborga olinmaydi**, `roster.course_year` ishlatiladi.
5. `region_id` berilgan bo'lsa, `REGION` tipdagi item bo'lishi shart, aks holda `400 INVALID_REGION`.
6. **Bot2Student yaratish/yangilash:**
   - Avval `telegram_user_id` bo'yicha mavjud student qidiriladi (agar `student_external_id` o'zgargan bo'lsa, eski yozuvni topib yangilash uchun).
   - Topilmasa, `student_external_id` bo'yicha `update_or_create`.
7. **Bot2SurveyResponse upsert:** `update_or_create(student=..., survey_campaign=campaign)`. `program` va `course_year` roster'dan denormalizatsiya qilinadi. `submitted_at=timezone.now()`.
8. `log_audit(actor_type="service", actor_service="bot2", action="create", ...)`.
9. Javob: `200 {ok:true, roster:{program_id, course_year}, response_id}`.

> Eslatma: `(student, survey_campaign)` bo'yicha DB darajasida unique constraint yo'q (migration `0005` `unique_roster_campaign` ni olib tashlagan). Idempotentlik faqat mantiqiy — `update_or_create` orqali. Bir vaqtda kelgan parallel so'rovlar dublikat yaratishi mumkin.

### 1.6 To'liq ketma-ketlik diagrammasi

```
Talaba        Bot2 (FSM + CrmApiClient)         Backend (DRF)            DB (Postgres/SQLite)
  │                    │                              │                          │
  │  /start            │                              │                          │
  ├───────────────────►│ state.clear()                │                          │
  │  til, kontakt, ism, familiya, jins...             │                          │
  │◄──────────────────►│                              │                          │
  │                    │ get_regions() (kesh bo'sh)   │                          │
  │                    ├── POST /auth/login ──────────►│ LoginView                │
  │                    │◄── 200 {access,refresh} ──────┤                          │
  │                    ├── GET /catalog/items/?type=region ──► CatalogItemViewSet │
  │                    │◄── 200 {results:[...]} ───────┤ (IsAuthenticated)        │
  │  hudud, talaba ID  │                              │                          │
  │◄──────────────────►│ get_programs() (type=direction, keshdan yoki API)       │
  │  yo'nalish, kurs, ish holati, ...                 │                          │
  │◄──────────────────►│                              │                          │
  │  takliflar         │                              │                          │
  ├───────────────────►│ _final_submit               │                          │
  │                    │ student_id bo'shmi? (ha → jim chiqish)                  │
  │                    ├── POST /bot2/surveys/submit ─►│ submit_survey            │
  │                    │   X-SERVICE-TOKEN: <raw>      │ verify_service_token     │
  │                    │                              │ roster lookup ──────────►│
  │                    │                              │◄── roster yoki yo'q ──────┤
  │                    │                              │ Bot2Student upsert ─────►│
  │                    │                              │ Bot2SurveyResponse upsert►│
  │                    │                              │ log_audit (service)      │
  │                    │◄── 200 {ok,response_id} ──────┤                          │
  │  "Rahmat!"         │                              │                          │
  │◄───────────────────┤ state.clear()               │                          │
```

---

## 2. Xodim tizimga kirishi (Dashboard login + JWT hydrate)

**Aktor:** CRM xodimi (admin yoki viewer).

**Ishtirokchi komponentlar:** Dashboard (`/login` sahifa → `useAuth().login` → `authApi`) → Backend (`POST /auth/login`, `GET /auth/me`).

### 2.1 Login va token saqlash

1. Foydalanuvchi `/login` da email + parol kiritadi. Forma `useAuth().login(email, password)` ni chaqiradi (`dashboard/lib/auth-context.tsx`).
2. `authApi.login` → `POST /api/v1/auth/login` (`dashboard/lib/api.ts`).
3. Backend `LoginView` (`server/authn/views.py`):
   - `AllowAny` + `LoginRateThrottle` (10/min).
   - Javob body'da `{user, access, refresh}` qaytaradi **VA** ikkala HttpOnly cookie'ni (`access_token`, `refresh_token`) o'rnatadi.
   - `log_audit(action="login")`.
4. Dashboard `persistTokens(access, refresh)`:
   - `access_token` va `refresh_token` **localStorage** ga yoziladi.
   - `dashboard_auth=1` marker cookie o'rnatiladi (7 kun, maxfiy emas — faqat middleware gating uchun).
5. So'ng `authApi.me()` → `GET /api/v1/auth/me` chaqiriladi va `user` context'ga yoziladi → `/dashboard` ga yo'naltiriladi.

> Eslatma (xavfsizlik): JWT ham localStorage'da (XSS'ga ochiq), ham HttpOnly cookie'da saqlanadi. Bu cookie qattiqlashtirishini qisman bekor qiladi. `proxy.ts` middleware esa faqat `dashboard_auth` marker cookie'ni tekshiradi, JWT'ni emas.

### 2.2 Hydrate (`hydrateUser`) va uch qatlamli himoya

Sahifa yangilanganda yoki birinchi yuklanishda `AuthProvider` `hydrateUser` ni bir marta ishga tushiradi (`hydratedRef` bilan himoyalangan):

- localStorage'da token bo'lmasa, `GET /auth/me` umuman chaqirilmaydi (kafolatlangan 401'dan qochish uchun) → `/login` ga yo'naltiriladi.
- Token bo'lsa, `authApi.me()` chaqiriladi. Muvaffaqiyatli → `user` o'rnatiladi. `UNAUTHORIZED` → `/login` ga.

Uch qatlamli himoya (gating):

```
1. proxy.ts (middleware)  — dashboard_auth marker cookie /login va /dashboard/* ga gate qiladi
2. dashboard/layout.tsx   — client-side guard (user yo'q bo'lsa redirect)
3. apiFetch (lib/api.ts)  — har bir 401 javobda token tozalanadi va /login ga yo'naltiriladi
```

```
Xodim         Dashboard (auth-context + api.ts)        Backend
  │                  │                                     │
  │ email+parol      │                                     │
  ├─────────────────►│ login()                             │
  │                  ├── POST /api/v1/auth/login ──────────►│ LoginView (AllowAny, throttle)
  │                  │◄── 200 {user,access,refresh} ────────┤ + Set-Cookie (HttpOnly)
  │                  │ persistTokens → localStorage + marker cookie
  │                  ├── GET /api/v1/auth/me ──────────────►│ MeView
  │                  │◄── 200 {user} ───────────────────────┤
  │ /dashboard       │ setUser(user)                        │
  │◄─────────────────┤                                      │
```

---

## 3. Roster import (xodim CSV/JSON yuklaydi)

**Aktor:** ADMIN rolidagi xodim (yoki `import_roster` boshqaruv komandasi orqali operator).

**Ishtirokchi komponentlar:** Dashboard yoki to'g'ridan-to'g'ri API → Backend (`POST /admin/roster/import` → `import_roster` → `parse_roster_payload` + `upsert_roster_row`).

### 3.1 Endpoint va kirish formatlari

`POST /api/v1/admin/roster/import` (`server/bot2/views.py:import_roster`, URL name `bot2-roster-import`):

- Permission: `IsAuthenticated` + `IsAdminUserRole` (faqat admin).
- `@transaction.atomic`.
- Uch xil kirish qabul qilinadi:
  1. **CSV fayl** — `multipart/form-data`, `file` maydoni. `csv.DictReader` bilan o'qiladi.
  2. **JSON ro'yxat** — `request.data` to'g'ridan-to'g'ri list bo'lsa.
  3. **JSON obyekt** — `{"rows": [...]}` ko'rinishida.
- Hech biri mos kelmasa → `400 INVALID_PAYLOAD`.

### 3.2 Qator qayta ishlash (`services.py`)

Har bir qator uchun:

1. `parse_roster_payload(row)`:
   - `student_external_id` majburiy, aks holda `VALIDATION_ERROR`.
   - `program` `program_id` yoki `program_code` orqali topiladi (`get_program`, `PROGRAM` yoki `DIRECTION` tip). Topilmasa → `PROGRAM_NOT_FOUND`.
   - `course_year` **import yo'lida faqat 1..4** ga ruxsat etilgan (model esa 1..5 ni qabul qiladi). Noto'g'ri → `INVALID_COURSE_YEAR`.
   - `campaign` (standart `"default"`), `is_active`.
2. `upsert_roster_row(parsed)`:
   - Mavjud roster topilsa, o'zgargan maydonlar yangilanadi va — **muhim** — shu roster'ga bog'langan mavjud `Bot2SurveyResponse` qatorlari `program`/`course_year` bo'yicha sinxronlanadi (denormalizatsiya saqlanadi).
   - Topilmasa, yangi `StudentRoster` yaratiladi.
   - `True` qaytarsa — yaratildi, `False` — yangilandi.

> Eslatma: `upsert_roster_row` `ProgramEnrollment` headcount'larini **yangilamaydi** — ular alohida qo'lda boshqariladi (4-jarayonda emas, 5-jarayonga qarang).

### 3.3 Natija va xatolar

Funksiya `{created, updated, errors}` qaytaradi. Agar bironta qator xato bersa — HTTP `207 MULTI_STATUS`, aks holda `200`. Har bir qatordagi xato `{"row": idx, "error": ...}` ko'rinishida `errors` ro'yxatiga yig'iladi (bitta qatorning xatosi qolganini to'xtatmaydi). Oxirida `log_audit(action="update", meta={"type": "roster_import"})`.

```
Xodim/Operator      Backend (import_roster)              services + DB
  │                       │                                  │
  ├─ POST /admin/roster/import (CSV yoki JSON) ─►│           │
  │                       │ IsAdminUserRole tekshiruvi       │
  │                       │ rows = CSV/JSON dan o'qiladi      │
  │                       │ har bir qator uchun loop:         │
  │                       │   parse_roster_payload ──────────►│ program lookup, validatsiya
  │                       │   upsert_roster_row ─────────────►│ StudentRoster create/update
  │                       │                                  │ + Bot2SurveyResponse sync
  │                       │ log_audit(roster_import)          │
  │◄─ 200 yoki 207 {created,updated,errors} ─────┤           │
```

---

## 4. Xodim so'rovnomalarni ko'rishi va tahrirlashi

**Aktor:** Har qanday autentifikatsiyalangan xodim (viewer o'qiy oladi, admin ham o'qiy oladi va tahrirlay oladi — ammo `Bot2SurveyResponseViewSet` `IsViewerOrAdminReadOnly` ishlatadi, ya'ni yozish faqat ADMIN uchun).

**Ishtirokchi komponentlar:** Dashboard (`/dashboard/surveys` ro'yxat sahifasi, `/dashboard/surveys/[id]` detal) → Backend (`GET/PATCH /bot2/surveys/`).

### 4.1 Ro'yxat, filtr va Excel export (`dashboard/app/dashboard/surveys/page.tsx`)

1. Sahifa yuklanganda `bot2Api.listSurveys({page_size: "500", ordering: "-submitted_at"})` chaqiriladi → `GET /api/v1/bot2/surveys/?page_size=500&ordering=-submitted_at`.
2. Parallel ravishda `bot2Api.listStudents({page_size: "500"})` ham chaqiriladi — student tafsilotlarini ID bo'yicha map qilish uchun (`studentMap`).
3. Filtrlash **client tomonida** amalga oshiriladi:
   - **Matn qidiruvi** (`search`): ism, familiya, student ID, telefon, kampaniya, kompaniya, lavozim, takliflar bo'yicha.
   - **Ish holati** va **sana oralig'i** (preset: bugun/haftalik/oylik/yillik/maxsus) — export uchun.
   - Paginatsiya ham client tomonida (`pageSize`: 20/50/100).
4. **Excel export** (`handleExport`): `xlsx` kutubxonasi orqali sana bo'yicha filtrlangan so'rovnomalar `.xlsx` faylga yoziladi (o'zbekcha ustun nomlari bilan: Ism, Familiya, Student ID, Telefon, Jins, Viloyat, Yo'nalish, Kurs, Ishlaysizmi?, Kompaniya, Lavozim, va h.k.). `course_year === 5` → "Bitirgan".

> Eslatma: backend `Bot2SurveyResponseViewSet` `?from`/`?to` ISO sana filtrini va `?program`/`?course_year`/`?survey_campaign` filterlarini qo'llab-quvvatlaydi (`get_queryset`), lekin surveys sahifasi ularni server'ga uzatmaydi — barcha 500 ta yozuvni olib, client'da filtrlaydi.

### 4.2 Bitta so'rovnomani ko'rish va inline tahrirlash (`/dashboard/surveys/[id]`)

- `bot2Api.getSurvey(id)` → `GET /bot2/surveys/{id}/`.
- Tahrirlash: `bot2Api.updateSurvey(id, data)` → `PATCH /bot2/surveys/{id}/`. Backend `IsViewerOrAdminReadOnly` tufayli faqat ADMIN yozishi mumkin (viewer 403 oladi).
- `?edit=true` query bilan tahrirlash rejimi ochiladi (surveys ro'yxatidagi qalam tugmasi shu URL'ga olib boradi).

```
Xodim       Dashboard (surveys/page.tsx)        Backend
  │              │                                  │
  ├─ sahifa ────►│ listSurveys(page_size=500)       │
  │              ├── GET /bot2/surveys/ ────────────►│ Bot2SurveyResponseViewSet
  │              │◄── 200 {results:[...]} ───────────┤ (IsViewerOrAdminReadOnly)
  │              ├── GET /bot2/students/ (map) ──────►│
  │ qidiruv/filtr│ (client tomonida)                 │
  │ Excel ───────│ handleExport → xlsx faylga        │
  │              │                                  │
  │ tahrirla ───►│ /surveys/[id]?edit=true           │
  │              ├── PATCH /bot2/surveys/{id}/ ──────►│ (faqat ADMIN yozadi)
  │              │◄── 200 {updated} ─────────────────┤
```

---

## 5. Enrollment headcount kiritish va coverage tahlili

**Aktor:** Xodim (enrollment CRUD: `IsViewerOrAdminReadOnly` → yozish ADMIN, o'qish hamma; analitika: hamma o'qiy oladi).

**Ishtirokchi komponentlar:** Dashboard (`/dashboard/enrollments`, `/dashboard/analytics/surveys`, `/dashboard/analytics/enrollments`) → Backend (`ProgramEnrollmentViewSet`, `analytics/*`).

### 5.1 Nima uchun enrollment kerak?

`ProgramEnrollment` — bu **maxraj (denominator)**. Coverage foizi = (so'rovnomaga javob bergan talabalar) / (jami talabalar soni) × 100. "Jami talabalar soni" ikki manbadan kelishi mumkin:

- Agar `academic_year` aniqlangan/topilgan bo'lsa → `ProgramEnrollment.student_count` lar yig'indisi (Sum) ishlatiladi. Bu `(program, course_year, academic_year, campaign)` bo'yicha noyob (`unique_together`), 1..4 kurslarni qamraydi.
- Aks holda yoki 5-kurs (bitirganlar) uchun → `StudentRoster` qatorlari soni (Count) ishlatiladi.

### 5.2 Enrollment CRUD (`ProgramEnrollmentViewSet`, `server/bot2/views.py`)

- `GET /bot2/enrollments/` — ro'yxat. ViewSet `responded_count` ni annotate qiladi (bog'langan survey'lar `course_year` va `campaign` mos kelganlar, distinct roster bo'yicha).
- `POST/PATCH/DELETE /bot2/enrollments/` — CRUD, har biri `log_audit` yozadi. Yangi/tahrirlangan sahifa `/dashboard/enrollments/[id]` joriy o'quv yilini avtomatik to'ldiradi.
- `coverage_percent` serializer/model darajasida hisoblanadi: `responded / student_count × 100` (count 0 bo'lsa 0.0).

### 5.3 Analitika hisoblash (`server/analytics/views.py`)

Barcha analitika endpointlari (bittasidan tashqari) **vaqt oralig'ini majburiy** talab qiladi (`_require_range` → yo'q bo'lsa `400 TIME_RANGE_REQUIRED`). Dashboard `_analyticsParams` (`lib/api.ts`) standart `from = hozir - 730 kun`, `to = hozir + 400 kun` yuboradi.

Asosiy mantiq `_latest_responses_qs(start, end, campaign)` — har bir talaba uchun vaqt oralig'idagi **eng oxirgi** survey javobini tanlaydi (`submitted_at`, keyin `created_at`, keyin `id` bo'yicha). Shu sababli takroriy javoblar bittaga sanaladi.

Endpointlar:

| Endpoint | Maqsad |
|----------|--------|
| `GET /analytics/bot2/academic-years` | Mavjud o'quv yillari (vaqt oralig'i SHART EMAS) |
| `GET /analytics/bot2/course-year-coverage` | Har bir kurs (1..5) bo'yicha qamrov |
| `GET /analytics/bot2/program-coverage` | Yo'nalishlar bo'yicha qamrov |
| `GET /analytics/bot2/program-course-matrix` | Yo'nalish × kurs matritsasi |
| `GET /analytics/bot2/program-details-by-year` | Kurs bo'yicha yo'nalish + ish bandligi (`course_year` SHART) |
| `GET /analytics/bot2/enrollments-overview` | Umumiy ko'rinish: yil va yo'nalish bo'yicha |

### 5.4 Analitika sahifasi oqimi (`dashboard/app/dashboard/analytics/surveys/page.tsx`)

1. Mount'da `analyticsApi.getAcademicYears()` chaqiriladi. Natija bo'lsa, eng oxirgi (birinchi element) tanlanadi; bo'lmasa — filtrsiz `loadCoverage()`.
2. O'quv yili tanlanganda `getCourseYearCoverage({academicYear})` chaqiriladi → 5 ta kurs uchun donut kartalar (qamrov foizi, jami, ishtirok etgan).
3. Kurs kartasiga bosilganda `getProgramDetailsByYear(year, {academicYear})` chaqiriladi → o'sha kurs bo'yicha yo'nalishlar jadvali (jami, qatnashgan, qamrov, ishlaydi/ishlamaydi).

```
Xodim     Dashboard (analytics/surveys)         Backend (analytics/views.py)
  │            │                                     │
  ├─ sahifa ──►│ getAcademicYears() ─────────────────►│ bot2_academic_years
  │            │◄── ["2024", "2023", ...] ────────────┤ (ProgramEnrollment dan)
  │            │ eng oxirgi yil tanlanadi              │
  │            ├── getCourseYearCoverage(from,to,year)►│ bot2_course_year_coverage
  │            │   (academic_year → ProgramEnrollment.Sum yoki roster.Count)
  │            │◄── [{course_year,total,responded,coverage_percent}×5] ──┤
  │ kurs bos ─►│ getProgramDetailsByYear(year) ───────►│ bot2_program_details_by_year
  │            │◄── [{program, total, responded, employed, unemployed}] ─┤
```

> Eslatma: coverage 100%dan oshishi mumkin — "total" (enrollment yoki roster) va "responded" (distinct survey studentlar) mustaqil manbalardan kelgani uchun, roster'da bo'lmagan respondentlar foizni 100%dan oshirishi ehtimoli bor.

---

## 6. Logout (token bekor qilish) va JWT yangilash (refresh) sikli

### 6.1 Logout (`POST /auth/logout`)

**Aktor:** autentifikatsiyalangan xodim.

1. Dashboard `useAuth().logout()` → `authApi.logout()` → `POST /api/v1/auth/logout` (`Authorization: Bearer` + cookie).
2. Backend `LogoutView` (`server/authn/views.py`):
   - Cookie'dagi refresh token JTI'sini `RevokedToken` ga qo'shadi (`RevokedToken.revoke(..., REFRESH)`).
   - Cookie'dagi access token JTI'sini ham `RevokedToken` ga qo'shadi (`ACCESS`).
   - Ikkala cookie'ni tozalaydi (`_clear_cookie`).
   - `log_audit(action="logout")`.
3. Dashboard `clearStoredTokens()` — localStorage va marker cookie tozalanadi → `/login` ga yo'naltiriladi.

> `RevokedToken` denylist'i har bir so'rovda `get_validated_token` orqali tekshiriladi (`authn/authentication.py`). Ya'ni logout'dan keyin eski access token bilan kirib bo'lmaydi (test `test_integrity.py` buni tasdiqlaydi). Denylist avtomatik tozalanmaydi — `cleanup_tokens` komandasi cron orqali ishlatilishi kerak.

### 6.2 Refresh (`POST /auth/refresh`)

**Aktor:** Dashboard `apiFetch` (avtomatik, 401 javobda) yoki bot (faqat reaktiv, 401'da qayta login).

Dashboard sxemasi (`lib/api.ts:refreshAccessToken`):

1. Har qanday `apiFetch` `401` qaytarsa va `retryOnAuthFailure=true` bo'lsa, `refreshAccessToken()` chaqiriladi (single-flight — bir vaqtda faqat bitta refresh so'rovi).
2. `POST /api/v1/auth/refresh` **body'siz** yuboriladi (`credentials: "include"` orqali refresh cookie uzatiladi).
3. Backend `RefreshView`:
   - Refresh token **faqat cookie'dan** o'qiladi (`REFRESH_COOKIE_NAME`). Yo'q bo'lsa → `401 NOT_AUTHENTICATED`.
   - Token yaroqsiz → `InvalidToken`. `RevokedToken.is_revoked(refresh)` → revoked bo'lsa `InvalidToken`.
   - Yangi access token mint qilinadi va `access_token` cookie yangilanadi, body'da ham `{access}` qaytariladi.
4. Dashboard yangi `access` ni localStorage'ga yozadi (`persistTokens`) va **asl so'rovni bir marta qayta uradi** (`apiFetch(..., false)`).
5. Refresh muvaffaqiyatsiz bo'lsa → tokenlar tozalanadi va `/login` ga yo'naltiriladi.

```
apiFetch          Backend RefreshView         RevokedToken / DB
  │  401 oldi          │                          │
  ├─ refreshAccessToken() (single-flight)         │
  ├─ POST /api/v1/auth/refresh (body yo'q) ───────►│ refresh cookie'dan o'qiladi
  │                    │ is_revoked? ─────────────►│
  │                    │◄── revoked emas ───────────┤
  │◄── 200 {access} + Set-Cookie ──────────────────┤
  ├─ persistTokens(access) → localStorage          │
  ├─ asl so'rovni 1 marta qayta uradi              │
```

> Eslatma: `RefreshView` `AllowAny` va alohida throttle yo'q. Bot tomonida proaktiv refresh yo'q — bot faqat `GET /catalog/items/` 401 qaytarganda qayta login qiladi (1.3-bo'limga qarang).

---

## 7. Admin foydalanuvchi yaratish va service token o'rnatish (operatsion)

Bu jarayon kod orqali emas, **operator/devops** tomonidan boshqaruv komandalari va `.env` orqali bajariladi. Tizimni birinchi marta ishga tushirishda zarur.

### 7.1 Admin foydalanuvchi yaratish

Backend ichida (`server/`):

```bash
python manage.py create_admin
```

`create_admin` komandasi (`server/authn/management/commands/create_admin.py`) ADMIN rolidagi (`is_staff=True`) foydalanuvchi yaratadi. Bu foydalanuvchi:

- Dashboard'ga login qilish uchun (1-jarayon dagi `authApi.login`).
- Bot'ning katalog o'qish uchun login qilishi uchun (`DASHBOARD_EMAIL`/`DASHBOARD_PASSWORD` — bot ko'pincha shu yoki alohida hisob bilan kiradi).

### 7.2 Service token o'rnatish (bot ↔ backend ishonchi)

So'rovnoma yuborish service token bilan himoyalangan (1.5-bo'limga qarang). Ishonch sxemasi:

- **Bot tomonida:** RAW (xom) token `.env` da saqlanadi (`SERVICE_TOKEN`). Bu majburiy — yo'q bo'lsa bot ishga tushmaydi (`config.py` `RuntimeError` ko'taradi).
- **Backend tomonida:** faqat SHA-256 **hash** saqlanadi. Ikki manba:
  1. **DB:** `ServiceToken` modeli (`token_hash`, `service_name="bot2"`, `is_active=True`). `verify_service_token` avval shuni tekshiradi (`_verify_db_token`).
  2. **ENV fallback:** `settings.SERVICE_TOKENS` (env `SERVICE_TOKEN_BOT2_HASH`). DB topilmasa yoki DB xato bersa, shu ishlatiladi.

Har bir submit'da bot `X-SERVICE-TOKEN: <raw>` yuboradi; backend uni SHA-256 qilib, doimiy vaqtli (`hmac.compare_digest`) taqqoslaydi.

```
Operator                              Backend
  │
  │ 1. python manage.py create_admin  →  ADMIN User yaratiladi
  │
  │ 2. RAW token generatsiya qilinadi (masalan: openssl rand -hex 32)
  │    sha256(raw) hisoblanadi
  │
  │ 3a. DB usuli:   ServiceToken(token_hash=sha256, service_name="bot2", is_active=True)
  │ 3b. ENV usuli:  SERVICE_TOKEN_BOT2_HASH=<sha256>  (server .env)
  │
  │ 4. Bot .env:    SERVICE_TOKEN=<raw>
  │                 DASHBOARD_EMAIL/DASHBOARD_PASSWORD=<admin creds>
  │                 BOT_TOKEN=<telegram bot token>
  │                 SERVER_BASE_URL=http://.../api/v1
```

> Eslatma: `settings.SERVICE_TOKENS` faqat `bot2` ni ulaydi. Eski hujjatlardagi `SERVICE_TOKEN_BOT1_HASH` ESKIRGAN — Bot 1 olib tashlangan (commit `98dd68c`). `verify_service_token` DB xatolarini keng `except Exception` bilan yutadi (testlar uchun mo'ljallangan), bu DB vaqtinchalik ishlamaganda eski env tokenni qabul qilishi mumkin.

### 7.3 Boshqa foydali komandalar

| Komanda | Maqsad |
|---------|--------|
| `python manage.py seed_programs` | 13 ta dasturni idempotent qo'shadi |
| `python manage.py seed_catalog` | Katalog ma'lumotlarini urug'lash |
| `python manage.py seed_ttpumock` | Mock test ma'lumotlari (`server/common/management/commands/seed_ttpumock.py`) |
| `python manage.py import_roster --file <csv>` | CSV ni bulk import (3-jarayon kabi, `parse_roster_payload`/`upsert_roster_row` ni qayta ishlatadi) |
| `python manage.py cleanup_tokens` | `RevokedToken` denylist'ini tozalaydi (GC) |

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) — Backend tuzilishi
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — Autentifikatsiya: User, JWT, rollar, service token
- [04-katalog.md](04-katalog.md) — Katalog (CatalogItem/CatalogRelation, dasturlar)
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovnoma domeni (roster, student, survey, enrollment)
- [06-analitika-va-audit.md](06-analitika-va-audit.md) — Analitika va Audit
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma
- [08-telegram-bot.md](08-telegram-bot.md) — Telegram bot servisi va FSM oqimi
- [09-dashboard.md](09-dashboard.md) — Next.js boshqaruv paneli
- [10-malumotlar-modeli.md](10-malumotlar-modeli.md) — Ma'lumotlar modeli / ER diagramma
- [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md) — O'rnatish, deploy, seed komandalar
- [12-testlar.md](12-testlar.md) — Test qoplamasi
