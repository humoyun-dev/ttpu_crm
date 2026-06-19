# TTPU Bandlik Markazi — Texnik Build Plan (mavjud kodga moslashtirilgan)

> Bu hujjat ikki manba hujjatini — `bandlik-markazi-build-spec.md` (modellar/API) va
> `bandlik-markazi-loyiha-hujjati.md` (mahsulot mantig'i) — **mavjud kod bazasiga**
> moslashtiradi va **bazaga shikast yetkazmaydigan** (additive / expand-in-place)
> implementatsiya rejasini beradi.
>
> Asosiy tamoyil: mavjud `bot2` app spec'dagi `roster + students + survey`ni allaqachon
> qamragan. Biz strukturani **qayta qurmaymiz** — faqat yetishmaganini qo'shamiz va
> yagona semantik ziddiyatni (survey append-only) xavfsiz hal qilamiz.

---

## 0. Manbalar va kalit havolalar

| Narsa | Joy |
|---|---|
| Backend | `server/` (Django 5 + DRF, PostgreSQL, prefiks `/api/v1/`) |
| Bot | `bot2_service/src/bot2_service/` (aiogram v3, FSM MemoryStorage, httpx) |
| Dashboard | `dashboard/` (Next.js 16, React 19, `xlsx` paketi bor) |
| Django admin | `/superadmin/` |
| nginx | `/(api|superadmin|static|media)/` → server:9006, `/` → dashboard:3000 (`marketing.polito.uz`) |
| Service auth | `X-SERVICE-TOKEN` header → `common.permissions.ServiceTokenPermission` + `common.auth.verify_service_token` |
| Staff auth | Cookie JWT (`authn.authentication.CookieJWTAuthentication`), role `admin`/`viewer` |
| Audit | `audit.models.AuditLog` + `audit.utils.log_audit(...)` (PII sanitatsiya bilan) |
| BaseModel | `common.models.BaseModel` (UUID pk + `created_at`/`updated_at`) |

---

## 1. Mavjud kod ↔ spec moslik xaritasi

| Spec/loyiha tushunchasi | Mavjud kodda | Qaror |
|---|---|---|
| `roster.StudentRoster` (`student_id`, `birth_date`) | `bot2.StudentRoster` (`student_external_id`, **`birth_date` yo'q**) | Saqlaymiz; `birth_date` qo'shamiz (nullable) |
| `students.Student` | `bot2.Bot2Student` | Saqlaymiz; `language/state/consent/is_job_seeking` qo'shamiz |
| `survey.EmploymentRecord` (append-only) | `bot2.Bot2SurveyResponse` (**UNIQUE(student,campaign)** → overwrite) | Constraint olib tashlaymiz → append-only; `source` qo'shamiz |
| `CatalogItem` + `skill`/`industry` | `catalog.CatalogItem` (`skill`/`industry` **yo'q**) | choices'ga qo'shamiz (CHECK yo'q, xavfsiz) |
| `students.Document` + AI | — | Yangi `documents` app + `ai_gateway` + `ai_service` stub |
| `employers.Employer` | — | Yangi `employers` app |
| `crm.Lead/LeadStudent/AccessLink/AccessLog/FollowUp` | — | Yangi `crm` app |
| Public `/l/{token}` | — | Yangi `crm` view (auth'siz, token path) |
| `analytics/students-by-direction` (+xlsx) | analytics modelsiz, 6 endpoint bor, **bu yo'q** | Yangi endpoint + openpyxl eksport |
| `Vacancy/Application` | — | Yangi `vacancies` app (ixtiyoriy, Faza G) |
| Scheduler (follow-up 2/5/7 kun) | **Celery yo'q** | Management command + cron (Celery emas) |

**Muhim:** spec'dagi `student_id`, `Student`, `EmploymentRecord` nomlarini bazada **rename qilmaymiz** — yangi modellar mavjud `bot2.Bot2Student` / `bot2.StudentRoster`ga FK qiladi. Spec nomlari = mantiqiy, kod nomlari = `bot2.*`.

---

## 2. Qotirilgan qarorlar

1. **Survey = append-only** (foydalanuvchi tanlovi). `uq_survey_student_campaign` olib tashlanadi; har submit yangi qator.
2. **App joylashuvi:** yangi *domenlar* uchun yangi app — `employers`, `crm`, `documents`, (ixtiyoriy) `vacancies`. `bot2` faqat roster/student/survey'da qoladi. AI uchun: `server/ai_gateway/` (yupqa klient) + alohida `ai_service/` (stub).
3. **Scheduler:** Celery/Redis **qo'shilmaydi**. Follow-up uchun `python manage.py process_followups` management command + host cron (yoki dashboard cron) — kuniga bir necha marta. (Kerak bo'lsa keyin Celery'ga o'tish oson.)
4. **Excel:** `students-by-direction.xlsx` server tomonda `openpyxl` bilan (yangi dependency). Dashboard'dagi `xlsx` import uchun qoladi.
5. **AI:** birinchi bosqichda `ai_service` stub kontraktga mos javob qaytaradi (`green` default + oddiy evristika). `ai_gateway` `httpx` orqali chaqiradi (server'ga `httpx` qo'shiladi).
6. **Verifikatsiya:** `student_id`+`birth_date` — yangi `/api/bot/verify` + `/api/bot/register` endpointlari qo'shiladi; mavjud `surveys/submit` buzilmaydi (parallel ishlaydi, keyin bot ko'chiriladi).

---

## 3. DB xavfsizlik qoidalari (har fazada amal qiladi)

- Ishlash `feature/bandlik-markazi` branch'da.
- **Eski migratsiyalar hech qachon tahrirlanmaydi** — faqat yangi qo'shiladi.
- Yangi ustunlar **nullable yoki `default` bilan** (populated jadvalga `NOT NULL` default'siz qo'shilmaydi → lock/xato).
- Har migratsiya **reversible** (`reverse_code`/`RemoveConstraint` ↔ `AddConstraint`).
- Deploy oldidan: `pg_dump` backup → migratsiyani prod dump nusxasida sinash.
- Mavjud jadval/app **rename qilinmaydi**.
- `entrypoint.sh` har start'da `migrate` qiladi → migratsiyalar idempotent va tez bo'lsin.

---

## 4. Dependency o'zgarishlari

**`server/requirements.txt`ga qo'shiladi:**
```
httpx>=0.27,<0.28          # ai_gateway klienti
openpyxl>=3.1,<4.0         # analytics xlsx eksport
Pillow>=10.0,<12.0         # Employer.logo ImageField
```
**Yangi `ai_service/requirements.txt`:** `fastapi`, `uvicorn`, `pydantic` (stub).
**Bot (`bot2_service`):** yangi paket shart emas (aiogram+httpx yetarli); faqat yangi handlerlar.

**docker-compose.yml:** yangi `ai_service` xizmati qo'shiladi (server `AI_SERVICE_URL` env oladi). Celery/Redis **qo'shilmaydi**.

---

## 5. Fazalar (xavf bo'yicha tartiblangan)

### 🟢 Faza A — Nol xavf: yangi jadvallar (eski datага tegmaydi)

Bu fazaning hamma migratsiyasi faqat `CreateModel` — mavjud jadvallarга umuman ta'sir yo'q. Mustaqil deploy qilinadi.

#### A.1 — `employers` app

`server/employers/models.py`:
```python
from django.db import models
from common.models import BaseModel
from catalog.models import CatalogItem

class Employer(BaseModel):
    class Mou(models.TextChoices):
        NEGOTIATING = "negotiating", "Negotiating"
        SIGNED = "signed", "Signed"
        EXPIRED = "expired", "Expired"

    name          = models.CharField(max_length=255)
    industry      = models.ForeignKey(CatalogItem, null=True, blank=True,
                                      on_delete=models.SET_NULL, related_name="+")
    location      = models.CharField(max_length=255, blank=True)
    logo          = models.ImageField(upload_to="employers/", null=True, blank=True)
    description   = models.TextField(blank=True)
    contact_name  = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)
    mou_status    = models.CharField(max_length=12, choices=Mou.choices,
                                     default=Mou.NEGOTIATING)

    class Meta:
        ordering = ("name",)
        indexes = [models.Index(fields=["mou_status"]), models.Index(fields=["industry"])]
```
- `serializers.py`: `EmployerSerializer` (`__all__` + nested `industry_details`).
- `views.py`: `EmployerViewSet` (CRUD, `IsAuthenticated`, admin yozadi/viewer o'qiydi — `common`dagi mavjud permission pattern bo'yicha).
- `urls.py` → `router.register("employers", EmployerViewSet)` → `/api/v1/employers/`.
- `admin.py`: ro'yxatdan o'tkazish.
- INSTALLED_APPS'ga `"employers"`.
- **Pillow** kerak (logo). Migratsiya: `0001_initial` (faqat CreateModel).

#### A.2 — `crm` app (Lead, LeadStudent, AccessLink, AccessLog, FollowUp)

`server/crm/models.py`:
```python
import uuid
from django.db import models
from django.utils import timezone
from common.models import BaseModel
from employers.models import Employer

class Lead(BaseModel):
    class Status(models.TextChoices):
        CREATED = "created"; SENT = "sent"; VIEWING = "viewing"
        SELECTED = "selected"; CLOSED = "closed"
    employer   = models.ForeignKey(Employer, on_delete=models.CASCADE, related_name="leads")
    title      = models.CharField(max_length=255)
    status     = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED)
    students   = models.ManyToManyField("bot2.Bot2Student", through="LeadStudent", related_name="leads")
    created_by = models.ForeignKey("authn.User", null=True, on_delete=models.SET_NULL, related_name="+")
    notes      = models.TextField(blank=True)
    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["status"]), models.Index(fields=["employer"])]

class LeadStudent(BaseModel):
    lead    = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="lead_students")
    student = models.ForeignKey("bot2.Bot2Student", on_delete=models.CASCADE, related_name="+")
    employer_interested = models.BooleanField(default=False)
    forwarded           = models.BooleanField(default=False)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["lead", "student"], name="uq_lead_student")]

class AccessLink(BaseModel):
    lead       = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name="access_link")
    token      = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    revoked    = models.BooleanField(default=False)
    def is_valid(self):
        return (not self.revoked) and timezone.now() < self.expires_at

class AccessLog(BaseModel):
    access_link = models.ForeignKey(AccessLink, on_delete=models.CASCADE, related_name="logs")
    accessed_at = models.DateTimeField(auto_now_add=True)
    ip          = models.GenericIPAddressField(null=True)
    user_agent  = models.CharField(max_length=512, blank=True)

class FollowUp(BaseModel):
    class Stage(models.TextChoices):
        PENDING = "pending"; CONTACTED = "contacted"
        INTERVIEWED = "interviewed"; DONE = "done"
    class Outcome(models.TextChoices):
        INTERVIEWED = "interviewed"; PLACED = "placed"; NO_CONTACT = "no_contact"
    lead_student = models.ForeignKey(LeadStudent, on_delete=models.CASCADE, related_name="followups")
    stage        = models.CharField(max_length=12, choices=Stage.choices, default=Stage.PENDING)
    outcome      = models.CharField(max_length=12, choices=Outcome.choices, blank=True)
    attempts     = models.PositiveSmallIntegerField(default=0)   # 3x "Yo'q" → flag
    next_send_at = models.DateTimeField(null=True, blank=True)   # cadence 2→5→7 kun
    flagged_for_staff = models.BooleanField(default=False)
    class Meta:
        indexes = [models.Index(fields=["next_send_at"]), models.Index(fields=["stage"])]
```
- `serializers.py`: Lead (+ nested students/employer), LeadStudent, FollowUp.
- `views.py`:
  - `LeadViewSet` (CRUD) + `@action send` → `AccessLink` yaratadi (`expires_at = now + N kun`), `status="sent"`, `audit.log_audit(action="lead_send")`.
  - `PATCH /api/v1/leads/{id}` status; `PATCH /api/v1/leads/{id}/students/{sid}` (`employer_interested`,`forwarded`).
- `access.py` — **public** `/l/{token}` view (auth'siz):
  - Token tekshiruvi (`is_valid()`), `AccessLog` yozish, `lead.status` `sent`→`viewing`.
  - Faqat `is_job_seeking` yoki shu lead'dagi talabalar; faqat `Document.status=verified`; `phone` `forwarded` bo'lmaguncha `null`.
  - `POST /l/{token}/interest` → `LeadStudent.employer_interested=true`, `lead.status="selected"`.
  - Bu route `crm_server/urls.py`'da `/api/v1/`'dan **tashqarida** `l/<uuid:token>/` sifatida; nginx allaqachon faqat `/(api|superadmin|static|media)/`'ni server'ga yuboradi → **nginx'ga `/l/` location qo'shiladi** (deploy eslatmasi).
- `followup.py` — kadens mantig'i (2→5→7 kun, 3× "Yo'q" → `flagged_for_staff`).
- INSTALLED_APPS'ga `"crm"`. Migratsiya: `0001_initial` (faqat CreateModel).

#### A.3 — `documents` app + AI

`server/documents/models.py`:
```python
from django.db import models
from common.models import BaseModel

class Document(BaseModel):
    class Type(models.TextChoices):
        CV = "cv"; IELTS = "ielts"; CERT = "cert"; OTHER = "other"
    class Status(models.TextChoices):
        PENDING = "pending"; VERIFIED = "verified"; FLAGGED = "flagged"
    student     = models.ForeignKey("bot2.Bot2Student", on_delete=models.CASCADE, related_name="documents")
    type        = models.CharField(max_length=10, choices=Type.choices)
    file        = models.FileField(upload_to="documents/")
    status      = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    ai_result   = models.JSONField(null=True, blank=True)
    reviewed_by = models.ForeignKey("authn.User", null=True, on_delete=models.SET_NULL, related_name="+")
    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["status"]), models.Index(fields=["type"])]
```
- `views.py`:
  - `GET /api/v1/documents?status=flagged|pending` (review navbati, staff).
  - `PATCH /api/v1/documents/{id}/review` (`status: verified|flagged`, `reviewed_by`, `log_audit`).
  - `POST /api/v1/bot/document` (multipart, **service token**) → `Document(status=pending)` + sinxron `ai_gateway.analyze()` chaqiruvi (Celery yo'qligi sababli inline; `green`→`verified`, `yellow/red`→`flagged`).
- `server/ai_gateway/client.py`:
  ```python
  import httpx
  from django.conf import settings
  def analyze(document):
      url = settings.AI_SERVICE_URL.rstrip("/") + "/ai/document/analyze"
      payload = {"document_id": str(document.id), "doc_type": document.type,
                 "file_url": document.file.url,
                 "context": {"full_name": ..., "student_id": ...}}
      r = httpx.post(url, json=payload, timeout=30)
      r.raise_for_status()
      return r.json()   # {extracted, fraud_score, confidence, flags, recommendation}
  ```
- `ai_service/app.py` (stub, FastAPI): `POST /ai/document/analyze` → `{"extracted":{}, "fraud_score":0.05, "confidence":0.9, "flags":[], "recommendation":"green"}`.
- INSTALLED_APPS'ga `"documents"`. `httpx`, `AI_SERVICE_URL` env. Migratsiya: `0001_initial`.

---

### 🟡 Faza B — Mavjud modellarга nullable/default ustun

Hammasi `AddField` (nullable/default) yoki choices o'zgarishi → lock'siz, xavfsiz.

#### B.1 — catalog: `skill`/`industry` turlari
`catalog/models.py` `ItemType`'ga:
```python
SKILL = "skill", "Skill"
INDUSTRY = "industry", "Industry"
```
- `type`da CHECK constraint **yo'q** (faqat `(type, code)` unique) → DB cheklovi o'zgarmaydi.
- Migratsiya: `0007_add_skill_industry_types` — `AlterField(model_name="catalogitem", name="type", field=...)` (choices yangilanishi; DB jadvali o'zgarmaydi, no-op-ga yaqin).

#### B.2 — roster: `birth_date`
`bot2/StudentRoster`'ga:
```python
birth_date = models.DateField(null=True, blank=True)
```
- Migratsiya: `0010_roster_birth_date` — `AddField(..., null=True)`.
- `import_roster`/`services.parse_roster_payload` — `birth_date`ni `dd.mm.yyyy` + Excel serial'dan robust parse qilib to'ldirish (backfill keyingi import'da).

#### B.3 — Bot2Student: onboarding maydonlari
```python
language       = models.CharField(max_length=2, choices=[("uz","uz"),("ru","ru")], default="uz")
state          = models.CharField(max_length=24, default="registered")  # FSM holatini DB'da saqlash uchun
consent        = models.BooleanField(default=False)
is_job_seeking = models.BooleanField(default=False)
```
- Migratsiya: `0011_student_onboarding_fields` — to'rt `AddField` (hammasi default bilan).
- `state` — bot FSM holatini DB'ga ko'chirish uchun (hozir MemoryStorage; bot restart'da yo'qoladi). Spec talabi: state'ni DB'da saqlash, qayta `/start` davom ettirsin.

#### B.4 — survey: `source` (placement feedback uchun)
`bot2/Bot2SurveyResponse`'ga:
```python
source = models.CharField(max_length=10, choices=[("survey","survey"),("lead","lead")], default="survey")
```
- Migratsiya: `0012_survey_source` — `AddField(..., default="survey")`.

---

### 🔴 Faza C — Survey append-only (foydalanuvchi tanlovi)

Eng nozik faza. Eski qatorlar **100% saqlanadi**, faqat yozish semantikasi o'zgaradi.

**C.1 — Constraint olib tashlash.** `bot2/migrations/0013_survey_appendonly.py`:
```python
operations = [
    migrations.RemoveConstraint(
        model_name="bot2surveyresponse",
        name="uq_survey_student_campaign",   # 0008 qo'shgan edi
    ),
]
```
- Reversible: `reverse` — AddConstraint (0008'dagi bilan bir xil).
- `models.py`'dan ham `UniqueConstraint(...)` Meta'dan olib tashlanadi.

**C.2 — Yozish yo'li.** `bot2/views.py:396` `submit_survey`:
```python
# eski:
# survey, _ = Bot2SurveyResponse.objects.update_or_create(
#     student=student, survey_campaign=campaign, defaults=payload)
# yangi (append-only):
survey = Bot2SurveyResponse.objects.create(
    student=student, survey_campaign=campaign, source="survey", **payload)
```
- 409/IntegrityError bloki (views.py:403-409) endi keraksiz — olib tashlanadi yoki faqat haqiqiy DB xatosi uchun qoldiriladi.

**C.3 — Tasodifiy dublni oldini olish (constraint endi yo'q).**
Bot `/retry` (api.py) va ikki marta bosish dub yaratadi. Yengil himoya:
- `submit_survey`'da: oxirgi `Bot2SurveyResponse` aynan shu student uchun **N soniya** ichida va bir xil payload bo'lsa — qayta yaratmaslik (idempotency oynasi), yoki
- Botdan `idempotency_key` (submission UUID) qabul qilib, takror kalitni rad etish.
- Tavsiya: oddiy "oxirgi 60s + bir xil employment_status" tekshiruvi yetarli (snapshot model uchun nodir dub ham qabul qilinadi).

**C.4 — Denorm sync.** `services.upsert_roster_row` (services.py:71-74) roster o'zgarganda **barcha** survey qatorlarini yangilaydi. Append-only'da bu bir nechta snapshot'ning `program/course_year`'ini o'zgartiradi — qabul qilinadi (faqat denorm nusxa). O'zgartirish shart emas; istasak faqat oxirgi snapshot'ni yangilashga cheklash mumkin.

**C.5 — Analytics.** Mavjud analitika allaqachon "har student bo'yicha oxirgi javob" (`submitted_at` tiebreak) oladi → append-only bilan **to'g'ri ishlaydi**, o'zgarish shart emas. (Tekshirish: `analytics/views.py` latest-per-student mantig'i.)

---

### Faza D — Verifikatsiya (`student_id` + `birth_date`)

Mavjud `surveys/submit` buzilmaydi; yangi endpointlar qo'shiladi, bot keyin ko'chiriladi.

- `server/students_verify` mantig'i (yangi app shart emas — `bot2`ga qo'shsa bo'ladi):
  - `POST /api/v1/bot/verify` (service token): `{student_id, birth_date}` → roster'da `student_external_id` + `birth_date` solishtiriladi → `{match, attempts_left?, roster:{full_name?}}`. Urinishlar soni botda yoki `Bot2Student.state`/cache'da.
  - `POST /api/v1/bot/register` (service token): verify muvaffaqiyatli + `consent=true` bo'lsa `Bot2Student` create/update, `state="registered"`.
- **Backfill:** verify faqat roster'da `birth_date` to'ldirilgan talabalarда ishlaydi. To'ldirilmaguncha: eski `student_external_id`-only oqim fallback sifatida qoladi (sindirilmaydi).
- Migratsiya yo'q (B.2'dagi `birth_date` yetarli).

---

### Faza E — Follow-up + scheduler (Celery'siz)

- E.1 — Lead `send`'da yoki `forwarded=true`'da `FollowUp(next_send_at=now+2kun)` yaratiladi.
- E.2 — `server/crm/management/commands/process_followups.py`:
  - `FollowUp.objects.filter(next_send_at__lte=now, stage__in=[pending,contacted,interviewed], flagged_for_staff=False)` → botga savol yuborish (bot endpoint yoki notification jadvali orqali).
  - Javobga ko'ra kadens: 2→5→7 kun; 3× "Yo'q" → `stage=done, outcome=no_contact, flagged_for_staff=true`.
  - `POST /api/v1/bot/followup/answer` (service token) — bot javobni qaytaradi.
- E.3 — **Cron** (host yoki container): `*/30 * * * * docker compose exec server python manage.py process_followups`. (Celery beat **emas** — mavjud infra'ni murakkablashtirmaslik uchun.)
- E.4 — Joylashtirilganda (lead `closed`/placed): `Bot2SurveyResponse(source="lead", is_employed=...)` snapshot yaratiladi (monitoring oziq).

---

### Faza F — Analytics: students-by-direction + xlsx

- `analytics/views.py`'ga yangi endpoint:
  - `GET /api/v1/analytics/students-by-direction` → `[{program_name, total, registered, employed}]`
    - `total` = `StudentRoster` (program bo'yicha), `registered` = `Bot2Student`, `employed` = oxirgi `Bot2SurveyResponse` bo'yicha.
  - `GET /api/v1/analytics/students-by-direction.xlsx` → `openpyxl` bilan eksport (yangi `analytics/export.py`).
- `urls.py`'ga ikki route. `openpyxl` dependency (Faza 4).

---

### Faza G — Vacancy / Application (ixtiyoriy, oxirida)

- Yangi `vacancies` app:
  ```python
  class Vacancy(BaseModel):
      employer = FK(Employer); title; requirements(Text); deadline(Date)
      target_programs = M2M(CatalogItem, "+"); skills = M2M(CatalogItem, "+")
      status = CharField(active/closed)
  class Application(BaseModel):
      vacancy = FK(Vacancy); student = FK("bot2.Bot2Student"); status
      class Meta: unique_together = ("vacancy","student")
  ```
- `GET /api/v1/bot/vacancies?telegram_id=` (faqat mos+faol), `POST .../apply` (markazga tushadi), `POST /api/v1/vacancies` (staff).
- Migratsiya: faqat CreateModel (nol xavf).

---

## 6. Bot (`bot2_service`) o'zgarishlari

- `states.py` — yangi holatlar: `waiting_birth_date` (verify uchun), follow-up javob holatlari.
- `handlers/` — yangi oqim: hujjat yuklash (`CV/IELTS/cert` → `POST /api/v1/bot/document`), vakansiya menyusi, follow-up savol-javob, "So'rovnoma (qayta)" → har safar yangi snapshot.
- `api.py` — yangi metodlar: `verify`, `register`, `upload_document`, `get_vacancies`, `followup_answer`.
- **FSM persist:** hozir `MemoryStorage` → restart'da holat yo'qoladi. Spec talabi bo'yicha holatni `Bot2Student.state` (B.3) orqali DB'da saqlab, qayta `/start` davom ettirsin. (Bot tomonda: storage'ni backend'dan yuklash yoki har qadamda state'ni yangilash.)
- i18n: `i18n/uz.json` + `ru.json` — barcha yangi matnlar ikki tilda.

---

## 7. Dashboard (`dashboard`) o'zgarishlari

- Yangi sahifalar: `employers/`, `leads/` (kanban: created→sent→viewing→selected→closed), `documents/` (ko'rik navbati), `reports/` (students-by-direction + Excel), public `l/[token]/` (korxona ko'rinishi).
- `xlsx` paketi allaqachon bor — lekin server `.xlsx` endpoint'i tavsiya etiladi (yagona manba).
- API klient: yangi endpointlar (employers/leads/documents/analytics).

---

## 8. Deploy / migratsiya tartibi va testlar

**Tartib (xavfsizdan):** A → B → C → D → F → E → G.
(A va B mustaqil deploy qilinadi; C alohida, ehtiyotkor; D/E/F bir-biriga bog'liq emas.)

**Har deploy:**
1. `pg_dump` backup.
2. Migratsiyani prod dump nusxasida `migrate --plan` + sinov.
3. `requirements.txt` yangilangani uchun `server` image qayta build (httpx/openpyxl/Pillow).
4. `docker-compose` — `ai_service` xizmati (A.3'da), nginx'ga `/l/` location (A.2'da).
5. `entrypoint.sh` har start'da `migrate` qiladi → avtomatik qo'llanadi.

**Testlar (`server/tests`, pytest mavjud):**
- C fazasi: append-only — bir studentга 3 submit → 3 qator; analytics oxirgisini oladi; constraint yo'qligini tasdiqlash.
- A: AccessLink expiry/revoke; `/l/{token}` faqat verified hujjat + phone yashirin; AccessLog yoziladi.
- D: verify match/mismatch + attempts; consent'siz register rad etiladi.
- Audit: lead_send, document review, access-link open → `AuditLog` yoziladi.

---

## 9. Ochiq savollar (implementatsiyadan oldin tasdiqlash)

1. **AI servisi** — birinchi bosqichda stub yetarlimi, yoki real multimodal model ulanadimi? (Hozir: stub.)
2. **Scheduler** — cron + management command ma'qulmi, yoki kelajakda Celery+Redis kiritamizmi? (Hozir: cron.)
3. **Bot FSM persist** — state'ni DB'ga ko'chirish hozir kerakmi yoki Faza D bilan birga? (Hozir: B.3'da ustun, bot D'da.)
4. **`/l/` routing** — nginx'ga location qo'shish kim tomonidan (deploy egasi)?

---

_Bu plan mavjud kod holatiga (commit `417c935`) asoslangan. Modellar va migratsiyalar matnlari implementatsiyada aniqlashtiriladi._
