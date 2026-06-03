# Bot2 Backend Domeni — So'rovnoma Tizimi

Bu hujjat TTPU CRM tizimining yuragi bo'lgan **`bot2`** Django ilovasini batafsil yoritadi. `bot2` ilovasi talabalar ro'yxati (roster), bot orqali ro'yxatdan o'tgan talabalar (Bot2Student), so'rovnoma javoblari (Bot2SurveyResponse) va dasturlar bo'yicha qamrov hisobi (ProgramEnrollment) modellarini hamda ularning biznes-logikasini boshqaradi. Telegram bot aynan shu domen bilan `POST /api/v1/bot2/surveys/submit` endpointi orqali muloqot qiladi.

Hujjat loyihaga yangi qo'shilgan dasturchiga mo'ljallangan: u har bir model, servis funksiyasi va endpointni o'qib chiqib, butun so'rovnoma oqimini tushunishi mumkin. Barcha fayl yo'llari `/Users/mac/projects/ttpu_crm/server/bot2/` ostida joylashgan.

---

## 1. Umumiy ko'rinish

`bot2` domeni 4 ta asosiy modeldan iborat. Ularning o'zaro bog'lanishi quyidagicha:

```
                  CatalogItem (catalog ilovasi)
                  type=program/direction   type=region
                         ▲                       ▲
                         │ program FK            │ region FK (SET_NULL)
                         │                        │
   ┌──────────────┐      │     ┌──────────────┐   │
   │ StudentRoster│──────┘     │ Bot2Student  │───┘
   │ (manba: kim  │            │ (TG profil)  │
   │  qaysi prog/ │◀───────────│ roster FK    │
   │  kursda)     │  CASCADE   │ (CASCADE)    │
   └──────┬───────┘            └──────┬───────┘
          │                            │
          │ roster FK (CASCADE)        │ student FK (CASCADE)
          │                            │
          ▼                            ▼
        ┌─────────────────────────────────┐
        │      Bot2SurveyResponse          │
        │  (so'rovnoma javobi; program/    │
        │   course_year denormalizatsiya)  │
        └─────────────────────────────────┘

   ┌──────────────────────────────────────┐
   │ ProgramEnrollment                     │  coverage maxraji
   │ program + course_year + academic_year │  (jami talaba soni)
   │ + campaign  → student_count           │
   └──────────────────────────────────────┘
```

Mantiqiy taqsimot:

| Model | Vazifasi |
|-------|----------|
| `StudentRoster` | Talabaning **program** va **course_year** bo'yicha rasmiy manbai (haqiqat manbai). |
| `Bot2Student` | Telegram bot orqali ro'yxatdan o'tgan talabaning profili (region, jins, telefon). |
| `Bot2SurveyResponse` | Talabaning bitta kampaniyadagi so'rovnoma javobi. |
| `ProgramEnrollment` | Har bir dastur + kurs uchun jami talaba soni — qamrov foizini (coverage) hisoblash uchun maxraj. |

