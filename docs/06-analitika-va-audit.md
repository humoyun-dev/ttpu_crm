# Analitika va Audit

Bu hujjat TTPU CRM backendining ikkita ko'ndalang (cross-cutting) qism — **Analitika** (`server/analytics`) va **Audit** (`server/audit`) — ishini batafsil tushuntiradi. Hujjat backend dasturchilari hamda dashboard'da hisobotlar (coverage, employment) ko'rsatuvchi frontend dasturchilari uchun mo'ljallangan.

Ikkala qism ham mustaqil Django app sifatida ro'yxatga olingan, lekin tabiati butunlay boshqacha:

- **Analitika** — o'z modeli **yo'q**. U faqat `bot2` domeni ma'lumotlari (`StudentRoster`, `Bot2SurveyResponse`, `ProgramEnrollment`) ustida ORM aggregatsiya bajaradigan oddiy `@api_view` endpointlar to'plami. Hech qanday jadval, migration yoki saqlangan hisobot yo'q — har bir so'rov real vaqtda hisoblanadi.
- **Audit** — bitta `AuditLog` modeli (append-only jurnal) va `log_audit()` utility funksiyasidan iborat. U avtomatik emas: signal ham, middleware ham yo'q. Audit yozuvi faqat view kodida `log_audit(...)` qo'lda chaqirilgan joylarda yaratiladi (opt-in).

---

## 1. Analitika

### 1.1. Umumiy tuzilishi va eslatma: model yo'q

`server/analytics/models.py` va `server/analytics/admin.py` **bo'sh** (har biri 1 qatorli/bo'sh fayl). Demak analytics app'ida hech qanday DB jadval yo'q, admin'da ham hech narsa ro'yxatdan o'tmagan. App faqat `server/analytics/views.py` dagi funksiya-asoslangan (FBV) endpointlardan iborat. `server/analytics/apps.py` da esa standart `AnalyticsConfig` (name = `"analytics"`).

Barcha endpointlar URL'da `api/v1/analytics/bot2/...` prefiksi ostida ro'yxatdan o'tgan (`server/crm_server/urls.py:56-61`). To'liq xarita:

| URL (`api/v1/` ostida)                    | View funksiyasi (`analytics/views.py`)   | Vaqt oralig'i (`?from/?to`) | Boshqa majburiy param |
|-------------------------------------------|-------------------------------------------|:---------------------------:|------------------------|
| `analytics/bot2/course-year-coverage`     | `bot2_course_year_coverage`               | majburiy                    | —                      |
| `analytics/bot2/program-coverage`         | `bot2_program_coverage`                   | majburiy                    | —                      |
| `analytics/bot2/program-course-matrix`    | `bot2_program_course_matrix`              | majburiy                    | —                      |
| `analytics/bot2/program-details-by-year`  | `bot2_program_details_by_year`            | majburiy                    | `?course_year`         |
| `analytics/bot2/enrollments-overview`     | `enrollments_overview`                    | majburiy                    | —                      |
| `analytics/bot2/academic-years`           | `bot2_academic_years`                     | **kerak emas**              | —                      |

> Diqqat: bu URL'larda oxirgi `/` (trailing slash) **yo'q** — Django `path()` literal mos kelishini talab qiladi.

### 1.2. Ruxsat (permission)

Har bir endpoint quyidagicha himoyalangan:

```python
@api_view(["GET"])
@permission_classes([IsAuthenticated, IsViewerOrAdminReadOnly])
```

`IsViewerOrAdminReadOnly` (`server/common/permissions.py:12`) `SAFE_METHODS` (GET/HEAD/OPTIONS) uchun **istalgan autentifikatsiyalangan foydalanuvchiga** ruxsat beradi. Yozuv metodlari faqat ADMIN'ga tegishli — lekin analytics faqat GET bo'lgani uchun amalda har qanday login qilingan foydalanuvchi (viewer yoki admin) bularni o'qiy oladi. Service token bilan kirish bu yerda mavjud emas — faqat JWT bilan login qilgan dashboard foydalanuvchilari.

### 1.3. Umumiy kirish parametrlari

Barcha (academic-years dan tashqari) endpointlar quyidagi query parametrlarni qabul qiladi:

