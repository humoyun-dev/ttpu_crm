# BOT2 Service — TTPU Bandlik Markazi Survey & Vakansiya Bot

aiogram 3 asosidagi Telegram bot. Talabalar so'rovnomasini to'ldiradi, vakansiyalarni ko'radi.

## Arxitektura

```
bot2_service/
├── src/bot2_service/
│   ├── main.py              # Asosiy kirish nuqtasi, router'lar ulanadi
│   ├── handlers.py          # So'rovnoma handlerlari (FSM)
│   ├── vacancy_handlers.py  # Vakansiya ko'rish handlerlari
│   ├── states.py            # FSM holatlari
│   ├── keyboards.py         # Telegram klaviatura generatorlari
│   ├── texts.py             # Ko'p tillik matnlar (uz/ru)
│   ├── api.py               # Server bilan HTTP aloqa (httpx)
│   ├── catalog_cache.py     # Katalog ma'lumotlarini keshlash (15 daqiqa TTL)
│   ├── config.py            # Konfiguratsiya (environment variables)
│   ├── storage.py           # DB-based FSM storage (BotFsmState orqali)
│   └── single_instance.py   # Bir bot instance cheklov
```

## Database Modellari

### StudentRoster

Talabaning ro'yxatga olish ma'lumotlari (yo'nalish, kurs).

| Maydon | Tur | Izoh |
|--------|-----|------|
| `student_external_id` | str, unique | Talaba ID (masalan: `sen7115`) |
| `roster_campaign` | str | Kampaniya nomi (default: `"default"`) |
| `program` | FK → CatalogItem | Yo'nalish/dastur |
| `course_year` | int (1–5) | Kurs; 5 = bitiruvchi |
| `is_active` | bool | Faol talaba |
| `birth_date` | date | Tug'ilgan sana (ixtiyoriy) |
| `metadata` | JSON | Qo'shimcha ma'lumotlar |

---

### Bot2Student

Talabaning shaxsiy profili va Telegram ma'lumotlari.

| Maydon | Tur | Izoh |
|--------|-----|------|
| `student_external_id` | str, unique | Talaba ID |
| `roster` | FK → StudentRoster | Bog'langan roster |
| `telegram_user_id` | BigInt | Eng so'nggi faol akkaunt (denormalized) |
| `first_name`, `last_name` | str | Ism-familiya |
| `gender` | choice | `male/female/other/unspecified` |
| `phone` | str | Telefon raqam |
| `language` | choice | `uz` / `ru` |
| `state` | str | Hozirgi FSM holati (DB'da saqlanadi) |
| `consent` | bool | Ma'lumot ulashish roziligi |
| `is_job_seeking` | bool | Ish qidirmoqdami |
| `region` | FK → CatalogItem (region) | Hudud |

---

### Bot2StudentAccount

Bir talabaning bir nechta Telegram akkauntlarini saqlaydi. Manba to'g'rilik shu yerda.

| Maydon | Tur | Izoh |
|--------|-----|------|
| `student` | FK → Bot2Student | Kimga tegishli |
| `telegram_user_id` | BigInt, unique | Bir Telegram akkaunt → bitta talaba |
| `is_active` | bool | `/logout` → `False`, yozuv o'chirilmaydi |
| `last_seen_at` | datetime | Oxirgi faollik |

---

### Bot2SurveyResponse

**Append-only** — har safar yangi yozuv yaratiladi. `idempotency_key` (UUIDv4) ikki marta submit qilishdan himoya qiladi.

| Maydon | Tur | Izoh |
|--------|-----|------|
| `student` | FK → Bot2Student | Javob beruvchi |
| `roster` | FK → StudentRoster | Talaba rosteri |
| `program` | FK → CatalogItem | Yo'nalish |
| `course_year` | int (1–5) | Kurs |
| `survey_campaign` | str | Kampaniya (default: `"default"`) |
| `idempotency_key` | str, unique | UUIDv4 — dedup kalit |
| `employment_status` | str | Ishlaydimi/yo'qmi |
| `employment_company` | str | Ish joyi nomi |
| `employment_role` | str | Lavozim |
| `suggestions` | text | Taklif va fikrlar |
| `consents` | JSON | Roziliklar |
| `answers` | JSON | Qo'shimcha javoblar |
| `submitted_at` | datetime | Yuborilgan vaqt |

---

### Bot2Document

Bot orqali yuklangan hujjatlar.

| Maydon | Tur | Izoh |
|--------|-----|------|
| `student` | FK → Bot2Student | Hujjat egasi |
| `survey` | FK → Bot2SurveyResponse (null) | Qaysi survey bilan bog'liq |
| `doc_type` | choice | `cv` / `certificate` / `employment` |
| `file` | FileField | Fayl (`bot2/docs/%Y/%m/`) |
| `original_filename` | str | Asl fayl nomi |
| `mime_type` | str | MIME turi |
| `file_size` | int | Bayt hajmi |

---

### ProgramEnrollment

Har bir program + course_year uchun jami talaba soni (analytics uchun).

| Maydon | Tur | Izoh |
|--------|-----|------|
| `program` | FK → CatalogItem | Yo'nalish |
| `course_year` | int (1–5) | Kurs |
| `student_count` | int | Jami talabalar |
| `academic_year` | str | Masalan: `"2025-2026"` |
| `campaign` | str | Kampaniya identifikatori |
| `is_active` | bool | Faol holat |

---

### BotFsmState

DB-based FSM storage — bot restart'dan keyin suhbat davom etadi.

| Maydon | Tur | Izoh |
|--------|-----|------|
| `telegram_user_id` | BigInt, unique | Telegram foydalanuvchi |
| `state` | str (null) | Hozirgi FSM holati |
| `data` | JSON | FSM ma'lumotlari |
| `updated_at` | datetime | Oxirgi yangilanish |

---

## Bot Ishlash Jarayoni

### 1. Start va Til Tanlash
```
/start → Til tanlang (O'zbek / Русский)
```

### 2. Identifikatsiya
```
Til → Kontaktni yuboring → Student ID kiriting
```

### 3. Profil Ma'lumotlari
```
Student ID → Ism → Familiya → Jins → Hudud
```

### 4. Ish Holati
```
Hudud → Hozir ishlaymisiz?
├── Ha  → Kompaniya nomi → Lavozim
└── Yo'q → Ish qidirmoqdamisiz?
```

### 5. Taklif va Yuborish
```
→ Taklif va fikrlar → Ma'lumotlarni tasdiqlash → Submit
```
Append-only `Bot2SurveyResponse` yaratiladi.

### 6. Survey Tugagandan Keyin — Asosiy Menyu
```
So'rovnoma muvaffaqiyatli →
  [💼 Vakansiyalar]  [📊 So'rovnomani yangilash]
```

### 7. Vakansiya Ko'rish
```
Vakansiyalar tugmasi → Paginatsiyali ro'yxat (5 ta / sahifa)
← Oldingi | Keyingi → | 📢 Kanalga obuna
```
`VACANCY_REQUIRE_SURVEY=true` bo'lsa — survey to'ldirmagan foydalanuvchiga 403.

---

## API Endpointlar (Server bilan)

Bot `X-SERVICE-TOKEN` headeri bilan server bilan muloqot qiladi.

| Endpoint | Maqsad |
|----------|--------|
| `POST /bot/verify` | `student_external_id` tekshirish |
| `POST /bot/register` | Ro'yxatdan o'tish |
| `POST /bot/logout` | Chiqish |
| `GET  /bot/catalog/items` | Katalog (program, region) |
| `GET  /bot/profile` | Talaba profili |
| `GET  /bot/fsm/<user_id>` | FSM holati |
| `POST /bot/document` | Hujjat yuklash |
| `POST /bot/followup-answer` | Followup javob |
| `POST /bot2/surveys/submit` | So'rovnoma submit |
| `GET  /vacancies/feed` | Vakansiyalar lentasi |

### So'rovnoma Submit — Request

```json
{
  "student_external_id": "sen7115",
  "program_id": "uuid-of-direction",
  "course_year": 4,
  "telegram_user_id": 123456789,
  "username": "john_doe",
  "first_name": "John",
  "last_name": "Doe",
  "gender": "male",
  "phone": "+998901234567",
  "region_id": "uuid-of-region",
  "survey_campaign": "default",
  "employment_status": "Ishlayman",
  "employment_company": "Tech Company",
  "employment_role": "Software Engineer",
  "suggestions": "Takliflar...",
  "answers": { "channel": "instagram" },
  "consents": { "data_usage": true },
  "idempotency_key": "uuid-v4"
}
```

### So'rovnoma Submit — Response

```json
{
  "ok": true,
  "roster": { "program_id": "uuid", "course_year": 4 },
  "response_id": "uuid-of-survey-response"
}
```

**Muhim:** Har safar yangi `Bot2SurveyResponse` yaratiladi (append-only). Bir xil `idempotency_key` ikkinchi marta yuborilsa, 200 qaytadi lekin ikkinchi yozuv yaratilmaydi.

---

## Environment Variables

Barcha servislar bitta root `.env` faylidan o'qiydi:

```env
BOT_TOKEN=<Telegram bot token>
SERVER_BASE_URL=http://server:8000/api/v1
SERVICE_TOKEN=<raw token, sha256 = SERVICE_TOKEN_BOT2_HASH>
DEFAULT_LANGUAGE=uz
```

---

## Ishga Tushirish

### Docker (tavsiya etiladi)

```bash
# Root papkada
docker compose up --build
```

### Lokal (`.venv` + `pip`)

```bash
cd bot2_service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Root .env faylida kerakli o'zgaruvchilar bo'lishi shart
python -m bot2_service.main
```

---

## Ko'p Tillik

`texts.py` faylida barcha matnlar ikki tilda: `uz` (O'zbek) va `ru` (Русский).

---

## Catalog Integration

Bot quyidagi catalog typelardan foydalanadi:
- `direction` / `program` — Yo'nalish tanlash uchun
- `region` — Hudud tanlash uchun

Kesh: 15 daqiqa TTL (`catalog_cache.py`).

---

## Muammolarni Hal Qilish

**Problem:** Catalog bo'sh  
**Yechim:** Admin panelda `direction` va `region` itemlar borligini tekshiring.

**Problem:** Roster topilmayapti  
**Yechim:** `program_id` to'g'ri ekanligini tekshiring; bot avtomatik roster yaratadi.

**Problem:** Bot restart'dan keyin suhbat yo'qoldi  
**Yechim:** `BotFsmState` DB'da saqlanadi — `storage.py` to'g'ri ulanganligini tekshiring.
