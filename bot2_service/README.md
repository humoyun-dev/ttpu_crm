# BOT2 Service - TTPU Alumni Survey Bot

## Umumiy Ma'lumot

BOT2 - bu Turin Politexnika Universiteti Toshkentdagi bitiruvchilar va hozirgi talabalar uchun so'rovnoma botdir. Bot Telegram orqali ishlaydi va talabalarning ish bilan bandligi, taklif va fikrlari haqida ma'lumot to'playdi.

## Arxitektura

```
bot2_service/
├── src/bot2_service/
│   ├── main.py          # Asosiy kirish nuqtasi
│   ├── handlers.py      # Telegram event handlerlar
│   ├── states.py        # FSM (Finite State Machine) holatlari
│   ├── keyboards.py     # Telegram klaviatura generatorlari
│   ├── texts.py         # Ko'p tillik matnlar
│   ├── api.py           # Server bilan aloqa (HTTP client)
│   ├── catalog_cache.py # Katalog ma'lumotlarini keshlash
│   └── config.py        # Konfiguratsiya (environment variables)
```

## Database Modellari

### 1. StudentRoster

**Maqsad**: Talabalaning ro'yxatga olish ma'lumotlari (yo'nalish, kurs).

**Maydonlar**:

- `student_external_id` (str, unique) - Talaba ID (masalan: sen7115)
- `roster_campaign` (str) - Ro'yxatga olish kampaniyasi nomi (default: "default")
- `program` (FK → CatalogItem) - Yo'nalish/dastur (masalan: Production Engineering)
- `course_year` (int, 1-4) - Kurs (1, 2, 3, yoki 4)
- `is_active` (bool) - Faol talaba yoki yo'qligi
- `metadata` (JSON) - Qo'shimcha ma'lumotlar

**Qanday ishlaydi**:

- Har bir talaba uchun bitta asosiy roster yozuv mavjud
- Bot survey boshlanganda, agar roster topilmasa va `program_id` berilsa - avtomatik yaratiladi
- Roster yozuvi talabaning hozirgi holati (qaysi yo'nalishda, nechanchi kursda) ni saqlaydi

**Misol**:

```json
{
  "student_external_id": "sen7115",
  "program": "direction:Production Engineering",
  "course_year": 4,
  "is_active": true,
  "roster_campaign": "bot2_auto"
}
```

---

### 2. Bot2Student

**Maqsad**: Talabaning shaxsiy ma'lumotlari va Telegram profili.

**Maydonlar**:

- `student_external_id` (str, unique) - Talaba ID
- `roster` (FK → StudentRoster) - Bog'langan roster yozuvi
- `telegram_user_id` (int, unique) - Telegram user ID
- `username` (str) - Telegram username (@...)
- `first_name` (str) - Ism
- `last_name` (str) - Familiya
- `gender` (choice) - Jins: male, female, other, unspecified
- `phone` (str) - Telefon raqam
- `region` (FK → CatalogItem) - Hudud (viloyat)

**Qanday ishlaydi**:

- Har safar talaba botga murojaat qilganda `Bot2Student` yozuvi `update_or_create` orqali yangilanadi
- `student_external_id` va `roster` unique bo'lishi kerak
- Gender va region so'rovnoma jarayonida to'ldiriladi

**Misol**:

```json
{
  "student_external_id": "sen7115",
  "telegram_user_id": 123456789,
  "username": "john_doe",
  "first_name": "John",
  "last_name": "Doe",
  "gender": "male",
  "phone": "+998901234567",
  "region": "region:Toshkent"
}
```

---

### 3. Bot2SurveyResponse

**Maqsad**: So'rovnoma javobi - har safar talaba surveyni yakunlaganda yaratiladi.

**Maydonlar**:

- `student` (FK → Bot2Student) - Javob beruvchi talaba
- `roster` (FK → StudentRoster) - Talaba rosteri
- `program` (FK → CatalogItem) - Yo'nalish
- `course_year` (int, 1-4) - Kurs
- `survey_campaign` (str) - So'rovnoma kampaniyasi (default: "default")
- `employment_status` (str) - Ish holati (ishlayman/o'qiyaman/ishsizman)
- `employment_company` (str) - Ish joyi nomi
- `employment_role` (str) - Lavozimi/kasbi
- `suggestions` (text) - Taklif va fikrlar
- `consents` (JSON) - Roziliklar (masalan: ma'lumotlardan foydalanish)
- `answers` (JSON) - Qo'shimcha javoblar
- `submitted_at` (datetime) - Yuborilgan vaqt

**Muhim**: Yozuv `(student, survey_campaign)` bo'yicha idempotent yangilanadi.

**Qanday ishlaydi**:

- Talaba bir xil kampaniya (`survey_campaign`) bo'yicha qayta yuborsa, mavjud `Bot2SurveyResponse` yozuvi yangilanadi.
- Bu duplicate yozuvlarni kamaytiradi va production analytics natijalarini barqaror qiladi.
- `roster` mavjud bo'lsa, `course_year` rosterdan olinadi (source of truth).

**Misol**:

```json
{
  "student": "Bot2Student<sen7115>",
  "roster": "StudentRoster<sen7115>",
  "program": "direction:Production Engineering",
  "course_year": 4,
  "survey_campaign": "default",
  "employment_status": "Ishlayman",
  "employment_company": "Tech Company",
  "employment_role": "Software Engineer",
  "suggestions": "Amaliyot dasturlarini kuchaytirish kerak",
  "consents": { "data_usage": true },
  "answers": { "channel": "instagram" },
  "submitted_at": "2026-01-19T04:21:59Z"
}
```

---

## Bot Ishlash Jarayoni

### 1. Start va Til Tanlash

```
/start → Til tanlang (O'zbek/Русский/English)
```

- State: `SurveyState.language`

### 2. Student ID va Kontakt

```
Til → Kontaktingizni yuboring → Student ID kiriting
```

- States: `contact`, `student_id`

### 3. Program va Kurs

```
Student ID → Yo'nalishingizni tanlang → Kursni tanlang (1-4)
```

- States: `program`, `course_year`

### 4. Shaxsiy Ma'lumotlar

```
Kurs → Ism → Familiya → Jins → Hudud
```

- States: `first_name`, `last_name`, `gender`, `region`

### 5. Ish holati

```
Hudud → Hozir ishlaymisiz?
├─ Ha → Kompaniya → Lavozim
└─ Yo'q → Ish topishga yordam kerakmi? → Ma'lumot ulashish roziligi
```

- States: `employment_status`, `employment_company`, `employment_role`

### 6. Taklif va Kanal

```
Taklif va fikrlar → Qaysi kanal orqali yangiliklar?
```

- States: `suggestions`, `channel`

### 7. Tasdiqlash va Submit

```
Kanal → Ma'lumotlarni ko'rish → Tasdiqlash → Submit
```

- State: `confirm`
- API: POST /api/v1/bot2/surveys/submit

---

## API Endpoints

### POST /api/v1/bot2/surveys/submit

**Request**:

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
  "consents": { "data_usage": true }
}
```

**Response**:

```json
{
  "ok": true,
  "roster": {
    "program_id": "uuid",
    "course_year": 4
  },
  "response_id": "uuid-of-survey-response"
}
```

**Ishlash logikasi**:

1. `StudentRoster` topiladi yoki yaratiladi (agar `program_id` berilgan bo'lsa)
2. `Bot2Student` `update_or_create` orqali yangilanadi
3. Yangi `Bot2SurveyResponse` **har doim** yaratiladi
4. Audit log yoziladi

---

## O'rnatish va Ishga Tushirish

### Environment Variables

```env
BOT2_TOKEN=your_telegram_bot_token
CRM_SERVER_URL=http://server:8000
CRM_SERVICE_TOKEN=your_service_token_sha256
DASHBOARD_EMAIL=admin@example.com
DASHBOARD_PASSWORD=admin_password
DEFAULT_LANGUAGE=uz
```

### Lokal Ishga Tushirish

```bash
cd bot2_service
poetry install
poetry run python src/bot2_service/main.py
```

### Docker

```yaml
bot2:
  build: ./bot2_service
  environment:
    - BOT2_TOKEN=${BOT2_TOKEN}
    - CRM_SERVER_URL=http://server:8000
    - CRM_SERVICE_TOKEN=${CRM_SERVICE_TOKEN}
  depends_on:
    - server
```

```bash
docker-compose up -d bot2
docker-compose logs -f bot2
```

---

## Ko'p Tillik (i18n)

`texts.py` faylida barcha matnlar 3 tilda:

- `uz` - O'zbek
- `ru` - Русский
- `en` - English

**Funksiya**: `get_text(lang: str, key: str) -> str`

---

## Catalog Integration

Bot quyidagi catalog typelardan foydalanadi:

### DIRECTION (Program)

- Yo'nalishlar ro'yxati (Production Engineering, IT, etc.)

### REGION (Hudud)

- O'zbekiston viloyatlari

**Keshlash**: 900 soniya (15 daqiqa) TTL

---

## Testing

1. Botni toping: `@TTPU_Alumni_bot`
2. `/start` yuboring
3. Barcha qadamlarni bajaring
4. Admin panelda yangi yozuv ko'ring

**Ko'p marta test**:

- Bir student_id bilan bir necha marta to'ldiring
- Har safar yangi `Bot2SurveyResponse` yaratiladi

---

## Xususiyatlar

✅ **Ko'p tillik** - 3 til qo'llab-quvvatlanadi
✅ **Auto-create Roster** - Avtomatik roster yaratish
✅ **Multiple Submissions** - Bir necha marta qatnashish
✅ **Catalog Integration** - Dinamik katalog ma'lumotlari
✅ **Audit Logging** - To'liq audit trail

---

## Yangilanishlar (2026-01-19)

- ✅ Har safar yangi survey response yaratiladi
- ✅ Roster+campaign uniqueness olib tashlandi
- ✅ Admin panelda barcha submissionlar ko'rinadi

---

## Muammolarni Hal Qilish

**Problem**: Ko'p marta to'ldirdim, lekin bitta ko'rsatilmoqda
**Yechim**: Unique constraint olib tashlandi - endi har safar yangi yozuv yaratiladi

**Problem**: Roster topilmayapti
**Yechim**: Program ID to'g'ri ekanligini tekshiring - bot avtomatik roster yaratadi

**Problem**: Catalog bo'sh
**Yechim**: Admin panelda DIRECTION va REGION itemlar mavjudligini tekshiring


## Production
- `SERVER_BASE_URL` ni to'g'ri API domeniga qo'ying (masalan `https://api.example.com/api/v1`).
- `SERVICE_TOKEN` faqat environment orqali boshqarilsin (repo ichiga yozmang).
- Bot service uchun process manager ishlating (systemd/supervisor) va autorestart yoqing.
- Observability uchun container/stdout loglarni markaziy monitoringga yuboring.
