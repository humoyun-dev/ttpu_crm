# Ma'lumotlar modeli (ER diagramma va modellar)

Bu hujjat TTPU CRM backend'idagi **barcha ma'lumotlar modellarini** (Django ORM modellari) va ular orasidagi bog'lanishlarni to'liq tasvirlaydi. Loyihaga yangi qo'shilgan dasturchi shu hujjatni o'qib, ma'lumotlar bazasining tuzilishini — qaysi jadval qaysiga bog'langan, qaysi maydon nima uchun kerak, qaysi constraint nimani himoya qiladi — to'liq tushunishi mumkin.

Hujjat faqat **hozir kodda mavjud** modellarni hujjatlashtiradi. Modellar quyidagi fayllarda joylashgan:

| App (Django) | Fayl | Modellar |
|---|---|---|
| `common` | `server/common/models.py` | `TimeStampedModel`, `UUIDModel`, `BaseModel` (abstract), `ServiceToken` |
| `authn` | `server/authn/models.py` | `User`, `RevokedToken` |
| `catalog` | `server/catalog/models.py` | `CatalogItem`, `CatalogRelation` |
| `bot2` | `server/bot2/models.py` | `StudentRoster`, `Bot2Student`, `Bot2SurveyResponse`, `ProgramEnrollment` |
| `audit` | `server/audit/models.py` | `AuditLog` |

> **Eslatma:** Loyihada `db_table` qo'lda belgilanmagan. Shu sababli Django jadval nomlarini standart `<app>_<model>` qoidasi bo'yicha (kichik harflarda) hosil qiladi. Masalan `authn.User` → `authn_user`, `bot2.Bot2SurveyResponse` → `bot2_bot2surveyresponse`. Quyida har bir model jadvalining haqiqiy nomi keltirilgan.

---

## 1. ER diagramma (umumiy ko'rinish)

`CatalogItem` butun model grafining markazi — undan StudentRoster, Bot2Student, Bot2SurveyResponse, ProgramEnrollment va CatalogRelation FK orqali bog'lanadi. So'rovnoma (survey) domeni esa `StudentRoster → Bot2Student → Bot2SurveyResponse` zanjiri orqali quriladi.

```
                          ┌─────────────────────────────┐
                          │        CatalogItem          │  (catalog_catalogitem)
                          │  type, code, name, parent   │
                          │  PROGRAM / DIRECTION /       │
                          │  SUBJECT / TRACK / REGION    │
                          └───────────┬─────────────────┘
            parent (self, SET_NULL)   │  ▲
                  ┌───────────────────┘  │ children
                  ▼                      │
            ┌──────────┐                 │
            │ CatalogItem│ (o'z-o'ziga ierarxiya)
            └──────────┘
                  │
   ┌──────────────┼───────────────────────────────────────────────────────┐
   │ (FK lar CatalogItem ga)                                                │
   ▼              ▼                  ▼                  ▼                    ▼
CatalogRelation  StudentRoster   Bot2Student      Bot2SurveyResponse   ProgramEnrollment
from_item/to_item  program        region (REGION)    program             program
(CASCADE)        (PROTECT)       (SET_NULL)          (PROTECT)           (PROTECT)
                      │                │                  ▲   ▲
                      │ roster         │ roster           │   │
                      │ (CASCADE)      │ (CASCADE)        │   │
                      │                ▼                  │   │ roster (CASCADE)
                      │           ┌──────────┐            │   │
                      └──────────►│Bot2Student│───────────┘   │
                                  └────┬─────┘  student         │
                                       │        (CASCADE)       │
                                       └────────────────────────┘
                                          Bot2SurveyResponse

   ─────────────────── Mustaqil (alohida) modellar ───────────────────

   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │     User     │     │ RevokedToken │     │ ServiceToken │
   │ (authn_user) │     │ (JWT jti)    │     │ (bot2/dash)  │
   └──────┬───────┘     └──────────────┘     └──────────────┘
          │ actor_user (SET_NULL)
          ▼
   ┌──────────────┐
   │   AuditLog   │  (audit_auditlog)
   │ entity_table │
   │ entity_id    │
   └──────────────┘
```

**Asosiy bog'lanishlar xulosasi:**