Barcha modellar `common.models:BaseModel` dan meros oladi, ya'ni har birida:
- `id` — `UUIDField` (primary key, `uuid4`, tahrirlab bo'lmaydi),
- `created_at` — `auto_now_add`,
- `updated_at` — `auto_now`.

Ilova konfiguratsiyasi: `server/bot2/apps.py:Bot2Config` (`verbose_name = "Bot 2 - Student Surveys"`).

---

## 2. Modellar (`server/bot2/models.py`)

### 2.1. StudentRoster

Talabaning dastur va kurs bo'yicha rasmiy ro'yxati. So'rovnoma tizimida **haqiqat manbai** (source of truth) hisoblanadi: `program` va `course_year` aynan shu yerdan olinadi.

| Maydon | Tip | Tafsilot |
|--------|-----|----------|
| `student_external_id` | `CharField(max_length=100, unique=True)` | Tashqi tizimdagi talaba ID (masalan, universitet bazasidagi raqam). Yagona (unique). |
| `roster_campaign` | `CharField(max_length=64, default="default")` | Ro'yxat qaysi kampaniyada import qilinganini bildiradi. |
| `program` | `FK(CatalogItem, on_delete=PROTECT, related_name="roster_programs")` | Dastur. O'chirishdan himoyalangan (PROTECT). |
| `course_year` | `PositiveSmallIntegerField`, validatorlar `MinValueValidator(1)`, `MaxValueValidator(5)` | Kurs. `help_text`: "1-4 for active students, 5 for graduated". |
| `is_active` | `BooleanField(default=True)` | Faol talabami. |
| `metadata` | `JSONField(default=dict, blank=True)` | Qo'shimcha erkin ma'lumotlar. |

**Meta:** `ordering = ("student_external_id",)`; indekslar `program`, `course_year`, `is_active`, `roster_campaign` ustida.

**`clean()` tekshiruvi:** `program` albatta `CatalogItem.ItemType.PROGRAM` tipida bo'lishi shart, aks holda `ValidationError` ("program must reference a catalog item with type=program."). E'tibor bering: bu tekshiruv faqat `program` tipini ruxsat etadi, `direction` tipini emas (servislardagi `get_program` bilan tafovut — pastdagi 5.1-bo'limga qarang).

> Diqqat: `StudentRoster.save()` qayta yozilmagan — `full_clean()` avtomatik chaqirilmaydi. `clean()` faqat `services.upsert_roster_row` ichidan aniq `full_clean()` chaqirilganda ishlaydi (4.2-bo'limga qarang).

### 2.2. Bot2Student

Telegram bot orqali ro'yxatdan o'tgan talabaning profili.

`Gender` — `TextChoices`: `MALE` ("male"), `FEMALE` ("female"), `OTHER` ("other"), `UNSPECIFIED` ("unspecified", default).

| Maydon | Tip | Tafsilot |
|--------|-----|----------|
| `student_external_id` | `CharField(max_length=100, unique=True)` | Roster bilan bog'lash uchun tashqi ID. |
| `roster` | `FK(StudentRoster, on_delete=CASCADE, related_name="students")` | Tegishli roster. Roster o'chsa, student ham o'chadi. |
| `telegram_user_id` | `BigIntegerField(null=True, blank=True, unique=True)` | Telegram foydalanuvchi ID. Yagona. |
| `username` | `CharField(max_length=150, blank=True)` | Telegram username. |
| `first_name` / `last_name` | `CharField(max_length=150, blank=True)` | Ism / familiya. |
| `gender` | `CharField(max_length=32, choices=Gender.choices, default=UNSPECIFIED)` | Jins. |
| `phone` | `CharField(max_length=50, blank=True)` | Telefon. |
| `region` | `FK(CatalogItem, on_delete=SET_NULL, null=True, blank=True, related_name="bot2_students")` | Hudud. Region o'chsa, NULL bo'ladi. |

**Meta:** `ordering = ("student_external_id",)`; indekslar `student_external_id`, `telegram_user_id` ustida.

**`clean()`:** `region` mavjud bo'lsa, u `CatalogItem.ItemType.REGION` tipida bo'lishi shart.

**`save()`** qayta yozilgan: har safar `self.full_clean()` chaqiriladi, ya'ni saqlashdan oldin `clean()` va maydon validatorlari ishlaydi.

### 2.3. Bot2SurveyResponse

Bitta talabaning bitta kampaniyadagi so'rovnoma javobi. `program` va `course_year` bu yerda **denormalizatsiya** qilingan — ya'ni roster'dan nusxalanadi, bu analitik so'rovlarni tezlashtiradi.

| Maydon | Tip | Tafsilot |
|--------|-----|----------|
| `student` | `FK(Bot2Student, on_delete=CASCADE, related_name="survey_responses")` | Javob bergan talaba. |
| `roster` | `FK(StudentRoster, on_delete=CASCADE, related_name="survey_responses")` | Tegishli roster. |
| `program` | `FK(CatalogItem, on_delete=PROTECT, related_name="bot2_program_surveys")` | Dastur (roster'dan denormalizatsiya). |
| `course_year` | `PositiveSmallIntegerField`, `MinValueValidator(1)`, `MaxValueValidator(5)` | Kurs (roster'dan denormalizatsiya). |
| `survey_campaign` | `CharField(max_length=64, default="default")` | Kampaniya identifikatori. |
| `employment_status` | `CharField(max_length=100, blank=True)` | Bandlik holati. |
| `employment_company` | `CharField(max_length=255, blank=True)` | Kompaniya. |
| `employment_role` | `CharField(max_length=255, blank=True)` | Lavozim. |
| `suggestions` | `TextField(blank=True)` | Taklif/mulohazalar. |
| `consents` | `JSONField(default=dict, blank=True)` | Roziliklar (masalan, ma'lumotlardan foydalanishga rozilik). |
| `answers` | `JSONField(default=dict, blank=True)` | So'rovnomaning erkin/dinamik javoblari. |
| `submitted_at` | `DateTimeField(null=True, blank=True)` | Topshirilgan vaqt. |

**Meta:**
- `ordering = ("-submitted_at", "-created_at")` — eng yangi javoblar birinchi.
- **CheckConstraint** `survey_course_year_between_1_and_5`: `Q(course_year__gte=1) & Q(course_year__lte=5)` — DB darajasida 1..5 oralig'ini kafolatlaydi.
- Indekslar: `survey_campaign`, `submitted_at`, hamda kompozit `["roster", "survey_campaign"]`.

**`clean()` — uchta uyg'unlik tekshiruvi:**
1. `roster` va `student` bo'lsa, `student.roster_id == roster_id` bo'lishi shart, aks holda "Survey roster must match student's roster."
2. `roster` va `program_id` bo'lsa, `roster.program_id == program_id` bo'lishi shart, aks holda "Survey program must match roster program."
3. `roster` va `course_year` bo'lsa, `roster.course_year == course_year` bo'lishi shart, aks holda "Survey course_year must match roster course_year."

**`save()`** qayta yozilgan: har safar `self.full_clean()` chaqiriladi. Demak yuqoridagi 3 ta tekshiruv va CheckConstraint validatsiyasi har saqlashda majburiy ishlaydi.

> **MUHIM ESLATMA — DB unique constraint yo'q.** `Bot2SurveyResponse` modelida `(student, survey_campaign)` bo'yicha hech qanday `unique_together` yoki `UniqueConstraint` yo'q. Idempotentlik faqat ilova darajasida, `submit_survey` view ichidagi `update_or_create(student=..., survey_campaign=...)` orqali ta'minlanadi. Agar bir vaqtning o'zida (race condition) yoki boshqa yo'l bilan ikkita javob yaratilsa, ma'lumotlar bazasi buni to'sib qola olmaydi — dublikat hosil bo'lishi mumkin.

### 2.4. ProgramEnrollment

Har bir dastur + kurs + o'quv yili + kampaniya kesimida **jami talaba sonini** saqlaydi. Bu son qamrov foizini (coverage) hisoblashda **maxraj** vazifasini bajaradi.

| Maydon | Tip | Tafsilot |
|--------|-----|----------|
| `program` | `FK(CatalogItem, on_delete=PROTECT, related_name="enrollments")` | Dastur. |
| `course_year` | `PositiveSmallIntegerField`, `MinValueValidator(1)`, `MaxValueValidator(5)` | Kurs. |
| `student_count` | `PositiveIntegerField(default=0)` | Jami talaba soni (maxraj). |
| `academic_year` | `CharField(max_length=20, default="2025-2026")` | O'quv yili. |
| `campaign` | `CharField(max_length=64, default="default")` | Kampaniya. |
| `is_active` | `BooleanField(default=True)` | Faol yozuvmi. |
| `notes` | `TextField(blank=True)` | Izohlar. |

**Meta:**
- `ordering = ("program", "course_year")`.
- **`unique_together = [["program", "course_year", "academic_year", "campaign"]]`** — bir dastur + kurs + o'quv yili + kampaniya uchun faqat bitta yozuv bo'lishi mumkin.
- Indekslar: `["program", "course_year"]`, `academic_year`, `campaign`, `is_active`.

`__str__`: `f"{program.name} - {course_year}-kurs: {student_count}"`.

---

## 3. Serializerlar (`server/bot2/serializers.py`)

Barcha serializerlar `ModelSerializer` bo'lib, `fields = "__all__"` ishlatadi. Ko'pchiligida bog'langan `CatalogItem` ma'lumotlari `*_details` ko'rinishida joylab beriladi.

**`CatalogItemNestedSerializer`** — yordamchi, faqat `["id", "code", "name", "name_uz", "name_ru", "name_en", "type"]` maydonlarini chiqaradi.

| Serializer | Qo'shimcha maydonlar | Eslatma |
|------------|----------------------|---------|
| `StudentRosterSerializer` | `program_details` (nested, read-only) | — |
| `Bot2StudentSerializer` | `region_details` (nested, read-only) | `read_only_fields = ("roster",)` — roster API orqali o'zgartirilmaydi. |
| `Bot2SurveyResponseSerializer` | `student_details` (`SerializerMethodField` → to'liq `Bot2StudentSerializer`), `program_details` | — |
| `ProgramEnrollmentSerializer` | `program_details` (sodda dict: id/name/code), `responded_count` (int, read-only), `coverage_percent` (method) | Quyidagi maxsus mantiq. |

### 3.1. coverage_percent hisoblanishi

`ProgramEnrollmentSerializer.get_coverage_percent`:
- `total = obj.student_count or 0`
- `responded = getattr(obj, "responded_count", 0) or 0` — bu qiymat viewset annotatsiyasidan keladi (4.4-bo'limga qarang).
- `total == 0` bo'lsa → `0.0`.
- Aks holda → `round(responded * 100.0 / total, 2)`.

Ya'ni: **javob bergan unikal roster soni / jami talaba soni × 100**, ikki kasr aniqligida.

---

## 4. Endpointlar va Viewlar (`server/bot2/views.py`)

URL marshrutizatsiyasi `server/crm_server/urls.py` da, barchasi `/api/v1/` prefiksi ostida. ViewSetlar `DefaultRouter` orqali, ikkita maxsus endpoint (`import`, `submit`) alohida `path()` orqali ro'yxatdan o'tgan.

### 4.1. ViewSetlar (read-oriented)

To'rt ViewSet ham `viewsets.ModelViewSet` bo'lsa-da, dashboard foydalanuvchilari uchun amalda asosan o'qish (read) uchun ishlatiladi:

```
GET/POST/PUT/PATCH/DELETE  /api/v1/bot2/roster        Bot2StudentRosterViewSet
GET/POST/PUT/PATCH/DELETE  /api/v1/bot2/students      Bot2StudentViewSet
GET/POST/PUT/PATCH/DELETE  /api/v1/bot2/surveys       Bot2SurveyResponseViewSet
GET/POST/PUT/PATCH/DELETE  /api/v1/bot2/enrollments   ProgramEnrollmentViewSet
```

Hammasining ruxsati: `permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]`. `IsViewerOrAdminReadOnly` (`common.permissions`) viewer rolidagi foydalanuvchiga faqat `GET/HEAD/OPTIONS`, admin rolidagiga to'liq huquq beradi. `serializer_class` har birida `None` qilib qo'yilgan va `get_serializer_class()` ichida kech (lazy) import orqali aniqlanadi — bu aylanma importlardan saqlaydi.

Filterlash uchun barchasida `DjangoFilterBackend`, `SearchFilter`, `OrderingFilter` ulangan:

| ViewSet | `queryset` (select_related) | `filterset_fields` | `search_fields` | `ordering_fields` |
|---------|------------------------------|---------------------|------------------|--------------------|
| `Bot2StudentRosterViewSet` | `program` | `program, course_year, is_active, roster_campaign` | `student_external_id` | `student_external_id, course_year, created_at` |
| `Bot2StudentViewSet` | `roster, region` | `gender, region` | `student_external_id, username, first_name, last_name` | `created_at` |
| `Bot2SurveyResponseViewSet` | `student, student__region, roster, program` | `program, course_year, survey_campaign` | `student__student_external_id, student__username` | `submitted_at, created_at` |
| `ProgramEnrollmentViewSet` | `program` (+ annotate) | `program, course_year, academic_year, campaign, is_active` | `program__name, notes` | `course_year, student_count, created_at` |

`Bot2StudentRosterViewSet` va `ProgramEnrollmentViewSet` da `perform_create / perform_update / perform_destroy` qayta yozilib, har bir o'zgarish `audit.utils.log_audit` orqali audit jurnaliga yoziladi (`actor_type="user"`).

### 4.2. Surveys: `?from` va `?to` sana filtri

`Bot2SurveyResponseViewSet.get_queryset()` query parametrlarini o'qiydi:
- `from` — `submitted_at >= dt`,
- `to` — `submitted_at <= dt`,

bu yerda `dt = common.time.parse_iso_datetime(...)`. Parslab bo'lmasa, shart e'tiborga olinmaydi (filtr qo'shilmaydi).

```bash
GET /api/v1/bot2/surveys?from=2026-01-01&to=2026-05-29&survey_campaign=spring2026
```

### 4.3. POST /api/v1/admin/roster/import — Roster import

`import_roster` view; ruxsat: `[IsAuthenticated, IsAdminUserRole]` (faqat admin); `@transaction.atomic`.

Kiruvchi formatlardan biri:
1. **CSV fayl** — `multipart/form-data`, maydon nomi `file`. UTF-8 dekodlanadi, `csv.DictReader` bilan o'qiladi.
2. **JSON list** — `request.data` to'g'ridan-to'g'ri massiv bo'lsa.
3. **JSON `{"rows": [...]}`** — `request.data` dict bo'lib `rows` kaliti bo'lsa.
4. Aks holda → `400 INVALID_PAYLOAD` ("Provide CSV file or JSON list.").

Har bir qator uchun `parse_roster_payload(row)` → `upsert_roster_row(parsed)` chaqiriladi. `created_flag` qaytsa `created` o'sadi, aks holda `updated`. Xatolar (APIError yoki kutilmagan istisno) `errors` ro'yxatiga `{"row": idx, "error": ...}` ko'rinishida yig'iladi (qator raqami 1 dan boshlanadi). Import yakunida bitta audit yozuvi yaratiladi (`meta={"type": "roster_import"}`).

Javob statusi:
- Hech xato yo'q → **200 OK**,
- Bitta yoki undan ko'p xato → **207 Multi-Status**.

Javob tanasi:
```json
{
  "created": 12,
  "updated": 3,
  "errors": [
    {"row": 5, "error": "Program not found."},
    {"row": 9, "error": "course_year must be between 1 and 4."}
  ]
}
```

Qator maydonlari (CSV ustun nomlari / JSON kalitlari): `student_external_id` (majburiy), `program_id` yoki `program_code`, `course_year` (1..4), ixtiyoriy `campaign`, ixtiyoriy `is_active`.

CSV misoli:
```csv
student_external_id,program_code,course_year,campaign,is_active
U2026001,SE,2,spring2026,true
U2026002,SE,3,spring2026,true
```

### 4.4. ProgramEnrollment qamrovi (annotate)

`ProgramEnrollmentViewSet.queryset` da `responded_count` annotatsiya qilinadi — bu javob bergan **unikal roster** soni:

```python
responded_count=Count(
    "program__bot2_program_surveys__roster_id",
    distinct=True,
    filter=Q(
        program__bot2_program_surveys__course_year=F("course_year"),
        program__bot2_program_surveys__survey_campaign=F("campaign"),
        program__bot2_program_surveys__submitted_at__isnull=False,
    ),
)
```

Mantiq: `program` orqali bog'langan barcha so'rovnomalar ichidan faqat shu enrollment yozuvining `course_year` va `campaign` qiymatlariga mos kelganlari va `submitted_at` to'ldirilganlari sanaladi, unikal `roster_id` bo'yicha. Keyin `coverage_percent = responded_count / student_count × 100` (3.1-bo'lim).

> Eslatma: filtr `academic_year` ni hisobga olmaydi — `responded_count` faqat `course_year` + `campaign` bo'yicha mos keladi. Shu sababli bir nechta o'quv yili bir xil `campaign` bilan saqlansa, hisob aralashishi mumkin.

### 4.5. POST /api/v1/bot2/surveys/submit — So'rovnomani topshirish (asosiy oqim)

Bu eng muhim endpoint — Telegram bot aynan shu orqali javob yuboradi. `submit_survey` view; `permission_classes([])` (DRF auth o'chirilgan), o'rniga **service token** tekshiriladi; `@transaction.atomic`.

#### Qadam-baqadam logika

1. **Service token tekshiruvi:** `verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")`. Token DB dagi `ServiceToken` (`service_name="bot2"`, faol, muddati o'tmagan) bilan, agar DB ishlamasa `settings.SERVICE_TOKENS` bilan solishtiriladi. Yo'q bo'lsa `403 SERVICE_TOKEN_REQUIRED`, noto'g'ri bo'lsa `403 SERVICE_TOKEN_INVALID`.

2. **`student_external_id`** majburiy, bo'lmasa → `400 VALIDATION_ERROR`.

3. **`course_year`** ixtiyoriy, default `1`; int ga aylantiriladi (bo'lmasa `400 INVALID_COURSE_YEAR`); `1..5` oralig'ida bo'lishi shart, aks holda `400 INVALID_COURSE_YEAR`.

4. **Roster qidirish** (`student_external_id` bo'yicha):
   - **Topilsa** → mavjud roster haqiqat manbai: `course_year = roster.course_year` deb **server tomonda override qilinadi** (kirgan `course_year` e'tiborga olinmaydi).
   - **Topilmasa** → avtomatik roster yaratishga urinadi:
     - `program_id` berilmagan bo'lsa → `400 ROSTER_NOT_FOUND` ("Student roster not found and program_id not provided.").
     - `program_id` `PROGRAM` yoki `DIRECTION` tipidagi `CatalogItem` ga ishora qilmasa → `400 INVALID_PROGRAM`.
     - Aks holda yangi `StudentRoster` yaratiladi: `course_year=course_year`, `roster_campaign="bot2_auto"`, `is_active=True`.

5. **`survey_campaign`** ixtiyoriy, default `"default"`.

6. **`region_id`** ixtiyoriy; berilsa `REGION` tipidagi `CatalogItem` bo'lishi shart, aks holda `400 INVALID_REGION`. Berilmasa `region=None`.

7. **Talaba (Bot2Student) upsert** — `telegram_user_id` ustuvor kalit:
   - Agar `telegram_user_id` bo'yicha mavjud student topilsa, u **yangilanadi** (hatto `student_external_id` o'zgargan bo'lsa ham). Bu Telegram ID o'zgarmasligini hisobga olib, ID ko'chishini to'g'ri qayta ishlash uchun.
   - Aks holda `Bot2Student.objects.update_or_create(student_external_id=..., defaults={...})` — `student_external_id` bo'yicha topiladi yoki yaratiladi.

8. **So'rovnoma upsert (idempotentlik):**
   ```python
   survey, _ = Bot2SurveyResponse.objects.update_or_create(
       student=student,
       survey_campaign=campaign,
       defaults={
           "roster": roster,
           "program": roster.program,   # SERVER roster'dan oladi
           "course_year": course_year,  # roster.course_year (override qilingan)
           ...,
           "submitted_at": timezone.now(),
       },
   )
   ```
   `(student, survey_campaign)` bir xil bo'lsa, mavjud javob yangilanadi — shuning uchun bir kampaniyada qayta-qayta yuborish dublikat yaratmaydi (faqat ilova darajasida; DB constraint yo'qligini eslang — 2.3-bo'lim).

9. **Server `program`/`course_year` ni override qiladi:** payload ichida `program = roster.program` va `course_year = course_year` (mavjud roster uchun bu `roster.course_year`). Demak botdan kelgan dastur/kurs e'tiborga olinmaydi — roster haqiqat manbai. Bu `Bot2SurveyResponse.clean()` dagi uyg'unlik tekshiruvlarini ham avtomatik qondiradi.

#### Xatoliklarni ushlash

- `ValidationError` (`full_clean` dan) → `400 VALIDATION_ERROR` (`exc.messages`).
- Boshqa har qanday istisno → `500 SERVER_ERROR`.
- Muvaffaqiyatda audit yozuvi yoziladi (`actor_type="service"`, `actor_service="bot2"`).

#### Muvaffaqiyatli javob (200)

```json
{
  "ok": true,
  "roster": {"program_id": "f1a2...uuid", "course_year": 2},
  "response_id": "9c3e...uuid"
}
```

#### So'rov misoli

```bash
curl -X POST https://crm.example.uz/api/v1/bot2/surveys/submit \
  -H "X-SERVICE-TOKEN: <bot2-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "student_external_id": "U2026001",
    "telegram_user_id": 123456789,
    "username": "ali_v",
    "first_name": "Ali",
    "last_name": "Valiyev",
    "gender": "male",
    "phone": "+998901112233",
    "region_id": "<region-uuid>",
    "survey_campaign": "spring2026",
    "employment_status": "employed",
    "employment_company": "Acme",
    "employment_role": "Engineer",
    "suggestions": "Koʻproq amaliyot",
    "consents": {"data_usage": true},
    "answers": {"q1": "yes"},
    "program_id": "<program-uuid>"
  }'
```

---

## 5. Servis logikasi (`server/bot2/services.py`)

Roster importining yadrosi shu faylda. Asosiy uchta funksiya bor.

### 5.1. get_program(program_id, program_code)

`CatalogItem` ni `PROGRAM` **yoki** `DIRECTION` tipidan qidiradi (`Q(type=PROGRAM) | Q(type=DIRECTION)`). Avval `program_id`, bo'lmasa `program_code` bo'yicha. Topilmasa `None`.

> **Tafovut eslatmasi:** `get_program` `DIRECTION` tipini ham qabul qiladi, ammo `StudentRoster.clean()` esa **faqat `PROGRAM`** tipini ruxsat etadi. Demak roster import jarayonida `direction` tipidagi katalog elementi `get_program` ni o'tib ketadi, lekin keyin `upsert_roster_row` ichidagi `full_clean()` da `clean()` tomonidan rad etiladi ("program must reference a catalog item with type=program."). Ya'ni amalda roster importi uchun faqat `program` tipi ishlaydi.

### 5.2. parse_roster_payload(row)

Bitta xom qatorni tekshirib, normallashtirilgan dict qaytaradi. Qaytaradigan kalitlar: `student_external_id`, `program` (CatalogItem obyekti), `course_year`, `is_active`, `roster_campaign`.

Tekshiruvlar va xato kodlari:

| Holat | Xato kodi |
|-------|-----------|
| `student_external_id` bo'sh | `VALIDATION_ERROR` |
| Program topilmadi (`get_program` → None) | `PROGRAM_NOT_FOUND` |
| `course_year` int emas | `INVALID_COURSE_YEAR` ("course_year must be 1..4.") |
| `course_year` `(1,2,3,4)` dan tashqarida | `INVALID_COURSE_YEAR` ("course_year must be between 1 and 4.") |

> **MUHIM ESLATMA — course_year 1..4 vs 1..5 nomuvofiqligi.** `parse_roster_payload` faqat **1..4** ni qabul qiladi (5 = bitirgan rad etiladi). Lekin modellardagi validator va CheckConstraint **1..5** ni ruxsat etadi, `submit_survey` ham **1..5** ni qabul qiladi. Ya'ni `course_year=5` (bitirgan) roster importi orqali kira olmaydi, faqat boshqa yo'l bilan (masalan, `submit_survey` da `bot2_auto` roster yaratishda yoki to'g'ridan-to'g'ri DB orqali) paydo bo'lishi mumkin.

`is_active` mantiqida diqqatga loyiq nuqta: `bool(row.get("is_active", True) not in [False, "false", "False", "0"])`. Ya'ni `False`, `"false"`, `"False"`, `"0"` qiymatlari `False` ga, qolgan barchasi (jumladan `"no"`, bo'sh string `""`, `None`) `True` ga aylanadi.

### 5.3. upsert_roster_row(data) — survey'larni sinxronlash

`@transaction.atomic`. Mavjud roster `student_external_id` bo'yicha qidiriladi.

- **Mavjud bo'lsa:** faqat o'zgargan maydonlar aniqlanadi (`program`, `course_year`, `is_active`, `roster_campaign`). O'zgarish bo'lsa:
  - `existing.full_clean()` (clean tekshiruvi),
  - `existing.save(update_fields=changed_fields + ["updated_at"])`,
  - **denormalizatsiyani sinxronlash:** shu roster'ga bog'langan barcha `Bot2SurveyResponse` larning `program` va `course_year` maydonlari `update()` orqali roster'ning yangi qiymatlariga moslashtiriladi:
    ```python
    Bot2SurveyResponse.objects.filter(roster=existing).update(
        program=existing.program,
        course_year=existing.course_year,
    )
    ```
    Bu denormalizatsiya tufayli juda muhim — roster'da kurs/dastur o'zgarsa, eski survey'lar ham yangilanadi va uyg'unlik buzilmaydi. (`update()` `clean()` va CheckConstraint ni chaqirmaydi, lekin qiymatlar to'g'ridan-to'g'ri roster'dan olingani uchun ular doim valid bo'ladi.)
  - Funksiya `False` qaytaradi (yangi yaratilmadi → "updated").
- **Mavjud bo'lmasa:** yangi `StudentRoster` yaratiladi, `full_clean()`, `save()`, `True` qaytaradi ("created").

---

## 6. Admin (`server/bot2/admin.py`)

`ReadOnlyAdmin` yordamchi sinfi: `has_add/change/delete_permission` → `False`, barcha maydonlar read-only. Bu orqali roster/student/survey faqat ko'rish uchun ochiq (ma'lumotlar API/import orqali kiritiladi).

| Model | Admin sinf | list_display (qisqa) | list_filter |
|-------|-----------|-----------------------|-------------|
| `StudentRoster` | `StudentRosterAdmin (ReadOnly)` | external_id, program, course_year, is_active, created_at | program, course_year, is_active |
| `Bot2Student` | `Bot2StudentAdmin (ReadOnly)` | external_id, roster, telegram_user_id, username, gender, region, created_at | gender, region |
| `Bot2SurveyResponse` | `Bot2SurveyResponseAdmin (ReadOnly)` | student, roster, program, course_year, survey_campaign, submitted_at, created_at | survey_campaign, program, course_year |
| `ProgramEnrollment` | `ProgramEnrollmentAdmin` (**to'liq tahrirlanadi**) | program, course_year, student_count, academic_year, campaign, is_active, updated_at | academic_year, campaign, course_year, is_active, program |

Diqqat: faqat `ProgramEnrollment` admin orqali tahrirlanadi (qamrov maxraji admin tomonidan qo'lda kiritilishi mumkin), qolgan uchtasi read-only.

---

## 7. Xato kodlari xulosasi

| Kod | HTTP | Qayerda |
|-----|------|---------|
| `VALIDATION_ERROR` | 400 | `submit_survey` (`student_external_id` yo'q, `full_clean` xatosi), `parse_roster_payload` (bo'sh external_id) |
| `INVALID_COURSE_YEAR` | 400 | `submit_survey` (1..5 emas), `parse_roster_payload` (1..4 emas) |
| `ROSTER_NOT_FOUND` | 400 | `submit_survey` — roster yo'q va `program_id` berilmagan |
| `INVALID_PROGRAM` | 400 | `submit_survey` — `program_id` program/direction emas |
| `INVALID_REGION` | 400 | `submit_survey` — `region_id` region emas |
| `PROGRAM_NOT_FOUND` | 400 | `parse_roster_payload` — program topilmadi |
| `INVALID_PAYLOAD` | 400 | `import_roster` — CSV/JSON formati noto'g'ri |
| `SERVICE_TOKEN_REQUIRED` / `SERVICE_TOKEN_INVALID` | 403 | `verify_service_token` |
| `SERVER_ERROR` | 500 | `submit_survey` — kutilmagan istisno |

Xato javoblari `common.exceptions.build_error_response` orqali quyidagi formatda qaytadi:
```json
{ "error": { "code": "ROSTER_NOT_FOUND", "message": "Student roster not found and program_id not provided." } }
```

---

## 8. Ma'lumotlarning umumiy oqimi (sodda misol)

```
1) Admin CSV yuklaydi:
   POST /api/v1/admin/roster/import (file=roster.csv)
   → har qator parse_roster_payload → upsert_roster_row
   → StudentRoster(U2026001, program=SE, course_year=2) yaratiladi
   → javob: {"created": N, "updated": M, "errors": [...]}, status 200/207

2) Talaba Telegram botda so'rovnomani to'ldiradi, bot yuboradi:
   POST /api/v1/bot2/surveys/submit (X-SERVICE-TOKEN, student_external_id=U2026001, ...)
   → service token tekshiriladi
   → roster topiladi → course_year = roster.course_year (server override)
   → Bot2Student upsert (telegram_user_id ustuvor)
   → Bot2SurveyResponse update_or_create(student, campaign), program/course_year = roster'dan
   → javob: {"ok": true, "roster": {...}, "response_id": "..."}

3) Dashboard hisobotni o'qiydi:
   GET /api/v1/bot2/enrollments  → responded_count + coverage_percent
   GET /api/v1/bot2/surveys?from=...&to=...&survey_campaign=spring2026
```

---

## 9. Yangi dasturchi uchun muhim eslatmalar

- **Roster — haqiqat manbai.** `program` va `course_year` doim roster'dan olinadi va survey'ga denormalizatsiya qilinadi. Botdan kelgan dastur/kurs server tomonda override qilinadi.
- **Idempotentlik faqat ilova darajasida.** `submit_survey` `update_or_create(student, survey_campaign)` ishlatadi, lekin DB'da bu juftlik bo'yicha unique constraint **yo'q** (2.3-bo'lim).
- **course_year diapazoni nomuvofiq:** import 1..4, model/submit 1..5 (5.2-bo'lim).
- **`get_program` vs `StudentRoster.clean()`:** birinchisi direction'ni qabul qiladi, ikkinchisi rad etadi (5.1-bo'lim).
- **`responded_count` annotatsiyasi `academic_year` ni hisobga olmaydi** (4.4-bo'lim).
- **`StudentRoster.save()` `full_clean()` chaqirmaydi**, lekin `Bot2Student.save()` va `Bot2SurveyResponse.save()` chaqiradi.

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) — Backend tuzilishi (common, BaseModel, sozlamalar)
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — Service token (`X-SERVICE-TOKEN`), rollar va ruxsatlar
- [04-katalog.md](04-katalog.md) — CatalogItem (program/direction/region tiplari)
- [06-analitika-va-audit.md](06-analitika-va-audit.md) — Bot2 analitika endpointlari va audit jurnali
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma
- [08-telegram-bot.md](08-telegram-bot.md) — Telegram bot va `submit` chaqiruvi
- [09-dashboard.md](09-dashboard.md) — Boshqaruv paneli (roster/survey/enrollment ko'rinishlari)
- [10-malumotlar-modeli.md](10-malumotlar-modeli.md) — Ma'lumotlar modeli / ER diagramma
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari
