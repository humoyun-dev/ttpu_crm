# TTPU CRM — Hujjatlar

Bu papka (`docs/`) — TTPU CRM loyihasining rasmiy texnik hujjatlar to'plami. Bu yerdagi 13 ta hujjat tizimning HOZIRGI kod holatini (backend + Telegram Bot 2 + Next.js dashboard) batafsil, o'zbek tilida yoritadi. Texnik atamalar (endpoint, model, migration, JWT, FSM, serializer va h.k.) inglizcha qoldirilgan, ammo tushuntirishlar o'zbekcha.

Hujjatlar bir-biriga bog'langan (cross-link). Har bir faylning oxirida **Tegishli hujjatlar** bo'limi bo'lib, undan boshqa hujjatlarga o'tish mumkin. Agar siz loyihaga yangi qo'shilgan dasturchi bo'lsangiz, quyidagi [Tezkor boshlash](#tezkor-boshlash) bo'limidagi tartibga amal qiling.

> **Eslatma:** ushbu hujjatlar Markdown formatida. Ularni GitHub'da, VS Code'da yoki istalgan Markdown ko'ruvchida o'qish mumkin. Diagrammalar ASCII shaklida berilgan, alohida vositalar talab qilinmaydi.

---

## Mundarija

Quyidagi jadval barcha hujjatlarni tartib bilan ko'rsatadi. "Kim uchun" ustuni ushbu hujjat birinchi navbatda qaysi rolga foydali ekanini bildiradi (lekin har kim o'qiy oladi).

| # | Hujjat | Tavsif | Kim uchun |
|---|--------|--------|-----------|
| 01 | [Umumiy ko'rinish va arxitektura](./01-umumiy-korinish.md) | Tizim nima qiladi, kim foydalanadi, uch qatlamli arxitektura, texnologiyalar steki va so'rov hayot tsikli | Hammasi |
| 02 | [Backend arxitekturasi](./02-backend-arxitekturasi.md) | Django loyihasi tuzilishi, app'lar, middleware, REST_FRAMEWORK sozlamalari, URL marshrutlash va `common/` qatlami | Backend dev |
| 03 | [Autentifikatsiya va avtorizatsiya](./03-autentifikatsiya.md) | Custom User, JWT (cookie), CookieJWTAuthentication, RevokedToken denylist, rollar/permission, service token va boshqaruv komandalari | Backend dev, DevOps |
| 04 | [Katalog (Catalog)](./04-katalog.md) | Polimorf ma'lumotnoma: CatalogItem/CatalogRelation modellari, serializerlar, endpointlar, seed komandalar | Backend dev |
| 05 | [Bot2 backend domeni — So'rovnoma tizimi](./05-bot2-backend.md) | Roster, Bot2Student, Bot2SurveyResponse, ProgramEnrollment modellari, servis logikasi va so'rovnoma oqimi | Backend dev |
| 06 | [Analitika va Audit](./06-analitika-va-audit.md) | Coverage/employment analitik endpointlari, hisoblash bloklari va AuditLog (log_audit, PII redaction) | Backend dev, Frontend dev |
| 07 | [API ma'lumotnoma](./07-api-malumotnoma.md) | Barcha HTTP endpointlarning to'liq ma'lumotnomasi: metod, yo'l, auth, parametrlar, javob va xato kodlari | Frontend dev, Bot dev |
| 08 | [Telegram bot servisi (Bot 2)](./08-telegram-bot.md) | `bot2_service` (aiogram v3): ishga tushish, FSM holatlari, foydalanuvchi sayohati, katalog keshlash va konfiguratsiya | Bot dev, Backend dev |
| 09 | [Dashboard (Next.js boshqaruv paneli)](./09-dashboard.md) | App Router tuzilishi, API klient (lib/api.ts), autentifikatsiya qatlamlari, sahifalar va o'zbekcha UI | Frontend dev |
| 10 | [Ma'lumotlar modeli (ER diagramma)](./10-malumotlar-modeli.md) | Barcha modellar, ular orasidagi bog'lanishlar, constraintlar, jadval nomlari va migratsiya tarixi | Backend dev, DevOps |
| 11 | [O'rnatish, Deploy va Operatsiya](./11-deploy-va-operatsiya.md) | Lokal/Docker ishga tushirish, Gunicorn, production .env, DB tanlovi, service-token va seed komandalar | DevOps, Backend dev |
| 12 | [Testlar](./12-testlar.md) | Test steki, testlarni ishga tushirish, conftest fixturalari, har bir test fayli va qoplanmagan qismlar | Backend dev |
| 13 | [Ish jarayonlari (End-to-end workflows)](./13-ish-jarayonlari.md) | Asosiy biznes-jarayonlar boshidan oxirigacha: so'rovnoma, login, roster import, enrollment, logout/refresh | Hammasi |

---

## Tezkor boshlash

Loyihaga yangi qo'shilgan dasturchi uchun tavsiya etilgan o'qish tartibi. Hammasi **01** dan boshlanadi, keyin rolga qarab ajraladi.

**1) Hamma uchun (asos):**
1. [01 — Umumiy ko'rinish va arxitektura](./01-umumiy-korinish.md) — katta rasmni tushunish uchun
2. [13 — Ish jarayonlari](./13-ish-jarayonlari.md) — tizim amalda qanday ishlashini ko'rish uchun

**2) Backend dasturchisi uchun:**
1. [02 — Backend arxitekturasi](./02-backend-arxitekturasi.md)
2. [10 — Ma'lumotlar modeli](./10-malumotlar-modeli.md)
3. [03 — Autentifikatsiya](./03-autentifikatsiya.md)
4. [04 — Katalog](./04-katalog.md) va [05 — Bot2 backend domeni](./05-bot2-backend.md)
5. [06 — Analitika va Audit](./06-analitika-va-audit.md)
6. [07 — API ma'lumotnoma](./07-api-malumotnoma.md) va [12 — Testlar](./12-testlar.md)

**3) Frontend (dashboard) dasturchisi uchun:**
1. [09 — Dashboard](./09-dashboard.md)
2. [07 — API ma'lumotnoma](./07-api-malumotnoma.md)
3. [03 — Autentifikatsiya](./03-autentifikatsiya.md) (JWT/cookie va 401→refresh mantig'i)
4. [06 — Analitika va Audit](./06-analitika-va-audit.md) (hisobot endpointlari)

**4) Telegram bot dasturchisi uchun:**
1. [08 — Telegram bot servisi](./08-telegram-bot.md)
2. [05 — Bot2 backend domeni](./05-bot2-backend.md) (submit_survey, roster)
3. [07 — API ma'lumotnoma](./07-api-malumotnoma.md) (bot2 endpointlari, service token)

**5) DevOps / operatsiya uchun:**
1. [11 — O'rnatish, Deploy va Operatsiya](./11-deploy-va-operatsiya.md)
2. [03 — Autentifikatsiya](./03-autentifikatsiya.md) (service token o'rnatish, create_admin)
3. [10 — Ma'lumotlar modeli](./10-malumotlar-modeli.md) (DB tuzilishi, migratsiyalar)

---

## Loyiha tuzilishi

TTPU CRM uchta mustaqil komponentdan iborat, ularning har biri alohida papkada:

```
ttpu_crm/
├── server/              # Django + DRF backend — "haqiqat manbasi" (system of record)
│   ├── crm_server/      #   loyiha sozlamalari, urls.py, wsgi/asgi
│   ├── common/          #   umumiy qatlam: BaseModel, auth, exceptions, pagination
│   ├── authn/           #   User, JWT login/refresh/logout/me, rollar
│   ├── catalog/         #   CatalogItem / CatalogRelation, dasturlar (programs)
│   ├── bot2/            #   roster, student, survey, enrollment domeni
│   ├── analytics/       #   coverage / employment hisobot endpointlari
│   ├── audit/           #   AuditLog (log_audit)
│   └── tests/           #   pytest testlari
│
├── bot2_service/        # Telegram bot (aiogram v3) — standalone, faqat HTTP orqali bog'lanadi
│   └── src/bot2_service/  #   handlers, states, api klient, catalog cache, i18n
│
├── dashboard/           # Next.js (App Router) boshqaruv paneli — o'zbekcha SPA
│   ├── app/             #   sahifalar (surveys, students, enrollments, catalog, analytics)
│   ├── components/      #   UI komponentlar
│   └── lib/             #   api.ts (API klient), auth-context.tsx
│
└── docs/                # <-- siz hozir shu yerdasiz: 01..13 hujjatlar + README.md
```

> Backend `server/` butun tizimning markazi: barcha ma'lumotlar, REST API va analitika shu yerda. Bot va dashboard mustaqil klientlar bo'lib, faqat HTTP (REST + JWT/service token) orqali backend bilan gaplashadi.

---

## Hujjatlar holati

- **Bu hujjatlar (`docs/01..13`) loyihaning HOZIRGI kod holatini aks ettiradi.** Har bir fayl asl kod fayllari va migratsiyalarga qarab tasdiqlangan; kod va eski hujjatlar zid kelganda **kod haqiqat** sifatida olingan.
- **Tizim hozir uchta komponentdan iborat:** backend (`server/`) + Telegram **Bot 2** (`bot2_service/`) + dashboard (`dashboard/`).
- **ESKIRGAN material — o'qimang yoki ehtiyot bo'ling:** loyiha ildizidagi quyidagi eski fayllar **eskirgan** hisoblanadi va ularda mavjud bo'lmagan **"Bot 1"** (`server/bot1`, `/api/v1/bot1`, `SERVICE_TOKEN_BOT1_HASH`) havolalari bor:
  - `PROJECT_DOCUMENTATION.md`
  - ildizdagi `README.md`
  - `DEPLOYMENT.md`
  - `DEPLOYMENT_PM2_SUPERVISOR.md`
  - `SERVICE_TOKEN_QOLLANMA.md`

  Bot 1 kodda olib tashlangan (commit `98dd68c`, migration `server/common/migrations/0002_drop_bot1_tables.py`). `settings.SERVICE_TOKENS` faqat `bot2` kalitini wire qiladi. Shu sababli yangi/yangilangan ma'lumot uchun **doimo shu `docs/` papkasidagi 01..13 hujjatlarga tayaning**, ildizdagi eski fayllarga emas.

---

## Hujjatlar ro'yxati (qisqa)

- [01 — Umumiy ko'rinish va arxitektura](./01-umumiy-korinish.md)
- [02 — Backend arxitekturasi](./02-backend-arxitekturasi.md)
- [03 — Autentifikatsiya va avtorizatsiya](./03-autentifikatsiya.md)
- [04 — Katalog (Catalog)](./04-katalog.md)
- [05 — Bot2 backend domeni](./05-bot2-backend.md)
- [06 — Analitika va Audit](./06-analitika-va-audit.md)
- [07 — API ma'lumotnoma](./07-api-malumotnoma.md)
- [08 — Telegram bot servisi (Bot 2)](./08-telegram-bot.md)
- [09 — Dashboard (Next.js boshqaruv paneli)](./09-dashboard.md)
- [10 — Ma'lumotlar modeli (ER diagramma)](./10-malumotlar-modeli.md)
- [11 — O'rnatish, Deploy va Operatsiya](./11-deploy-va-operatsiya.md)
- [12 — Testlar](./12-testlar.md)
- [13 — Ish jarayonlari (End-to-end workflows)](./13-ish-jarayonlari.md)