| Manba model | Maydon | Maqsad model | `on_delete` | Izoh |
|---|---|---|---|---|
| `CatalogItem` | `parent` | `CatalogItem` (self) | `SET_NULL` | Ierarxiya (program → direction ...) |
| `CatalogRelation` | `from_item` | `CatalogItem` | `CASCADE` | Bog'lanishning chiqish nuqtasi |
| `CatalogRelation` | `to_item` | `CatalogItem` | `CASCADE` | Bog'lanishning kirish nuqtasi |
| `StudentRoster` | `program` | `CatalogItem` | `PROTECT` | Faqat `type=program` bo'lishi kerak |
| `Bot2Student` | `roster` | `StudentRoster` | `CASCADE` | Talaba ro'yxat yozuviga bog'langan |
| `Bot2Student` | `region` | `CatalogItem` | `SET_NULL` | Faqat `type=region` bo'lishi kerak |
| `Bot2SurveyResponse` | `student` | `Bot2Student` | `CASCADE` | So'rovnomani topshirgan talaba |
| `Bot2SurveyResponse` | `roster` | `StudentRoster` | `CASCADE` | Ro'yxat yozuvi (analitika uchun) |
| `Bot2SurveyResponse` | `program` | `CatalogItem` | `PROTECT` | Roster'dan denormalizatsiya |
| `ProgramEnrollment` | `program` | `CatalogItem` | `PROTECT` | Kurs bo'yicha jami talaba soni |
| `AuditLog` | `actor_user` | `User` | `SET_NULL` | Kim amal qilgan (foydalanuvchi) |

---

## 2. Abstract baza modellari (`server/common/models.py`)

Loyihada biznes-modellarning aksariyati `BaseModel`'dan meros oladi. `BaseModel` o'zi ikkita abstract mixin'dan tashkil topgan: `UUIDModel` (UUID PK) va `TimeStampedModel` (vaqt belgilari).

### `TimeStampedModel` (abstract)

| Maydon | Tip | Tavsif | Constraint / xulq |
|---|---|---|---|
| `created_at` | `DateTimeField` | Yozuv yaratilgan vaqt | `auto_now_add=True` — INSERT paytida bir marta o'rnatiladi |
| `updated_at` | `DateTimeField` | Oxirgi o'zgartirilgan vaqt | `auto_now=True` — har `save()` da yangilanadi |

`Meta.ordering = ("-created_at",)` — odatiy holatda yangi yozuvlar birinchi keladi.

### `UUIDModel` (abstract)

| Maydon | Tip | Tavsif | Constraint / xulq |
|---|---|---|---|
| `id` | `UUIDField` | Birlamchi kalit (PK) | `primary_key=True`, `default=uuid.uuid4`, `editable=False` |

UUID PK ishlatish sababi: ID'lar tashqi servislar (bot, dashboard) o'rtasida ham xavfsiz almashinadi, ketma-ket (sequential) integer'lar fosh bo'lmaydi.

### `BaseModel` (abstract)

```python
class BaseModel(UUIDModel, TimeStampedModel):
    class Meta:
        abstract = True
```

Ya'ni `BaseModel`'dan meros olgan har bir model avtomatik ravishda **`id` (UUID) + `created_at` + `updated_at`** maydonlariga ega bo'ladi. `BaseModel`'dan meros oluvchilar: `ServiceToken`, `CatalogItem`, `CatalogRelation`, `StudentRoster`, `Bot2Student`, `Bot2SurveyResponse`, `ProgramEnrollment`, `AuditLog`.