| Param            | Majburiy | Default     | Tavsif                                                                                |
|------------------|:--------:|-------------|---------------------------------------------------------------------------------------|
| `from`           | ha       | —           | ISO datetime. So'rovnoma javoblari oralig'ining boshlanishi.                          |
| `to`             | ha       | —           | ISO datetime. Oralig'ining tugashi. `from < to` bo'lishi shart.                       |
| `campaign`       | yo'q     | `"default"` | Kampaniya identifikatori (roster/survey/enrollment yozuvlarini ajratish uchun).       |
| `academic_year`  | yo'q     | auto-detect | Masalan `"2024-2025"`. Berilmasa eng so'nggi `ProgramEnrollment.academic_year` olinadi.|
| `course_year`    | ba'zida  | —           | Faqat `program-details-by-year` da **majburiy**; `program-coverage` da ixtiyoriy filter.|

#### Vaqt oralig'ini tekshirish — `_require_range()`

`analytics/views.py:39-50` dagi helper `from`/`to` ni majburiy qiladi va xato javoblarni qaytaradi:

```python
def _require_range(request):
    from_str = request.query_params.get("from")
    to_str = request.query_params.get("to")
    if not from_str or not to_str:
        return None, None, build_error_response("TIME_RANGE_REQUIRED", "from/to query params are required.", 400)
    start = parse_iso_datetime(from_str)
    end = parse_iso_datetime(to_str)
    if not start or not end:
        return None, None, build_error_response("INVALID_TIME_RANGE", "from/to must be ISO datetime.", 400)
    if start >= end:
        return None, None, build_error_response("INVALID_TIME_RANGE", "from must be earlier than to.", 400)
    return start, end, None
```

Xato kodlari (barchasi HTTP 400, `build_error_response` formati orqali — `server/common/exceptions.py:27`):

- `TIME_RANGE_REQUIRED` — `from` yoki `to` umuman berilmagan.
- `INVALID_TIME_RANGE` — ISO sifatida parse bo'lmadi, yoki `from >= to`.

Xato javob shakli:

```json
{ "error": { "code": "TIME_RANGE_REQUIRED", "message": "from/to query params are required." } }
```

`parse_iso_datetime` (`server/common/time.py:7`) avval Django `parse_datetime`, keyin `datetime.fromisoformat` ni sinab ko'radi; agar natija naive bo'lsa — UTC qilib aware'ga aylantiradi. Demak `?from=2024-09-01T00:00:00` (timezone'siz) ham, `?from=2024-09-01T00:00:00Z` ham qabul qilinadi.

### 1.4. Markaziy hisoblash bloklari (helper'lar)

Analytika logikasi 3 ta yordamchi atrofida quriladi.

#### `BOT2_COURSE_YEARS = [1, 2, 3, 4, 5]`

`analytics/views.py:16`. Bu **5 ta kurs yili qatori** — natija doim shu 5 qator (yoki cell) atrofida shakllanadi, hatto biror yil uchun ma'lumot yoki javob bo'lmasa ham. Ya'ni "javob bermaganlar ham" ko'rinadi: javob 0 bo'lsa qator yo'qolib ketmaydi, balki `responded: 0` bilan qaytadi.

#### `_bot2_roster_totals_qs(campaign, course_year=None)`

`analytics/views.py:19`. Faol roster qatorlari (`StudentRoster.is_active=True`) ni berilgan `roster_campaign` bo'yicha filterlaydi; ixtiyoriy ravishda `course_year` ni ham qo'shadi. Bu "umumiy talabalar soni" ni roster sonidan (`Count("id")`) hisoblashning manbai.

#### `_resolve_academic_year(campaign, academic_year)`

`analytics/views.py:26`. Agar so'rovda `academic_year` berilgan bo'lsa — uni qaytaradi. Aks holda `ProgramEnrollment` ichidan eng so'nggi (`order_by("-academic_year")`) faol yozuvni topib, uning o'quv yilini auto-detect qiladi. Agar enrollment umuman bo'lmasa — `None`.

Bu qiymat **ikki xil hisoblash rejimini** belgilaydi:

- **`academic_year` mavjud** → "umumiy talabalar soni" `ProgramEnrollment.student_count` yig'indisi (`Sum`) dan olinadi (deklarativ kvota).
- **`academic_year` = None** → "umumiy talabalar soni" faol roster qatorlari soni (`Count("id")`) dan olinadi (haqiqiy ro'yxat).

> Muhim nuance: `ProgramEnrollment` faqat **1-4 kurslarni** kuzatadi. **5-kurs (bitiruvchilar)** uchun enrollment-rejimida ham total har doim roster sonidan olinadi (kodda "fall back to roster counts" izohlari bilan, masalan `analytics/views.py:88`).

#### `_latest_responses_qs(start, end, campaign)` — eng muhim blok

`analytics/views.py:53-68`. Bu funksiya **har bir talaba uchun vaqt oralig'idagi eng so'nggi bitta so'rovnoma javobini** qaytaradi (dublikatlarni yo'qotadi). Logika `OuterRef`/`Subquery` ("greatest-n-per-group") naqshi orqali ishlaydi:

```python
base = Bot2SurveyResponse.objects.filter(
    submitted_at__gte=start, submitted_at__lte=end, survey_campaign=campaign,
)
latest_ids = (
    base.filter(student_id=OuterRef("student_id"))
        .order_by("-submitted_at", "-created_at", "-id")
        .values("id")[:1]
)
return base.annotate(latest_id=Subquery(latest_ids)).filter(id=F("latest_id"))
```

- Filtr `submitted_at` bo'yicha (created_at emas) — ya'ni vaqt oralig'i talaba so'rovnomani **topshirgan** vaqtga nisbatan.
- Har bir `student_id` uchun tartiblash: avval `submitted_at` (eng yangi), keyin `created_at`, keyin `id` (deterministik tie-breaker).
- Natijada bir talaba bir necha marta javob bersa ham, faqat eng oxirgisi hisobga olinadi. Shu sababli `responded` doim `Count("student_id", distinct=True)` bilan sanaladi.

### 1.5. `coverage_percent` qanday hisoblanadi va nega 100% dan oshishi mumkin

Barcha endpointlarda formula bir xil:

```python
coverage = round((responded / total * 100) if total else 0, 2)
```

- `total == 0` bo'lsa — `coverage = 0` (nolga bo'linish himoyasi).
- Aks holda — `responded` ni `total` ga foiz qilib, 2 xonagacha yaxlitlash.

**Nega 100% dan oshishi mumkin?** Sababi `total` va `responded` ikki **turli manbadan** keladi:

- Enrollment-rejimida `total` — `ProgramEnrollment.student_count` (kvota, qo'lda kiritilgan deklaratsiya).
- `responded` esa — vaqt oralig'idagi haqiqiy noyob so'rovnoma to'ldirgan talabalar soni.

Agar haqiqatda javob bergan talabalar soni e'lon qilingan kvotadan ko'p bo'lsa (masalan kvota 30 deb yozilgan, lekin 33 ta talaba javob berdi), `coverage_percent` 110.0 bo'lib chiqadi. Bu bug emas — `total` real ro'yxat emas, balki kutilgan/rejalashtirilgan son. Frontend buni inobatga olishi kerak (masalan progress-bar'ni 100% da cheklash). Roster-rejimida (`academic_year` yo'q) bunday holat kamroq uchraydi, lekin bir talaba roster'da bo'lmasdan ham javob berib qolsa nazariy jihatdan mumkin.

### 1.6. Endpoint: `course-year-coverage`

**Funksiya:** `bot2_course_year_coverage` (`analytics/views.py:71`).
**Maqsad:** har bir kurs yili (1-5) uchun jami talaba, javob bergan va coverage foizini qaytarish.

**Logika:**
1. `_require_range` bilan vaqt oralig'i tekshiriladi.
2. `academic_year` resolve qilinadi.
3. **Total hisoblash:**
   - `academic_year` mavjud → `ProgramEnrollment` dan `course_year` bo'yicha `Sum("student_count")`; so'ng `total_map[5]` 5-kurs roster sonidan **qayta yoziladi** (`analytics/views.py:88`).
   - `academic_year` yo'q → faol roster `course_year` bo'yicha `Count("id")`.
4. **Responded:** `_latest_responses_qs(...).values("course_year").annotate(count=Count("student_id", distinct=True))`.
5. 1..5 kurslar bo'ylab loop — yetishmagan yillar 0 bilan to'ldiriladi.

**Javob shakli (massiv, doim 5 ta element):**

```json
[
  { "course_year": 1, "total": 120, "responded": 80, "coverage_percent": 66.67 },
  { "course_year": 2, "total": 110, "responded": 95, "coverage_percent": 86.36 },
  { "course_year": 3, "total": 100, "responded": 0,  "coverage_percent": 0 },
  { "course_year": 4, "total": 90,  "responded": 90, "coverage_percent": 100.0 },
  { "course_year": 5, "total": 40,  "responded": 12, "coverage_percent": 30.0 }
]
```

### 1.7. Endpoint: `program-coverage`

**Funksiya:** `bot2_program_coverage` (`analytics/views.py:113`).
**Maqsad:** har bir dastur (program) bo'yicha total / responded / coverage.

**Logika:**
- Qo'shimcha ixtiyoriy `?course_year` — berilsa ham total, ham responded shu kurs yiliga filterlanadi.
- Total: enrollment-rejimida `program` bo'yicha `Sum("student_count")`, roster-rejimida `Count("id")`.
- Eslatma: bu endpoint'da 5-kurs uchun roster fallback **yo'q** — ya'ni enrollment-rejimida `?course_year=5` so'ralsa, total `ProgramEnrollment` da 5-kurs yo'qligi sababli bo'sh chiqishi mumkin (course-year-coverage va matrix dan farqli). Buni bilib turish kerak.
- Natija faqat **total_map** da mavjud dasturlar bo'yicha quriladi (ya'ni total'da bo'lmagan, lekin javob bergan dastur ko'rinmasligi mumkin).

**Javob shakli (massiv):**

```json
[
  { "program_id": "a1b2...", "program_name": "Software Engineering", "total": 60, "responded": 40, "coverage_percent": 66.67 }
]
```

### 1.8. Endpoint: `program-course-matrix`

**Funksiya:** `bot2_program_course_matrix` (`analytics/views.py:160`).
**Maqsad:** dastur × kurs yili matritsasi (heatmap uchun ideal).

**Logika:**
- Enrollment-rejimida total `program × course_year` bo'yicha `Sum("student_count")`, plyus 5-kurs uchun alohida roster fallback (`roster_totals`, `analytics/views.py:174`).
- Roster-rejimida (`academic_year` yo'q) total to'g'ridan-to'g'ri roster `Count("id")` dan, `roster_totals = []`.
- Responded `_latest_responses_qs` dan `program × course_year` bo'yicha.
- `programs` lug'ati total, roster_totals va responded'da uchragan **barcha** dasturlarni birlashtiradi (union) — shu sababli faqat javob bergan dastur ham matritsada paydo bo'ladi.
- `cells` har bir dastur uchun 1..5 kurs ko'paytmasi (to'liq grid; bo'sh kataklar 0 bilan).

**Javob shakli (obyekt):**

```json
{
  "years": [1, 2, 3, 4, 5],
  "programs": [
    { "id": "a1b2...", "name": "Software Engineering" }
  ],
  "cells": [
    { "program_id": "a1b2...", "course_year": 1, "total": 30, "responded": 20, "coverage_percent": 66.67 }
  ]
}
```

### 1.9. Endpoint: `program-details-by-year`

**Funksiya:** `bot2_program_details_by_year` (`analytics/views.py:228`).
**Maqsad:** bitta kurs yili uchun dasturlar kesimi + **bandlik (employment) statistikasi**.

**Majburiy param:** `?course_year` (1-5).
- Berilmasa → `COURSE_YEAR_REQUIRED` (HTTP 400).
- Butun son emas → `INVALID_COURSE_YEAR` (HTTP 400).

**Logika:**
1. Total: agar `academic_year` mavjud **va** `course_year != 5` → `ProgramEnrollment` dan `Sum("student_count")`. Aks holda (jumladan `course_year == 5`) → roster `Count("id")` (`analytics/views.py:247-257`).
2. Responded: `_latest_responses_qs(...).filter(course_year=...)` dan `program` bo'yicha noyob talabalar.
3. **Employment breakdown:** xuddi shu latest-responses oralig'idan `program × employment_status` bo'yicha noyob talabalar sanaladi, so'ng matn bo'yicha "employed" yoki "unemployed" ga ajratiladi:

```python
emp_status = row["employment_status"].lower() if row["employment_status"] else ""
if "ishlayapman" in emp_status or "employed" in emp_status or "ишлаяпман" in emp_status:
    total_map[...]["employed"] += row["count"]
else:
    total_map[...]["unemployed"] += row["count"]
```

   Bu **substring-asoslangan** klassifikatsiya — `employment_status` matnida `ishlayapman` (lotin), `ишлаяпман` (kirill) yoki `employed` (inglizcha) bo'lsa "ishlaydi" hisoblanadi; qolgan barcha qiymatlar (jumladan bo'sh) "ishlamaydi" deb sanaladi. Demak ataylab ehtiyot bo'lish kerak: masalan `unemployed` matnida `employed` substring bor — bu ataylab `else` ga tushmasligi mumkin emas, balki `employed` shartiga tushib qoladi. (Hozirgi anketada bunday qiymat ishlatilmasligi sababli muammo yuzaga kelmaydi, lekin yangi status qiymatlari qo'shilganda e'tibor bering.)
4. Total'da bo'lmagan, lekin javob bergan dastur ham natijaga qo'shiladi (`total: 0, responded: N`).
5. Natija `total` bo'yicha kamayuvchi tartibda saralanadi.

**Javob shakli (massiv):**

```json
[
  {
    "program_id": "a1b2...",
    "program_name": "Software Engineering",
    "total": 60,
    "responded": 40,
    "coverage_percent": 66.67,
    "employed": 25,
    "unemployed": 15
  }
]
```

### 1.10. Endpoint: `enrollments-overview`

**Funksiya:** `enrollments_overview` (`analytics/views.py:318`).
**Maqsad:** umumiy dashboard ko'rinishi — jami yig'indilar + yillik kesim + dastur×yil ro'yxati, bitta javobda.

**Logika:**
- Total: enrollment-rejimida `program × course_year` bo'yicha `Sum("student_count")`, so'ng 5-kurs roster fallback `extend` qilinadi (`analytics/views.py:341`). Roster-rejimida hammasi roster `Count("id")` dan.
- Responded `_latest_responses_qs` dan `(program_id, course_year)` kalit bilan map'ga yig'iladi.
- Loop davomida `total_students`, `total_responded`, va har bir kurs yili uchun `yearly[year]` yig'iladi.
- `overall_coverage = total_responded / total_students * 100`.

**Javob shakli (obyekt):**

```json
{
  "total_students": 460,
  "total_responded": 277,
  "coverage_percent": 60.22,
  "by_year": [
    { "course_year": 1, "total": 120, "responded": 80, "coverage_percent": 66.67 }
  ],
  "by_program": [
    { "program_id": "a1b2...", "program_name": "Software Engineering", "course_year": 1, "total": 30, "responded": 20, "coverage_percent": 66.67 }
  ]
}
```

### 1.11. Endpoint: `academic-years`

**Funksiya:** `bot2_academic_years` (`analytics/views.py:423`).
**Maqsad:** mavjud o'quv yillari ro'yxatini berish (dashboard'da dropdown to'ldirish uchun).

Bu **yagona** endpoint bo'lib, **vaqt oralig'ini talab qilmaydi** (`_require_range` chaqirilmaydi). Faqat `?campaign` (default `"default"`) qabul qiladi va `ProgramEnrollment` (faol) dan `academic_year` ning noyob qiymatlarini eng yangidan eski tomon qaytaradi.

```python
years = (ProgramEnrollment.objects.filter(is_active=True, campaign=campaign)
         .values_list("academic_year", flat=True).distinct().order_by("-academic_year"))
return Response(list(years))
```

**Javob shakli (string massiv):**

```json
["2024-2025", "2023-2024", "2022-2023"]
```

### 1.12. Analitika oqim diagrammasi

```
GET /api/v1/analytics/bot2/course-year-coverage?from=...&to=...&campaign=...&academic_year=...
        |
        v
  _require_range(request)  --(xato)-->  400 TIME_RANGE_REQUIRED / INVALID_TIME_RANGE
        | (ok: start, end)
        v
  _resolve_academic_year(campaign, academic_year)
        |
   academic_year bormi?
   /                 \
  ha                  yo'q
  |                    |
ProgramEnrollment     StudentRoster (is_active=True)
Sum(student_count)    Count(id)
+ 5-kurs roster
fallback
        \             /
         v           v
        total_map (kurs yili -> jami)
        |
  _latest_responses_qs(start, end, campaign)   <-- har talaba bo'yicha eng so'nggi javob
        |   .values(course_year).annotate(Count(student_id, distinct))
        v
  resp_map (kurs yili -> javob bergan)
        |
  BOT2_COURSE_YEARS=[1..5] bo'ylab birlashtirish
  coverage = round(responded/total*100, 2)  (total=0 -> 0)
        |
        v
  Response([... 5 qator ...])
```

---

## 2. Audit

### 2.1. Maqsad va falsafa

Audit qism — **append-only jurnal**: kim (foydalanuvchi yoki servis), qachon, qaysi obyekt ustida qanday amal bajarganini yozib boradi. Asosiy xususiyatlar:

- **Avtomatik emas.** Django signal yoki middleware **ishlatilmaydi**. Yozuv faqat view kodida `log_audit(...)` chaqirilganda yaratiladi (opt-in / qo'lda).
- **O'zgartirilmaydi.** Admin'da yozuvni qo'shish/tahrirlash/o'chirish bloklangan (faqat o'qish).
- **PII himoyasi.** `email`, `phone`, `answers`, `first_name`, `last_name` kalitli qiymatlar saqlashdan oldin `[REDACTED]` qilib maskalanadi.

### 2.2. `AuditLog` modeli

Manba: `server/audit/models.py:7`. `BaseModel` dan meros oladi (`common/models.py:22`) — ya'ni `id` UUID, `created_at` (auto_now_add), `updated_at` (auto_now). Maydonlar:

| Maydon          | Tip                         | Tavsif                                                                   |
|-----------------|-----------------------------|--------------------------------------------------------------------------|
| `id`            | UUID (PK)                   | `BaseModel` dan.                                                         |
| `actor_type`    | CharField, `ActorType`      | `"user"` yoki `"service"`.                                                |
| `actor_user`    | FK → `AUTH_USER_MODEL`      | `on_delete=SET_NULL`, null bo'lishi mumkin. `related_name="audit_logs"`. |
| `actor_service` | CharField(100), blank       | Servis nomi (masalan `"bot2"`), foydalanuvchi bo'lmaganda.               |
| `action`        | CharField, `Action`         | `create / update / delete / login / logout / other` (default `other`).  |
| `entity_table`  | CharField(255)              | Obyekt DB jadval nomi (`entity._meta.db_table`).                         |
| `entity_id`     | UUIDField, null             | Obyekt `id` si (UUID), agar mavjud bo'lsa.                               |
| `before_data`   | JSONField (default dict)    | Amaldan oldingi holat (sanitize qilingan).                              |
| `after_data`    | JSONField (default dict)    | Amaldan keyingi holat (sanitize qilingan).                              |
| `meta`          | JSONField (default dict)    | Qo'shimcha kontekst (sanitize qilingan).                                 |
| `ip`            | GenericIPAddressField, null | `request.META["REMOTE_ADDR"]`.                                           |
| `user_agent`    | TextField, blank            | `request.META["HTTP_USER_AGENT"]`.                                       |

`actor_type` va `action` enum'lari Django `TextChoices` orqali:

```python
class ActorType(models.TextChoices):
    USER = "user", "User"
    SERVICE = "service", "Service"

class Action(models.TextChoices):
    CREATE = "create"; UPDATE = "update"; DELETE = "delete"
    LOGIN = "login"; LOGOUT = "logout"; OTHER = "other"
```

**Meta:** `ordering = ("-created_at",)` (eng yangi birinchi). Indekslar: `actor_type`, `action`, `entity_table`, `created_at` — bular admin'dagi filterlar va sanaviy qidiruvni tezlashtiradi.

`__str__` → `"{action} by {actor} on {entity_table}"`, bunda actor = `actor_service` yoki `actor_user.email` yoki `"unknown"`.

> Eslatma: append-only "qoidasi" model darajasida emas, balki amaliyot va admin sozlamalari orqali ta'minlangan. Kodda `AuditLog` yozuvlari faqat `objects.create(...)` orqali qo'shiladi; yangilanish/o'chirish hech qayerda chaqirilmaydi.

### 2.3. `log_audit()` utility

Manba: `server/audit/utils.py:40`. Yagona ommaviy funksiya — barcha argumentlar keyword-only (`*`):

```python
log_audit(
    *,
    actor_type: str,            # "user" yoki "service"
    action: str,                # "create" | "update" | "delete" | "login" | "logout" | "other"
    entity,                     # Django model instansi (entity._meta.db_table va entity.id olinadi)
    request=None,               # ip va user_agent shu yerdan olinadi
    actor_user=None,            # actor_type="user" bo'lganda
    actor_service=None,         # actor_type="service" bo'lganda
    before_data=None,           # sanitize qilinadi
    after_data=None,            # sanitize qilinadi
    meta=None,                  # sanitize qilinadi
)
```

Ichki ishlashi:
- `request` berilsa → `ip = request.META.get("REMOTE_ADDR")`, `user_agent = request.META.get("HTTP_USER_AGENT", "")`. Berilmasa ikkalasi ham bo'sh/`None`.
- `entity_table = entity._meta.db_table`, `entity_id = getattr(entity, "id", None)`.
- `before_data`, `after_data`, `meta` — `_sanitize_payload()` orqali tozalanadi.
- `created_at` va `updated_at` `timezone.now()` bilan **aniq** uzatiladi (BaseModel'ning auto qiymatlari ustidan).

> Diqqat: `entity` shart emas saqlangan obyekt bo'lishi shart emas — masalan roster import'da `entity=StudentRoster()` (yangi bo'sh instans) uzatiladi, faqat `db_table` ni olish uchun. Bunda `entity_id` `None` bo'ladi.

### 2.4. PII redaction (maskalash) — `_sanitize_payload`

Manba: `server/audit/utils.py:12-37`. Maskalanadigan kalitlar:

```python
PII_KEYS = {"email", "phone", "answers", "first_name", "last_name"}
```

Algoritm (shallow, key-based — qiymat emas, **kalit nomi** bo'yicha):

1. `payload` bo'sh/`None` bo'lsa → `{}`.
2. Rekursiya chuqurligi 5 dan oshsa → `{"__truncated__": True}` (cheksiz/chuqur strukturalardan himoya).
3. Har bir `(key, value)` uchun:
   - `value` dict bo'lsa → rekursiv `_sanitize_payload(value, depth+1)`.
   - `value` `UUID` bo'lsa → `str(value)` (JSON serializatsiya uchun).
   - Aks holda → `_sanitize_value(str(key), value)`: agar `key in PII_KEYS` → `"[REDACTED]"`, aks holda qiymat o'zgarmaydi (UUID bo'lsa string'ga).

**Cheklovlar (bilib turish kerak):**
- Maskalash faqat **to'g'ridan-to'g'ri kalit nomi** bo'yicha ishlaydi. Masalan `{"email": "..."}` maskalanadi, lekin `{"user_email": "..."}` yoki `{"contact": {"mail": "..."}}` **maskalanmaydi** — kalit nomi `PII_KEYS` dagi aniq qiymat bilan mos kelishi shart.
- Faqat dict ichidagi dict'lar rekursiyaga tushadi. **Ro'yxat (list)** ichidagi dict'lar (masalan `{"items": [{"email": "..."}]}`) maskalanmaydi — list elementlari ko'rib chiqilmaydi.
- Bu sodda, "best-effort" mexanizm — yangi PII maydon qo'shganda `PII_KEYS` ni yangilashni unutmang.

**Misol:**

```python
# Kirish
{"first_name": "Ali", "program_id": uuid.UUID("..."), "profile": {"phone": "+99890..."}}

# Sanitize'dan keyin saqlangan after_data
{"first_name": "[REDACTED]", "program_id": "a1b2...", "profile": {"phone": "[REDACTED]"}}
```

### 2.5. `log_audit()` qayerda chaqiriladi

Hozirda audit yozuvlari uchta app'ning view'larida qo'lda chaqiriladi. To'liq ro'yxat:

| Joy (fayl:qator)                    | `actor_type` | `action`            | Obyekt / izoh                                                    |
|-------------------------------------|--------------|---------------------|------------------------------------------------------------------|
| `authn/views.py:64`                 | user         | login               | Muvaffaqiyatli login'dan keyin (`LoginView`).                    |
| `authn/views.py:119`                | user         | logout              | `LogoutView` — token revoke qilingach.                           |
| `catalog/views.py:43,56,68`         | user         | create/update/delete| `CatalogItemViewSet` (`perform_create/update/destroy`).          |
| `catalog/views.py:89,101,113`       | user         | create/update/delete| `CatalogRelationViewSet`.                                        |
| `bot2/views.py:42,53,63`            | user         | create/update/delete| `Bot2StudentRosterViewSet`.                                      |
| `bot2/views.py:140,155,169`         | user         | create/update/delete| Bot2 talaba (Student) viewset CRUD.                              |
| `bot2/views.py:215`                 | user         | update              | `import_roster` — import natijasi (`meta={"type":"roster_import"}`).|
| `bot2/views.py:343`                 | service      | create              | `submit_survey` — bot2 servisi orqali so'rovnoma topshirish.     |

E'tibor bering:
- **Analitika endpointlari audit log YOZMAYDI** — ular faqat o'qish (GET) bo'lgani uchun va kodda `log_audit` chaqirilmagani uchun.
- Yagona `actor_type="service"` chaqiruvi — `submit_survey` (bot2 service token bilan). Unda `actor_service="bot2"`, `request=None`, va `after_data` da `student_external_id` saqlanadi.
- `import_roster` da `entity=StudentRoster()` (bo'sh instans) uzatiladi va `request._request` (Django HttpRequest) ip/user_agent uchun ishlatiladi.
- ViewSet'larda `before`/`after` odatda serializer `.data` dan olinadi (masalan `CatalogItemSerializer(instance).data`).

PII redaction amalda: masalan login'da `after_data={"user": user.email}` uzatiladi — lekin kalit nomi `"user"` (`"email"` emas), shu sababli email qiymati **maskalanmaydi**. Bu mexanizmning kalit-nom asoslangan tabiatining amaliy oqibati.

### 2.6. Admin (read-only)

Manba: `server/audit/admin.py`. `ReadOnlyAdmin` bazaviy klass uchala ruxsatni ham bloklaydi:

```python
class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False
    def get_readonly_fields(self, request, obj=None):
        field_names = [field.name for field in self.model._meta.fields]
        return tuple(set(field_names + list(super().get_readonly_fields(request, obj))))
```

`AuditLogAdmin(ReadOnlyAdmin)`:
- `list_display`: `action`, `actor_type`, `actor_user`, `actor_service`, `entity_table`, `created_at`.
- `list_filter`: `action`, `actor_type`, `entity_table`.
- `search_fields`: `actor_service`, `actor_user__email`, `entity_table`, `entity_id`.

Demak admin orqali audit jurnalini faqat **ko'rish, filterlash va qidirish** mumkin — hech narsani qo'shib/o'zgartirib/o'chirib bo'lmaydi, bu append-only kafolatini admin tomonidan ham mustahkamlaydi.

### 2.7. `log_audit()` chaqiruv naqshi (namuna)

```python
from audit.utils import log_audit

def perform_update(self, serializer):
    before = CatalogItemSerializer(self.get_object()).data
    instance = serializer.save()
    log_audit(
        actor_type="user",
        actor_user=self.request.user,
        action="update",
        entity=instance,
        request=self.request,
        before_data=before,            # sanitize qilinadi
        after_data=serializer.data,    # sanitize qilinadi
    )
```

Yangi joyga audit qo'shmoqchi bo'lsangiz: muvaffaqiyatli yozuv operatsiyasidan **keyin** `log_audit(...)` chaqiring, `entity` ga model instansini bering, va PII bo'lishi mumkin bo'lgan maydonlar uchun kalit nomlari `PII_KEYS` bilan mos kelishiga ishonch hosil qiling (yoki kerakli kalitni `PII_KEYS` ga qo'shing).

---

## Tegishli hujjatlar

- [README.md](./README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](./01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](./02-backend-arxitekturasi.md) — Backend tuzilishi (common, sozlamalar, asosiy modellar)
- [03-autentifikatsiya.md](./03-autentifikatsiya.md) — Autentifikatsiya: User, JWT, rollar, service token (audit login/logout shu yerda chaqiriladi)
- [04-katalog.md](./04-katalog.md) — Katalog (CatalogItem/CatalogRelation, dasturlar; audit create/update/delete shu yerda)
- [05-bot2-backend.md](./05-bot2-backend.md) — So'rovnoma domeni (roster, student, survey, enrollment — analitika manbasi)
- [07-api-malumotnoma.md](./07-api-malumotnoma.md) — To'liq API ma'lumotnoma (barcha endpointlar)
- [10-malumotlar-modeli.md](./10-malumotlar-modeli.md) — Ma'lumotlar modeli / ER diagramma
- [11-deploy-va-operatsiya.md](./11-deploy-va-operatsiya.md) — O'rnatish, deploy, seed komandalar
- [12-testlar.md](./12-testlar.md) — Test qoplamasi
- [13-ish-jarayonlari.md](./13-ish-jarayonlari.md) — End-to-end ish jarayonlari (so'rovnoma → analitika oqimi)
