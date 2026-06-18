# TTPU Bandlik Markazi Platformasi — Loyiha hujjati

> Universitet bitiruvchilari va talabalarining bandligini kuzatadigan, amaliyot va ish
> imkoniyatlari bilan bog'laydigan, ish beruvchilar bilan munosabatni boshqaradigan platforma.
> Mavjud CRM tizimi asosida quriladi (roster, so'rovnoma, katalog, analitika qayta ishlatiladi).

---

## 1. Maqsad va fokus

### Maqsad

Universitet bandlik markazining barcha ishini bitta raqamli platformaga yig'ish: talabalarni
ro'yxatga olish va tasdiqlash, bandlikni vaqt bo'yicha kuzatish, hujjatlarni AI yordamida
tekshirish, korxonalar bilan ishlash (CRM) va nomzodlarni ularga taqdim etish.

### Fokus (ustuvorliklar)

1. **Bitiruvchilar bandligini monitoring qilish** — asosiy yadro.
2. **Amaliyot va ish imkoniyatlari** — talabani korxona bilan bog'lash.
3. **Ish beruvchilar CRM'i** — shartnoma, lead, kuzatuv (follow-up).
4. **AI hujjat tekshiruvi** — CV, IELTS va sertifikatlarning haqiqiyligi.

### Fokusdan tashqarida (hozircha)

- To'liq ochiq job-board (har kim e'lon joylaydigan). Vakansiya yengil va markaz nazoratida.
- Korxona uchun to'liq self-service login — korxona faqat maxsus link orqali ko'radi.
- Talaba uchun mobil ilova — kanal Telegram bot.

### Asosiy tamoyillar

- **Roster — haqiqat manbai.** Talaba ma'lumoti `student_id` + tug'ilgan sana bo'yicha tasdiqlanadi.
- **Bandlik — append-only.** Har so'rov yangi snapshot; tarix o'chmaydi.
- **AI — yakuniy hakam emas.** Shubhali hujjatlar insonga boradi.
- **Markaz — markaziy bo'g'in.** Korxona arizalarni to'g'ridan-to'g'ri olmaydi; xodim filtrlab uzatadi.
- **Maxfiylik.** Rozilik, cheklangan ko'rinish, audit, tokenli link.

---

## 2. Arxitektura

To'rt mustaqil komponent bitta backend atrofida ishlaydi. Bot va dashboard backend bilan
faqat HTTP orqali gaplashadi; AI ham backend chaqiradigan alohida servis.

```
        Telegram (talaba)              Web brauzer (xodim / korxona)
              │                                   │
              ▼                                   ▼
        ┌───────────┐                       ┌───────────┐
        │  Bot      │                       │ Dashboard │
        │ (aiogram) │                       │ (Next.js) │
        └─────┬─────┘                       └─────┬─────┘
              │   HTTP API                        │ HTTP API
              └───────────────┬───────────────────┘
                              ▼
                     ┌──────────────────┐        ┌──────────────┐
                     │  Backend         │◄──────►│  AI servisi  │
                     │  (Django + DRF)  │        │ (hujjat tek.)│
                     └────────┬─────────┘        └──────────────┘
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
            ┌──────────┐           ┌──────────────┐
            │ Excel    │           │ PostgreSQL   │
            │ roster   │──import──►│ (baza)       │
            └──────────┘           └──────────────┘
```

| Komponent | Mas'uliyat | Texnologiya |
|---|---|---|
| Bot | Onboarding, tasdiqlash, so'rovnoma, hujjat qabul, follow-up, bildirishnoma | aiogram v3 (FSM) |
| Dashboard | Monitoring, hisobot, CRM/lead, hujjat ko'rik | Next.js (App Router) |
| Backend | Biznes-mantiq, API, auth, roster import, scheduler | Django 5 + DRF |
| AI servisi | Hujjat o'qish + soxtalik tahlili | Mustaqil HTTP servis |
| Baza | Barcha doimiy ma'lumot | PostgreSQL |
| Scheduler | Follow-up 2/5/7 kun kadensi | Celery beat / cron |

Batafsil komponent va ma'lumotlar modeli diagrammalari alohida "Arxitektura va logika"
hujjatida (`docs/01-architecture.md`).

---

## 3. Papka strukturasi (monorepo)

```
ttpu-career-center/
├── server/                       # Django backend
│   ├── config/
│   │   ├── settings/             # base.py · dev.py · prod.py
│   │   ├── urls.py
│   │   └── celery.py             # scheduler ulanishi (follow-up)
│   ├── common/                   # BaseModel · service-token auth · AuditLog · mixins
│   │   ├── models.py
│   │   ├── auth.py
│   │   └── pagination.py
│   ├── authn/                    # staff User + JWT
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── views.py
│   │   └── urls.py
│   ├── catalog/                  # CatalogItem (program/direction/region/skill/industry)
│   │   ├── models.py
│   │   └── seed.py
│   ├── roster/                   # StudentRoster + Excel import
│   │   ├── models.py
│   │   ├── importer.py           # xlsx parse · bulk upsert · sana normalizatsiyasi
│   │   └── views.py
│   ├── students/                 # Student · Document
│   │   ├── models.py
│   │   ├── verification.py       # student_id + birth_date solishtirish
│   │   ├── serializers.py
│   │   └── views.py
│   ├── survey/                   # EmploymentRecord (snapshot)
│   │   ├── models.py
│   │   └── views.py
│   ├── employers/                # Employer
│   │   ├── models.py
│   │   └── views.py
│   ├── crm/                      # Lead · LeadStudent · AccessLink · AccessLog · FollowUp
│   │   ├── models.py
│   │   ├── access.py             # public link ko'rinishi
│   │   ├── followup.py           # 2/5/7 kun kadens mantig'i
│   │   ├── tasks.py              # celery beat joblari
│   │   └── views.py
│   ├── analytics/                # modelsiz hisobotlar
│   │   ├── views.py              # employment · coverage · students-by-direction
│   │   └── export.py             # xlsx eksport
│   ├── ai_gateway/               # AI servisiga yupqa klient
│   │   └── client.py
│   ├── manage.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── bot/                          # aiogram v3 servis
│   ├── handlers/                 # start · onboarding · survey · documents · menu · followup
│   ├── states/                   # FSM holatlar guruhi
│   ├── keyboards/                # inline / reply tugmalar
│   ├── services/                 # backend API klienti (httpx)
│   ├── middlewares/
│   ├── i18n/                     # uz.json · ru.json
│   ├── main.py
│   └── Dockerfile
│
├── ai_service/                   # mustaqil AI hujjat servisi
│   ├── app.py                    # POST /ai/document/analyze
│   ├── extractor.py              # OCR / multimodal o'qish
│   ├── fraud.py                  # tahrirlash / anomaliya tahlili
│   └── Dockerfile
│
├── dashboard/                    # Next.js (App Router)
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── dashboard/            # boshqaruv paneli
│   │   ├── students/
│   │   ├── reports/              # yo'nalish bo'yicha hisobot
│   │   ├── leads/                # CRM kanban
│   │   ├── employers/
│   │   ├── documents/            # hujjat ko'rik navbati
│   │   └── l/[token]/            # korxona public ko'rinishi
│   ├── components/
│   ├── lib/                      # api client · auth
│   ├── locales/
│   └── package.json
│
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   └── .env.example
│
├── docs/
│   ├── 00-overview.md
│   ├── 01-architecture.md
│   ├── 02-data-model.md
│   ├── 03-bot-flow.md
│   ├── 04-api.md
│   └── 05-tasks.md
│
└── README.md
```

---

## 4. Asosiy vazifalar (main tasks)

Bosqichma-bosqich; har bosqich mustaqil natija beradi.

### Faza 0 — Asos
- [ ] Repo va `docker-compose` (server, bot, ai_service, dashboard, postgres) sozlash.
- [ ] `common` (BaseModel, service-token auth, AuditLog), `authn` (User + JWT), `catalog` (yangi `skill`/`industry` turlari).
- [ ] `roster` app + Excel import: bulk upsert (`student_id` bo'yicha), sana normalizatsiyasi.

### Faza 1 — Bot onboarding va tasdiqlash
- [ ] `students.Student` modeli va FSM holatlar.
- [ ] Bot oqimi: til → telefon → student ID → tug'ilgan sana → tasdiqlash → hudud → yo'nalish → kurs → ish holati.
- [ ] `/bot/verify` (student_id + sana) va `/bot/register` (rozilik bilan).
- [ ] Idempotentlik: `telegram_id` va `student_id` unique; qayta `/start` davom ettiradi.
- [ ] i18n (uz/ru) barcha matnlar.

### Faza 2 — So'rovnoma, monitoring va hisobot
- [ ] `survey.EmploymentRecord` (append-only); `/bot/survey/submit`; menyudan qayta to'ldirish.
- [ ] Analitika: bandlik darajasi, ishga joylashish muddati, qamrov.
- [ ] **Yo'nalish bo'yicha hisobot** (jami / ro'yxatdan o'tgan / ishlayotgan) + Excel eksport.

### Faza 3 — Hujjatlar va AI
- [ ] `students.Document` (CV/IELTS/sertifikat); `/bot/document` yuklash (format/hajm cheklovi).
- [ ] AI servisi: `/ai/document/analyze` (o'qish + soxtalik bali).
- [ ] Holat mantig'i: green → tasdiqlangan; yellow/red → xodim ko'rigiga.
- [ ] Dashboard'da hujjat ko'rik navbati.

### Faza 4 — Korxonalar, CRM lead va follow-up
- [ ] `employers.Employer` (MOU, kontakt, logotip, tavsif).
- [ ] `crm`: `Lead`, `LeadStudent`, `AccessLink`, `AccessLog`.
- [ ] Lead pipeline (yaratildi → yuborildi → ko'rilmoqda → tanlandi → yopildi) + kanban UI.
- [ ] Public `/l/{token}` ko'rinishi: faqat tasdiqlangan hujjatli, ish izlovchi nomzodlar; telefon yashirin.
- [ ] **FollowUp + scheduler**: uzatilgach 2/5/7 kun kadensli kuzatuv (aloqa → suhbat), 3× dan keyin xodimga.
- [ ] Joylashtirilganda avtomatik `EmploymentRecord` (monitoringga oziq).

### Faza 5 — Vakansiya va bildirishnoma (ixtiyoriy)
- [ ] `Vacancy` + ariza; botda mos talabalarga avtomatik bildirishnoma.

### Ko'ndalang (har fazada)
- [ ] DB-darajasidagi unique cheklovlar va migratsiyalar.
- [ ] Audit jurnali (login, hujjat qarori, lead uzatish, link ochilishi).
- [ ] Testlar va deploy.

---

### Kelishilgan standartlar (qaror sifatida qotirilgan)
- Tug'ilgan sana formati: `kun.oy.yil`.
- `course_year` diapazoni: yagona (1..5) — import, model va submit bir xil.
- Hudud / yo'nalish / kurs talabadan so'raladi (mahsulot qarori).
- Follow-up: 3-marta "Yo'q"dan keyin to'xtaydi va xodimga bayroqlanadi.
- Har lead uchun alohida, muddatli, bekor qilinadigan access link.

---

## 5. Modul logikalari

Har modul uchun: **maqsad**, **logika** va **kirish → chiqish** (endpoint, so'rov, javob va kim oladi: `bot` / `dashboard` / `korxona`). JSON namunaviy.

### 5.1. Onboarding / Tasdiqlash

**Maqsad:** talabani roster bo'yicha tasdiqlab, profil yaratish.

**Logika:**
- `student_id` + tug'ilgan sana roster bilan solishtiriladi.
- Mos kelsa → profil yaratiladi, `telegram_id` bog'lanadi; mos kelmasa → 3 martagacha qayta urinish, so'ng xodimga.
- Rozilik (`consent`) olinmaguncha ro'yxat yopilmaydi.

**Kirish → chiqish:**
```
POST /api/bot/verify            (bot)
req : { "student_id": "U2021345", "birth_date": "14.03.2003" }
resp: { "match": true, "roster": { "full_name": "Diyora Karimova" } }
      // mos kelmasa: { "match": false, "attempts_left": 2 }

POST /api/bot/register          (bot)
req : { "telegram_id": 12345, "language": "uz", "phone": "+998...",
        "student_id": "U2021345", "region_id": "...", "program_id": "...",
        "course_year": 4, "consent": true }
resp: { "id": "stu_...", "state": "registered" }
```

### 5.2. So'rovnoma (bandlik)

**Maqsad:** bandlikni vaqt bo'yicha kuzatish (snapshot).

**Logika:**
- Har topshiruv eski yozuvni o'zgartirmaydi — **yangi `EmploymentRecord`** yaratadi.
- `is_employed=false` va ish izlasa → `Student.is_job_seeking=true`.
- Qayta to'ldirish menyudan istalgancha mumkin.

**Kirish → chiqish:**
```
POST /api/bot/survey/submit     (bot)
req : { "telegram_id": 12345, "is_employed": true,
        "company": "Artel", "role": "Muhandis" }
resp: { "record_id": "emp_...", "captured_at": "2026-06-18T09:00:00Z",
        "total_records": 3 }     // shu talabaning nechanchi snapshoti
```

### 5.3. Hujjatlar + AI tekshiruvi

**Maqsad:** CV/IELTS/sertifikatni qabul qilib, haqiqiyligini tekshirish.

**Logika:**
- Yuklanganda `status="pending"` → AI'ga asinxron yuboriladi.
- AI javobiga qarab: `green` → `verified` (avtomatik); `yellow`/`red` → `flagged` (xodim navbatiga).
- Korxonaga faqat `verified` hujjat ko'rinadi.

**Kirish → chiqish:**
```
POST /api/bot/document          (bot)
req : multipart { telegram_id, type: "ielts", file }
resp: { "document_id": "doc_...", "status": "pending" }   // bot: "qabul qilindi, tekshirilmoqda"

POST /ai/document/analyze       (backend → AI servisi)
resp: { "extracted": {...}, "fraud_score": 0.08,
        "recommendation": "green", "flags": [] }

GET  /api/documents?status=flagged   (dashboard — ko'rik navbati)
resp: [ { "id": "doc_...", "student": "Aziz K.", "type": "ielts",
          "ai_result": { "recommendation": "red", "flags": ["edited_image"] } } ]
```

### 5.4. Vakansiya

**Maqsad:** ish e'lonlarini talabaga yetkazish; ariza markaz orqali.

**Logika:**
- Vakansiyani xodim yaratadi (`status`, target dastur/ko'nikma, muddat bilan).
- Bot talabaga **faqat mos va faol** vakansiyalarni ko'rsatadi (yo'nalish/ko'nikma bo'yicha filtr).
- Ariza korxonaga emas, **markazga** boradi (markaz filtrlaydi).

**Ma'lumot:** `Vacancy { employer, title, requirements, target_programs[], skills[], deadline, status }`, `Application { vacancy, student, status }`.

**Kirish → chiqish:**
```
GET  /api/bot/vacancies?telegram_id=12345     (bot)
resp: [ { "id": "vac_...", "title": "Backend dasturchi",
          "employer": "EPAM", "deadline": "2026-07-01" } ]

POST /api/bot/vacancies/vac_.../apply         (bot)
req : { "telegram_id": 12345 }
resp: { "application_id": "app_...", "status": "submitted" }   // markazga tushadi

POST /api/vacancies                            (dashboard — xodim yaratadi)
```

### 5.5. Lead / CRM

**Maqsad:** korxonaga nomzodlar to'plamini taqdim etish va pipeline'da kuzatish.

**Logika:**
- Xodim lead yaratib, ~10 talabani va korxonani biriktiradi.
- "Yuborish"da alohida `AccessLink` (token) hosil bo'ladi, holat `sent`.
- Holatlar: `created → sent → viewing → selected → closed`.

**Kirish → chiqish:**
```
POST /api/leads                  (dashboard)
req : { "employer_id": "...", "title": "Backend dasturchilar",
        "student_ids": ["stu_1", "stu_2", ...] }
resp: { "lead_id": "lead_...", "status": "created" }

POST /api/leads/lead_.../send    (dashboard)
resp: { "access_url": "https://.../l/3f9c...", "expires_at": "2026-07-18",
        "status": "sent" }       // xodim shu linkni korxonaga beradi
```

### 5.6. Korxona ko'rinishi (maxsus link)

**Maqsad:** korxona login'siz, faqat o'ziga ajratilgan nomzodlarni ko'rsin.

**Logika:**
- Token tekshiriladi (muddat, bekor qilinmaganlik); ochilish `AccessLog`ga yoziladi, holat `viewing`.
- Faqat `verified` hujjat ko'rinadi; telefon `forwarded` bo'lmaguncha yashirin.
- Korxona qiziqqanini belgilaydi → holat `selected`; rasmiy uzatishni xodim qiladi.

**Kirish → chiqish:**
```
GET  /l/{token}                  (korxona)
resp: { "lead_title": "Backend dasturchilar", "employer": "EPAM",
        "students": [ { "name": "Jasur T.", "program": "IT", "course": 3,
          "documents": [ { "type": "cv", "status": "verified" },
                         { "type": "ielts", "status": "verified" } ],
          "phone": null } ] }    // telefon: null (yashirin)

POST /l/{token}/interest         (korxona)
req : { "student_ids": ["stu_2"] }
resp: { "ok": true, "lead_status": "selected" }
```

### 5.7. Follow-up (kuzatuv)

**Maqsad:** uzatilgandan keyin natijani kuzatish.

**Logika:**
- Uzatilgach xabar + `next_send_at = +2 kun`.
- Scheduler vaqti kelganda botga savol yubortiradi; "Yo'q" bo'lsa keyingi oraliq (2 → 5 → 7 kun), 3× dan keyin to'xtab xodimga bayroqlanadi.
- Ikki bosqich: `contacted` (aloqa) → `interviewed` (suhbat) → `done`.

**Kirish → chiqish:**
```
(scheduler → bot: "Aloqaga chiqdimi?")

POST /api/bot/followup/answer    (bot)
req : { "follow_up_id": "fu_...", "answer": true }
resp: { "stage": "interviewed", "next_question": "Suhbat bo'ldimi?" }
      // yakun: { "stage": "done", "outcome": "interviewed", "message": "..." }
      // 3x yo'q: { "stage": "done", "outcome": "no_contact", "flagged_for_staff": true }
```

### 5.8. Hisobot (analitika)

**Maqsad:** yo'nalish bo'yicha jami / ro'yxatdan o'tgan / ishlayotgan ko'rsatkichlari.

**Logika:**
- `total` — `StudentRoster` (program bo'yicha guruh); `registered` — `Student`; `employed` — oxirgi `EmploymentRecord`.
- Qamrov = registered/total; bandlik darajasi = employed/registered.

**Kirish → chiqish:**
```
GET  /api/analytics/students-by-direction        (dashboard)
resp: [ { "program_name": "Mexatronika", "total": 312,
          "registered": 240, "employed": 145 } ]

GET  /api/analytics/students-by-direction.xlsx    (dashboard — Excel eksport)
```