> **Istisnolar:** `User` (`AbstractUser`'dan meros, UUID PK qo'lda qo'shilgan, `created_at/updated_at` yo'q) va `RevokedToken` (oddiy `models.Model`, faqat `created_at` bor, `updated_at` yo'q) `BaseModel`'dan meros OLMAYDI.

Quyidagi har bir model jadvalida `id`, `created_at`, `updated_at` maydonlari `BaseModel`'dan kelganini hisobga oling — ular jadvallarda takror ko'rsatilmaydi (faqat istisnolarda alohida belgilanadi).

---

## 3. `User` (`server/authn/models.py`)

**Jadval:** `authn_user` | **AUTH_USER_MODEL:** `authn.User` (`server/crm_server/settings.py:122`)

`User` Django'ning `AbstractUser`'idan meros oladi, lekin `username` o'chirilgan (`username = None`) va login identifikatori sifatida **email** ishlatiladi (`USERNAME_FIELD = "email"`). UUID PK qo'lda qo'shilgan.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | Birlamchi kalit | `primary_key=True`, `default=uuid.uuid4`, `editable=False` |
| `email` | `EmailField` | Login identifikatori | `unique=True`, `USERNAME_FIELD` |
| `role` | `CharField(20)` | Foydalanuvchi roli | `choices`: `admin` / `viewer`; `default=viewer` |
| `password` | `CharField(128)` | Hash qilingan parol | `AbstractUser`'dan |
| `first_name`, `last_name` | `CharField(150)` | Ism, familiya | `blank=True` (`AbstractUser`) |
| `is_staff` | `BooleanField` | Django admin'ga kirish | `default=False` |
| `is_superuser` | `BooleanField` | Barcha huquqlar | `default=False` |
| `is_active` | `BooleanField` | Hisob faolligi | `default=True` |
| `last_login` | `DateTimeField` | Oxirgi kirish | `null=True` |
| `date_joined` | `DateTimeField` | Ro'yxatdan o'tgan sana | `default=now` |
| `groups`, `user_permissions` | `ManyToManyField` | Django guruh/ruxsatlar | `related_name="user_set"` |

**Rollar (`User.Role`):**

| Qiymat | Yorliq | Izoh |
|---|---|---|
| `admin` | Admin | To'liq CRUD huquqi |
| `viewer` | Viewer | Faqat o'qish (read-only) |

`UserManager` (`server/authn/models.py:8`):
- `create_user(email, password)` — odatiy `role=viewer`, `is_staff=False`, `is_superuser=False`.
- `create_superuser(email, password)` — `role=admin`, `is_staff=True`, `is_superuser=True`.

> `REQUIRED_FIELDS = []` — `createsuperuser` faqat email va parol so'raydi.

---

## 4. `RevokedToken` (`server/authn/models.py`)

**Jadval:** `authn_revokedtoken`

JWT token bekor qilish (logout / blacklist) uchun ishlatiladi. Bu model `BaseModel`'dan EMAS, oddiy `models.Model`'dan meros oladi — UUID PK yo'q (avtomatik BigAutoField), `updated_at` ham yo'q.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `jti` | `CharField(255)` | JWT'ning unikal identifikatori (`jti` claim) | `unique=True` |
| `token_type` | `CharField(32)` | Token turi | `choices`: `access` / `refresh` |
| `expires_at` | `DateTimeField` | Token tugash vaqti | indekslangan; tozalash uchun |
| `created_at` | `DateTimeField` | Bekor qilingan vaqt | `auto_now_add=True` |

**Indekslar (`Meta.indexes`):** `expires_at`, `token_type`.

**Asosiy metodlar:**
- `RevokedToken.is_revoked(token)` — token `jti`si bekor qilinganmi (DB'da bormi) tekshiradi.
- `RevokedToken.revoke(token, token_type)` — `get_or_create` orqali `jti` ni qora ro'yxatga qo'shadi, `exp` claim'ni `expires_at`ga aylantiradi.

---

## 5. `ServiceToken` (`server/common/models.py`)

**Jadval:** `common_servicetoken`

Server-to-server autentifikatsiya uchun: Telegram bot (bot2) yoki boshqa servislar backend'ga `X-Service-Token` orqali murojaat qiladi. Token o'zi DB'da saqlanmaydi — faqat uning **SHA-256 hash'i** (`token_hash`) saqlanadi.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `service_name` | `CharField(50)` | Servis nomi | `choices`: `bot2` / `dashboard` / `other` |
| `token_hash` | `CharField(64)` | Tokenning SHA-256 hash'i | `unique=True` (64 belgi = hex SHA-256) |
| `scope` | `CharField(100)` | Token doirasi | `default="default"` |
| `expires_at` | `DateTimeField` | Tugash vaqti (ixtiyoriy) | `null=True, blank=True` |
| `last_used_at` | `DateTimeField` | Oxirgi ishlatilgan vaqt | `null=True, blank=True` |
| `is_active` | `BooleanField` | Token faolligi | `default=True` |
| `notes` | `CharField(255)` | Izoh | `blank=True` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Servis turlari (`ServiceToken.Service`):**

| Qiymat | Yorliq |
|---|---|
| `bot2` | Bot2 |
| `dashboard` | Dashboard |
| `other` | Other |

> **Migratsiya tarixidagi farq:** `common/migrations/0001_initial.py` da `service_name` choices'da `bot1` ham bor edi (`("bot1", "Bot1")`). Hozirgi model kodida (`server/common/models.py:28`) `bot1` **olib tashlangan** — bu faqat Python darajasidagi validatsiya choices'i, DB ustunining tipi `CharField` bo'lgani uchun yangi migratsiya talab qilmaydi. Kod haqiqat: bot1 endi mavjud emas.

**Unique constraint (`Meta.constraints`):**
```python
UniqueConstraint(
    fields=["service_name", "scope"],
    condition=Q(is_active=True),
    name="active_service_scope_unique",
)
```
Ya'ni bitta `(service_name, scope)` juftligi uchun ayni vaqtda faqat **bitta faol** token bo'lishi mumkin. Eski tokenlarni `is_active=False` qilib, yangisini chiqarish (rotation) mumkin.

---

## 6. `CatalogItem` (`server/catalog/models.py`)

**Jadval:** `catalog_catalogitem`

Universal katalog — dasturlar (program), yo'nalishlar (direction), fanlar (subject), treklar (track), regionlar (region) va boshqalar bitta polimorfik jadvalda saqlanadi. Bu model grafning markazi.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `type` | `CharField(50)` | Element turi | `choices`: `program`/`direction`/`subject`/`track`/`region`/`other` |
| `code` | `CharField(100)` | Ichki kod (ixtiyoriy) | `null=True, blank=True` |
| `name` | `CharField(255)` | Asosiy nom | majburiy |
| `name_uz` | `CharField(255)` | O'zbekcha nom | `blank=True, default=""` |
| `name_ru` | `CharField(255)` | Ruscha nom | `blank=True, default=""` |
| `name_en` | `CharField(255)` | Inglizcha nom | `blank=True, default=""` |
| `parent` | `FK → self` | Ota-element (ierarxiya) | `null=True`, `on_delete=SET_NULL`, `related_name="children"` |
| `is_active` | `BooleanField` | Faollik | `default=True` |
| `sort_order` | `IntegerField` | Saralash tartibi | `default=0` |
| `metadata` | `JSONField` | Qo'shimcha ma'lumotlar | `default=dict, blank=True` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Element turlari (`CatalogItem.ItemType`):** `program`, `direction`, `subject`, `track`, `region`, `other`.

**Indekslar:** `(type, code)`, `(type, is_active)`.

**Unique constraint (qisman/partial):**
```python
UniqueConstraint(
    fields=["type", "code"],
    condition=~Q(code__isnull=True) & ~Q(code=""),
    name="catalog_item_type_code_unique_nonnull",
)
```
Ya'ni `(type, code)` juftligi unikal bo'lishi kerak — **lekin faqat `code` qiymati `NULL` ham, bo'sh string ham bo'lmagan** hollarda. Bu `code`siz (`NULL`/bo'sh) bir nechta element yaratish imkonini beradi (masalan, kodi yo'q regionlar), ammo kod berilganda takrorlanishni taqiqlaydi.

**Ierarxiya misoli:**
```
CatalogItem(type=program, name="Computer Engineering")
   └── parent ← CatalogItem(type=direction, name="Software")   (children)
```
`parent` o'chirilganda `SET_NULL` — bola element saqlanadi, lekin `parent_id` `NULL` bo'ladi (yetim qolmaydi).

---

## 7. `CatalogRelation` (`server/catalog/models.py`)

**Jadval:** `catalog_catalogrelation`

Katalog elementlari orasidagi ixtiyoriy ko'p-ko'pga (M2M) tipidagi bog'lanishlarni saqlaydi (masalan, program → direction, subject prerequisite).

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `from_item` | `FK → CatalogItem` | Bog'lanish manbai | `on_delete=CASCADE`, `related_name="outgoing_relations"` |
| `to_item` | `FK → CatalogItem` | Bog'lanish maqsadi | `on_delete=CASCADE`, `related_name="incoming_relations"` |
| `relation_type` | `CharField(100)` | Bog'lanish turi | `choices`; `default=custom` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Bog'lanish turlari (`CatalogRelation.RelationType`):**

| Qiymat | Yorliq |
|---|---|
| `program_direction` | Program → Direction |
| `program_track` | Program → Track |
| `subject_prereq` | Subject prerequisite |
| `custom` | Custom |

**Unique constraint:**
```python
UniqueConstraint(
    fields=["from_item", "to_item", "relation_type"],
    name="unique_catalog_relation",
)
```
Bir xil `(from_item, to_item, relation_type)` uchligi takrorlanmaydi.

> **Diqqat (`on_delete` farqi):** ORM'da `from_item`/`to_item` uchun `CASCADE` ishlatiladi — katalog elementi o'chsa, unga tegishli relation yozuvlari ham o'chadi. `sql-structure.sql` da esa bu FK'lar `ON DELETE RESTRICT` bilan belgilangan. **Kod (ORM) haqiqat.**

---

## 8. `StudentRoster` (`server/bot2/models.py`)

**Jadval:** `bot2_studentroster`

Rasmiy talaba ro'yxati — analitikada **maxraj (denominator)**, ya'ni "jami talaba" sifatida ishlatiladi. So'rovnomaga javob bermagan talabalar ham shu yerda turadi.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `student_external_id` | `CharField(100)` | Rasmiy talaba ID'si | `unique=True` |
| `roster_campaign` | `CharField(64)` | Ro'yxat kampaniyasi | `default="default"` |
| `program` | `FK → CatalogItem` | Talaba dasturi | `on_delete=PROTECT`, `related_name="roster_programs"`, faqat `type=program` |
| `course_year` | `PositiveSmallIntegerField` | Kurs (1-5) | validatorlar: `Min=1`, `Max=5` |
| `is_active` | `BooleanField` | Faollik | `default=True` |
| `metadata` | `JSONField` | Qo'shimcha ma'lumot | `default=dict, blank=True` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Indekslar:** `program`, `course_year`, `is_active`, `roster_campaign`.

**`course_year` semantikasi (`help_text`):** "1-4 — faol talabalar, 5 — bitiruvchilar (graduated)".

**Validatsiya (`clean()`):** `program` faqat `type=program` bo'lgan `CatalogItem`'ga ishora qilishi kerak, aks holda `ValidationError`.

> **`on_delete=PROTECT`:** dasturga (program) bog'langan roster yozuvlari mavjud bo'lsa, o'sha `CatalogItem`'ni o'chirib bo'lmaydi — bu ma'lumot yaxlitligini himoya qiladi.

---

## 9. `Bot2Student` (`server/bot2/models.py`)

**Jadval:** `bot2_bot2student`

So'rovnomaga javob bergan (yoki bot bilan muloqotga kirgan) talabaning Telegram/profil ma'lumotlari. Har bir `Bot2Student` bitta `StudentRoster` yozuviga bog'langan.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `student_external_id` | `CharField(100)` | Rasmiy talaba ID'si | `unique=True` |
| `roster` | `FK → StudentRoster` | Ro'yxat yozuvi | `on_delete=CASCADE`, `related_name="students"` |
| `telegram_user_id` | `BigIntegerField` | Telegram user ID | `null=True, blank=True, unique=True` |
| `username` | `CharField(150)` | Telegram username | `blank=True` |
| `first_name` | `CharField(150)` | Ism | `blank=True` |
| `last_name` | `CharField(150)` | Familiya | `blank=True` |
| `gender` | `CharField(32)` | Jins | `choices`; `default=unspecified` |
| `phone` | `CharField(50)` | Telefon | `blank=True` |
| `region` | `FK → CatalogItem` | Region | `on_delete=SET_NULL`, `null=True`, `related_name="bot2_students"`, faqat `type=region` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Jins (`Bot2Student.Gender`):** `male`, `female`, `other`, `unspecified` (default).

**Indekslar:** `student_external_id`, `telegram_user_id`.

**Validatsiya (`clean()` + `save()` ichida `full_clean()`):** `region` faqat `type=region` bo'lgan `CatalogItem`'ga ishora qilishi kerak. `save()` har doim `full_clean()` chaqiradi — ya'ni validatsiya DB'ga yozishdan oldin majburan ishlaydi.

> **`telegram_user_id` `NULL`+`unique`:** PostgreSQL'da bir nechta `NULL` qiymat unique constraint'ni buzmaydi, shu sababli hali Telegram'ga ulanmagan ko'plab talaba bo'lishi mumkin.

> **Tarixiy o'zgarish:** Avval `unique_roster_student_external_id` constraint mavjud edi; u `bot2/migrations/0004_remove_roster_student_constraint.py` da olib tashlangan. Endi unikallik faqat `student_external_id` ustunida (model darajasida).

---

## 10. `Bot2SurveyResponse` (`server/bot2/models.py`)

**Jadval:** `bot2_bot2surveyresponse`

Talabaning so'rovnomaga bergan javobi — analitikada **surat (numerator)**, ya'ni "javob bergan" sifatida ishlatiladi.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `student` | `FK → Bot2Student` | Javob bergan talaba | `on_delete=CASCADE`, `related_name="survey_responses"` |
| `roster` | `FK → StudentRoster` | Ro'yxat yozuvi | `on_delete=CASCADE`, `related_name="survey_responses"` |
| `program` | `FK → CatalogItem` | Dastur (denormalizatsiya) | `on_delete=PROTECT`, `related_name="bot2_program_surveys"` |
| `course_year` | `PositiveSmallIntegerField` | Kurs (denormalizatsiya) | `Min=1, Max=5` + CheckConstraint |
| `survey_campaign` | `CharField(64)` | So'rovnoma kampaniyasi | `default="default"` |
| `employment_status` | `CharField(100)` | Bandlik holati | `blank=True` |
| `employment_company` | `CharField(255)` | Kompaniya nomi | `blank=True` |
| `employment_role` | `CharField(255)` | Lavozim | `blank=True` |
| `suggestions` | `TextField` | Takliflar | `blank=True` |
| `consents` | `JSONField` | Rozilik (consent) javoblari | `default=dict, blank=True` |
| `answers` | `JSONField` | To'liq javoblar (xom) | `default=dict, blank=True` |
| `submitted_at` | `DateTimeField` | Topshirilgan vaqt | `null=True, blank=True` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Indekslar:** `survey_campaign`, `submitted_at`, `(roster, survey_campaign)`.

**CheckConstraint (`Meta.constraints`):**
```python
CheckConstraint(
    check=Q(course_year__gte=1) & Q(course_year__lte=5),
    name="survey_course_year_between_1_and_5",
)
```
DB darajasida `course_year` 1 dan 5 gacha bo'lishini kafolatlaydi.

**Denormalizatsiya va validatsiya (`clean()`):** `program` va `course_year` maydonlari aslida `roster`'da ham bor — ular bu yerga **analitika tezligi va yaxlitligi** uchun nusxalangan (denormalizatsiya). `clean()` quyidagilarni majburlaydi:
1. `student.roster_id == roster_id` — survey roster'i talabaning roster'iga mos kelishi kerak.
2. `roster.program_id == program_id` — survey dasturi roster dasturiga mos kelishi kerak.
3. `roster.course_year == course_year` — survey kursi roster kursiga mos kelishi kerak.

`save()` ichida `full_clean()` chaqiriladi — bu uchta moslik DB'ga yozishdan oldin tekshiriladi.

> **ORM vs SQL farqi:** `sql-structure.sql` da `program_id`/`course_year` PostgreSQL trigger (`bot2_survey_sync_program_course`) orqali roster'dan **avtomatik** to'ldiriladi va `roster_id` uchun `ON DELETE RESTRICT`, hamda `uq_roster_campaign UNIQUE (roster_id, survey_campaign)` constraint bor edi. ORM'da esa: (a) denormalizatsiya trigger emas, Django `clean()`/`save()` mantiqi orqali; (b) `roster` `on_delete=CASCADE`; (c) `(roster, survey_campaign)` endi **unique emas, faqat indeks**. Kod haqiqat.

---

## 11. `ProgramEnrollment` (`server/bot2/models.py`)

**Jadval:** `bot2_programenrollment`

Har bir dastur va kurs bo'yicha **jami talaba sonini** (umumiy son, alohida-alohida roster yozuvlarisiz) saqlaydi. Analitikada to'g'ridan-to'g'ri "total" sifatida ishlatish uchun yengil agregat jadval.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `program` | `FK → CatalogItem` | Dastur | `on_delete=PROTECT`, `related_name="enrollments"` |
| `course_year` | `PositiveSmallIntegerField` | Kurs (1-5) | `Min=1, Max=5` |
| `student_count` | `PositiveIntegerField` | Jami talaba soni | `default=0` |
| `academic_year` | `CharField(20)` | O'quv yili | `default="2025-2026"` |
| `campaign` | `CharField(64)` | Kampaniya identifikatori | `default="default"` |
| `is_active` | `BooleanField` | Faollik | `default=True` |
| `notes` | `TextField` | Izoh | `blank=True` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Indekslar:** `(program, course_year)`, `academic_year`, `campaign`, `is_active`.

**Unique together (`Meta.unique_together`):**
```python
unique_together = [["program", "course_year", "academic_year", "campaign"]]
```
Ya'ni bitta dastur + kurs + o'quv yili + kampaniya kombinatsiyasi uchun faqat bitta yozuv.

> Bu model `sql-structure.sql` da **mavjud emas** — u keyinchalik faqat ORM migratsiyasi orqali qo'shilgan (`bot2/migrations/0006_programenrollment.py`).

---

## 12. `AuditLog` (`server/audit/models.py`)

**Jadval:** `audit_auditlog`

Tizimda bajarilgan CRUD va auth amallarining audit jurnali. Har bir o'zgarish kim tomonidan, qaysi jadvalga, qanday qilingani (avval/keyin holati bilan) yoziladi.

| Maydon | Tip | Tavsif | Constraint |
|---|---|---|---|
| `id` | `UUIDField` | PK (`BaseModel`'dan) | UUID |
| `actor_type` | `CharField(20)` | Aktor turi | `choices`: `user` / `service` |
| `actor_user` | `FK → User` | Foydalanuvchi aktor | `on_delete=SET_NULL`, `null=True`, `related_name="audit_logs"` |
| `actor_service` | `CharField(100)` | Servis aktor nomi | `blank=True` |
| `action` | `CharField(20)` | Amal turi | `choices`; `default=other` |
| `entity_table` | `CharField(255)` | Ta'sirlangan jadval nomi | majburiy (`entity._meta.db_table`) |
| `entity_id` | `UUIDField` | Ta'sirlangan yozuv ID | `null=True, blank=True` |
| `before_data` | `JSONField` | O'zgarishdan oldingi holat | `default=dict, blank=True` |
| `after_data` | `JSONField` | O'zgarishdan keyingi holat | `default=dict, blank=True` |
| `meta` | `JSONField` | Qo'shimcha kontekst | `default=dict, blank=True` |
| `ip` | `GenericIPAddressField` | Aktor IP manzili | `null=True, blank=True` |
| `user_agent` | `TextField` | User-Agent satri | `blank=True` |
| `created_at`, `updated_at` | `DateTimeField` | `BaseModel`'dan | — |

**Aktor turi (`AuditLog.ActorType`):** `user`, `service`.

**Amal turi (`AuditLog.Action`):** `create`, `update`, `delete`, `login`, `logout`, `other` (default).

**Indekslar:** `actor_type`, `action`, `entity_table`, `created_at`.

`entity_table` qiymati audit yozuvini yaratuvchi yordamchi funksiyada (`server/audit/utils.py:63`) `entity._meta.db_table` orqali olinadi — ya'ni real DB jadval nomi (`bot2_bot2surveyresponse` kabi) saqlanadi.

> **`actor_user` `on_delete=SET_NULL`:** foydalanuvchi o'chirilsa, audit yozuvi saqlanib qoladi, faqat `actor_user_id` `NULL` bo'ladi — jurnal yaxlitligi buzilmaydi.

---

## 13. Migratsiya tarixidagi muhim o'zgarishlar

Kodning hozirgi holati bir nechta migratsiya orqali shakllangan. Eng muhim o'zgarishlar:

| Migratsiya | O'zgarish | Ta'sir |
|---|---|---|
| `common/0002_drop_bot1_tables.py` | `RunSQL` orqali `bot1_*` jadvallar `DROP TABLE ... CASCADE` qilindi, `django_migrations`'dan `bot1` yozuvlari o'chirildi | Bot1 domeni butunlay olib tashlandi. Endi faqat backend + Bot2 + dashboard mavjud |
| `catalog/0004_...` va `catalog/0006_remove_overly_strict_code_constraint.py` | `catalog_item_type_code_unique_nonnull` partial unique constraint qayta belgilandi — `code` `NULL` **va** bo'sh string emasligini talab qiladi | `code`siz elementlar erkin yaratiladi, kod berilganda takrorlanmaydi |
| `catalog/0005_add_multilingual_name_fields.py` | `name_uz`, `name_ru`, `name_en` maydonlari qo'shildi | Ko'p tilli nomlar |
| `bot2/0002_roster_campaign.py` | `StudentRoster.roster_campaign` maydoni + indeks qo'shildi | Bir nechta ro'yxat kampaniyasi |
| `bot2/0004_remove_roster_student_constraint.py` | `unique_roster_student_external_id` constraint olib tashlandi | `Bot2Student` unikalligi faqat `student_external_id`'da |
| `bot2/0005_remove_unique_roster_campaign.py` | `Bot2SurveyResponse`'dagi `unique_roster_campaign` UNIQUE constraint olib tashlandi, o'rniga `(roster, survey_campaign)` **indeksi** qo'yildi | Bir roster + kampaniya uchun bir nechta javob yozilishi mumkin (takroriy topshirish) |
| `bot2/0006_programenrollment.py` | `ProgramEnrollment` modeli yaratildi | Agregat talaba soni jadvali |
| `bot2/0007_allow_course_year_5_graduated.py` | `course_year` chegarasi 1-4 dan **1-5** ga kengaytirildi (`survey_course_year_between_1_and_4` → `survey_course_year_between_1_and_5`), `StudentRoster`, `Bot2SurveyResponse`, `ProgramEnrollment` da | `course_year=5` = bitiruvchi (graduated) |
| `authn/0002_revokedtoken.py` | `RevokedToken` modeli qo'shildi | JWT blacklist |

---

## 14. ORM vs `sql-structure.sql` farqlari (xulosa)

`server/sql-structure.sql` — loyihaning **dastlabki qo'lda yozilgan PostgreSQL sxemasi** bo'lib, u Django ORM migratsiyalaridan ANIQ tafovutga ega. **Haqiqiy ishlaydigan sxema — Django ORM modellari va migratsiyalari**, `sql-structure.sql` esa eskirgan/referens hujjat. Asosiy farqlar:

| Jihat | `sql-structure.sql` | Django ORM (hozirgi haqiqat) |
|---|---|---|
| Schema | `marketing_crm` PostgreSQL schema | standart `public` schema |
| Bot1 jadvallari | `bot1_applicants`, `bot1_admissions_2026_applications` va h.k. mavjud | butunlay **DROP** qilingan (`common/0002`) |
| Jadval nomlari | `student_roster`, `bot2_students`, `bot2_survey_responses` | `bot2_studentroster`, `bot2_bot2student`, `bot2_bot2surveyresponse` |
| Enum'lar | nomli PostgreSQL `ENUM` tiplari (`user_role`, `gender_type` ...) | Django `CharField` + `TextChoices` (DB darajasida oddiy matn) |
| `gender` qiymatlari | `male/female/other/unknown` | `male/female/other/unspecified` |
| `course_year` chegarasi | `CHECK BETWEEN 1 AND 4` | `1 AND 5` (CheckConstraint + validatorlar) |
| Survey denormalizatsiya | PostgreSQL trigger (`bot2_survey_sync_program_course`) | Django `clean()`/`save()` mantiqi |
| Survey unique | `uq_roster_campaign UNIQUE (roster_id, survey_campaign)` | UNIQUE **yo'q**, faqat indeks |
| `roster`/`program` FK o'chirish | ko'pincha `ON DELETE RESTRICT` | `StudentRoster.program`, `Bot2SurveyResponse.program` = `PROTECT`; `Bot2Student.roster`, `Bot2SurveyResponse.roster` = `CASCADE`; `Bot2Student.region` = `SET_NULL` |
| `CatalogItem.parent` | `ON DELETE RESTRICT` | `SET_NULL` |
| `CatalogRelation` FK | `ON DELETE RESTRICT` | `CASCADE` |
| `ServiceToken.service_name` | `TEXT UNIQUE` (jadval bo'yicha 1 ta) | `(service_name, scope)` partial UNIQUE faqat `is_active=True` |
| `ProgramEnrollment` | **mavjud emas** | mavjud (`bot2/0006`) |
| Vaqt belgilari | `set_updated_at()` trigger orqali | Django `auto_now`/`auto_now_add` |

> **Qoida:** ER diagramma yoki schema bo'yicha shubha tug'ilsa — `sql-structure.sql`ga emas, Django modellari va migratsiyalariga ishoning. Analitika SQL funksiyalari (`fn_bot2_*`) ham faqat shu fayldagi referens — ORM ulardan foydalanmaydi.

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) — Backend tuzilishi (common, sozlamalar, asosiy modellar)
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — Autentifikatsiya: User, JWT, rollar, service token
- [04-katalog.md](04-katalog.md) — Katalog (CatalogItem/CatalogRelation, dasturlar)
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovnoma domeni (roster, student, survey, enrollment)
- [06-analitika-va-audit.md](06-analitika-va-audit.md) — Analitika va Audit
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma
- [08-telegram-bot.md](08-telegram-bot.md) — Telegram bot servisi va FSM oqimi
- [09-dashboard.md](09-dashboard.md) — Next.js boshqaruv paneli
- [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md) — O'rnatish, deploy, seed komandalar
- [12-testlar.md](12-testlar.md) — Test qoplamasi
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari
