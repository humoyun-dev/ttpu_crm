# Testlar

Bu hujjat TTPU CRM backend (`server/`) loyihasidagi avtomatlashtirilgan test qoplamasini tushuntiradi: qaysi test stek ishlatilgan, testlarni qanday ishga tushirish kerak, umumiy fixturalar nima ish qiladi, har bir test fayli aniq qaysi xatti-harakatni tekshiradi va eng muhimi — qaysi qismlar HALI test bilan qoplanmagan. Hujjat loyihaga yangi qo'shilgan dasturchi uchun mo'ljallangan: shu hujjatni o'qib, mavjud testlarni tushunish, yangi test yozish va qoplanmagan joylarni bilish mumkin.

> Eslatma: barcha testlar faqat **backend** (Django + DRF) qismini qamrab oladi. `bot2_service/` (Telegram bot) va `dashboard/` (Next.js) uchun avtomatlashtirilgan test YO'Q.

---

## 1. Test stek

Testlar **pytest** va **pytest-django** ustiga qurilgan. DRF endpointlarini chaqirish uchun `rest_framework.test.APIClient` ishlatiladi.

| Komponent | Vazifasi |
|-----------|----------|
| `pytest` | Test ishga tushiruvchi (runner), fixture tizimi, assertlar. |
| `pytest-django` | Django bilan integratsiya: settings yuklash, test DB yaratish/o'chirish, `db` fixturasi, `settings` fixturasi, `django_db` markeri. |
| `rest_framework.test.APIClient` | HTTP so'rovlarni simulyatsiya qiluvchi mijoz. `force_authenticate(...)` bilan auth bypass, cookie bilan haqiqiy login va `HTTP_*` orqali maxsus header yuborish imkonini beradi. |
| `django.core.management.call_command` | `seed_programs`, `seed_ttpumock` kabi management komandalarini test ichidan chaqirish uchun. |

### `pytest.ini` sozlamasi

Yagona pytest konfiguratsiyasi `server/pytest.ini` faylida:

```ini
[pytest]
DJANGO_SETTINGS_MODULE = crm_server.settings
python_files = tests.py test_*.py *_tests.py
addopts = -q
```

Qatorlarning ma'nosi:

- `DJANGO_SETTINGS_MODULE = crm_server.settings` — pytest-django qaysi Django sozlamalarini yuklashini ko'rsatadi (`server/crm_server/settings.py`). Bu bo'lmasa `django.setup()` ishlamaydi.
- `python_files = ...` — pytest qaysi fayllarni test deb topishi: `tests.py`, `test_*.py` yoki `*_tests.py`. Loyihada hammasi `test_*.py` shaklida (`server/tests/` ichida).
- `addopts = -q` — har bir ishga tushirishda avtomatik `-q` (quiet) bayrog'i qo'shiladi, chiqish qisqaroq bo'ladi.

> Diqqat: `pytest` va `pytest-django` `server/requirements.txt` ichida YO'Q. requirements.txt faqat ishlab chiqarish (production) bog'liqliklarini saqlaydi (Django, DRF, simplejwt, gunicorn va h.k.). Demak testlarni ishga tushirish uchun ularni alohida o'rnatish kerak (1.3-bo'limga qarang).

### Test DB

Sozlamalar PostgreSQL ishlatadi, lekin `USE_SQLITE` env orqali SQLite ga o'tish mumkin (`server/crm_server/settings.py`). pytest-django har bir test sessiyasida vaqtinchalik **test ma'lumotlar bazasini** yaratadi, transaksiyalar bilan har bir testdan keyin tozalaydi va sessiya oxirida o'chiradi. Lokal tezkor ishga tushirish uchun SQLite qulay.

---

## 2. Testlarni ishga tushirish

Barcha komandalar `server/` katalogidan turib bajariladi (chunki `pytest.ini` shu yerda).

### 2.1 Oddiy ishga tushirish

```bash
cd server
pytest
```

`addopts = -q` tufayli chiqish qisqa bo'ladi. Boshqa foydali variantlar:

```bash
# Bitta fayl
pytest tests/test_auth_and_permissions.py

# Bitta test funksiya
pytest tests/test_bot2_survey.py::test_survey_without_roster_returns_error

# Klass ichidagi bitta metod (test_bot2_flow.py klasslardan iborat)
pytest tests/test_bot2_flow.py::TestBot2SurveySubmission::test_submit_survey_creates_roster_and_student

# Batafsil (verbose) chiqish — -q ni bekor qiladi
pytest -v

# Nom bo'yicha filtr (substring)
pytest -k "roster"
```

### 2.2 SQLite bilan tezkor ishga tushirish

PostgreSQL test serveri yo'q bo'lsa, SQLite bilan:

```bash
cd server
USE_SQLITE=1 pytest
```

### 2.3 Test bog'liqliklarini o'rnatish (coverage bilan)

pytest production requirements ichida yo'qligi sababli, test muhitini alohida tayyorlash kerak:

```bash
cd server
pip install pytest pytest-django pytest-cov
```

`pytest-cov` o'rnatilgandan keyin coverage hisobotini olish:

```bash
# Terminalga qaysi qatorlar qoplanmaganini chiqaradi
pytest --cov=. --cov-report=term-missing

# Faqat asosiy applar uchun
pytest --cov=authn --cov=catalog --cov=bot2 --cov=analytics --cov=common
```

> Coverage konfiguratsiyasi (`.coveragerc` yoki `pyproject.toml` ichidagi `[tool.coverage]`) loyihada YO'Q — yuqoridagi bayroqlarni har safar qo'lda berish kerak.

---

## 3. `conftest.py` umumiy fixturalari

`server/tests/conftest.py` — bu fayl `tests/` katalogidagi BARCHA testlarga avtomatik ko'rinadigan umumiy fixturalarni belgilaydi. pytest ularni alohida import qilmasdan, faqat funksiya argumenti nomi orqali topadi.

```python
# server/tests/conftest.py
import pytest
from rest_framework.test import APIClient
from authn.models import User
from catalog.models import CatalogItem


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        email="admin@example.com", password="pass1234",
        role=User.Role.ADMIN, is_staff=True
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        email="viewer@example.com", password="pass1234",
        role=User.Role.VIEWER, is_staff=False
    )


@pytest.fixture
def program_item(db):
    return CatalogItem.objects.create(
        type=CatalogItem.ItemType.PROGRAM, name="Program A", code="PA"
    )
```

| Fixture | Tip | Nima qaytaradi / vazifasi |
|---------|-----|---------------------------|
| `api_client` | `APIClient` | Toza DRF HTTP mijozi. Hech qanday auth holatisiz. |
| `admin_user` | `User` | `role=ADMIN`, `is_staff=True` foydalanuvchi. Paroli `pass1234`. `db` ga bog'liq, demak DB yozishga ruxsat oladi. |
| `viewer_user` | `User` | `role=VIEWER`, `is_staff=False`. Faqat o'qish huquqi bo'lgan foydalanuvchini ifodalaydi. |
| `program_item` | `CatalogItem` | `type=PROGRAM`, `name="Program A"`, `code="PA"` katalog yozuvi. Roster/survey testlarida dastur sifatida ishlatiladi. |

> `db` fixturasi pytest-django dan keladi va testga DB ga kirish (yozish/o'qish) ruxsatini beradi hamda testdan keyin avtomatik orqaga qaytaradi (rollback).

### Lokal (file-local) fixturalar

Ba'zi fayllar conftest.py dagilarni qaytadan, o'z ehtiyojiga moslab belgilaydi:

- `server/tests/test_bot2_flow.py` o'zining `api_client`, `admin_user` (email `admin@test.com`), `service_token`, `sample_direction` (type=DIRECTION), `sample_region` (type=REGION) fixturalarini yaratadi. Bu lokal fixturalar conftest.py dagilarni shu fayl doirasida ustun (override) qiladi.
- `server/tests/test_bot2_survey.py` `autouse=True` bo'lgan `service_tokens` fixturasini belgilaydi — har bir testdan oldin avtomatik `settings.SERVICE_TOKENS = {"bot2": _hashed("secret")}` o'rnatadi, shunda `X-SERVICE-TOKEN: secret` bilan kelgan so'rov backendda to'g'ri tekshiriladi.

---

## 4. Test fayllari va ular tekshiradigan xatti-harakatlar

`server/tests/` ichida 8 ta test fayli bor (conftest.py dan tashqari).

### 4.1 `test_auth_and_permissions.py` — autentifikatsiya va rollar

Cookie asosidagi login, `/auth/me` va rol-asoslangan ruxsatlarni tekshiradi.

| Test funksiyasi | Tekshiradi |
|-----------------|-----------|
| `test_login_and_me` | `POST auth-login` 200 qaytaradi va javob cookie'larida `access_token` bor. Keyin shu cookie bilan `GET auth-me` 200 va `email`/`role` to'g'ri. |
| `test_viewer_cannot_modify_catalog` | `viewer_user` `force_authenticate` qilinib, `POST catalog-item-list` ga so'rov yuboradi → **403 FORBIDDEN** (viewer yozolmaydi). |
| `test_admin_can_crud_catalog` | `admin_user` katalog yaratadi (`POST` → 201) va keyin tahrirlaydi (`PATCH` → 200, `name == "Updated"`). To'liq metadata (`level`, `track`, `language`, `duration_years`) bilan PROGRAM yaratiladi. |

Login oqimini ko'rsatadigan kod parchasi:

```python
resp = api_client.post(reverse("auth-login"),
    {"email": admin_user.email, "password": "pass1234"}, format="json")
assert "access_token" in resp.cookies
api_client.cookies = resp.cookies          # cookie'ni keyingi so'rovlarga uzatadi
me_resp = api_client.get(reverse("auth-me"))
```

### 4.2 `test_bot2_survey.py` — survey submit, roster manbasi

Service token bilan survey topshirish va roster qoidalarini tekshiradi. `autouse` `service_tokens` fixturasi har testdan oldin `settings.SERVICE_TOKENS = {"bot2": _hashed("secret")}` o'rnatadi.

| Test funksiyasi | Tekshiradi |
|-----------------|-----------|
| `test_survey_without_roster_returns_error` | Roster yo'q va `program_id` ham berilmagan holatda `POST bot2-survey-submit` → **400** va `error.code == "ROSTER_NOT_FOUND"`. |
| `test_survey_with_roster_uses_roster_values` | Roster oldindan mavjud bo'lsa, payload'dagi `program="WRONG"` va `course_year=4` E'TIBORGA OLINMAYDI — backend roster qiymatlarini manba (source of truth) deb oladi. Javob `roster.program_id`/`course_year` rosterdagidek, yaratilgan `Bot2SurveyResponse.program_id`/`course_year`/`roster_id` rosterga mos, hamda `Bot2Student` yaratilgan. |

> "Server override" g'oyasi: agar roster bazada bo'lsa, bot yuborgan dastur/kurs qiymatlari rad qilinadi va rosterdagi qiymat ishlatiladi. Bu xatti-harakat `server/bot2/views.py:submit_survey` ning `else: course_year = roster.course_year` shoxida.

### 4.3 `test_bot2_flow.py` — end-to-end registratsiya oqimi

Eng to'liq integratsion fayl. Klasslarga bo'lingan. Lokal fixturalar: `admin_user` (`admin@test.com`), `service_token = "raw-bot2-service-token"`, `sample_direction` (type=DIRECTION), `sample_region` (type=REGION).

**`TestBot2Authentication`** — login va katalogga kirish:

| Test | Tekshiradi |
|------|-----------|
| `test_login_returns_tokens` | `POST /api/v1/auth/login` javob TANASIDA `access`, `refresh`, `user` qaytaradi; `user.email` to'g'ri. |
| `test_get_directions_requires_auth` | Auth'siz `GET /api/v1/catalog/items/?type=direction` → **401**. |
| `test_get_directions_with_auth` | Login qilib olingan `access` token bilan `Authorization: Bearer <token>` → 200, `results` ichida `DIR-SOFT-UZ` keladi. |

**`TestBot2SurveySubmission`** — survey topshirishning to'liq oqimi:

| Test | Tekshiradi |
|------|-----------|
| `test_submit_survey_without_service_token` | Service token'siz `POST /api/v1/bot2/surveys/submit` → **403**. |
| `test_submit_survey_creates_roster_and_student` | To'liq payload (program_id, region_id, profil, employment, consents, answers) bilan: roster avto-yaratiladi (`course_year=1`, `roster_campaign="bot2_auto"`), `Bot2Student` to'liq maydonlar bilan, `Bot2SurveyResponse` employment va consents bilan saqlanadi. |
| `test_submit_survey_updates_existing_student` | Bir xil `student_external_id` bilan ikki marta topshirish → **dublikat yaratilmaydi**: roster va student soni 1 ta bo'lib qoladi, ikkinchi topshirishdagi yangilangan qiymatlar (ism, jins, region, employment) ustun (idempotent upsert). |
| `test_submit_survey_without_program_id_fails` | Roster yo'q va `program_id` yo'q → **400**, `error.code` ichida `ROSTER_NOT_FOUND`. |
| `test_submit_survey_with_invalid_program_id` | Mavjud bo'lmagan UUID `program_id` → **400**, `error.code` ichida `INVALID_PROGRAM`. |

**`TestBot2DataIntegrity`** — model darajasidagi cheklovlar:

| Test | Tekshiradi |
|------|-----------|
| `test_student_external_id_unique` | Bir xil `student_external_id` bilan ikkinchi `StudentRoster` yaratish `Exception` (IntegrityError) ga olib keladi. |
| `test_region_must_be_region_type` | `Bot2Student.region` ga DIRECTION tipidagi `CatalogItem` berilsa, `save()` `Exception` (ValidationError) chiqaradi — `region` faqat REGION tipini qabul qiladi. |

> Eslatma: `sample_direction` DIRECTION tipida. `submit_survey` `program_id` sifatida PROGRAM ham, DIRECTION ham qabul qiladi (`server/bot2/views.py`: `Q(type=PROGRAM) | Q(type=DIRECTION)`).

ASCII bilan end-to-end oqim:

```
   login (admin)            catalog o'qish           survey submit (bot)
        │                        │                          │
POST /auth/login          GET /catalog/items/?type=    POST /bot2/surveys/submit
   → access token            Bearer <access>             X-SERVICE-TOKEN: <raw>
                                                              │
                              roster bormi? ──── yo'q ───► program_id bormi?
                                  │                            │ ha          │ yo'q
                                  ha                           ▼             ▼
                                  ▼                    roster avto-yaratish  400
                          rosterdagi qiymat            (roster_campaign=     ROSTER_NOT_FOUND
                          manba (override)              "bot2_auto")
                                  │                            │
                                  └──────────┬─────────────────┘
                                             ▼
                            Bot2Student + Bot2SurveyResponse upsert
                                (qayta topshirsa idempotent)
```

### 4.4 `test_integrity.py` — model va analitika yaxlitligi

Katalog cheklovlari, roster sinxronizatsiyasi, coverage filtri va logout revoke'ni tekshiradi.

| Test | Tekshiradi |
|------|-----------|
| `test_catalog_null_code_duplicate_allowed` | Bir xil tipdagi (PROGRAM) ikkita item `code=None` bilan yaratilishi MUMKIN — null code'lar dublikat hisoblanmaydi. |
| `test_catalog_non_null_code_duplicate_not_allowed` | Bir xil tip + bir xil null bo'lmagan `code="DUP"` → **IntegrityError**. |
| `test_student_roster_rejects_non_program` | `StudentRoster.program` ga REGION tipidagi item berilsa, `full_clean()` **ValidationError** chiqaradi (program faqat PROGRAM/DIRECTION bo'lishi kerak). |
| `test_roster_updates_keep_surveys_in_sync` | `upsert_roster_row` mavjud rosterni yangilaganda (`created is False`), unga bog'liq `Bot2SurveyResponse` ham yangilanadi — `program_id` va `course_year` rosterga sinxron bo'lib qoladi. |
| `test_coverage_denominator_filters_campaign` | `analytics-bot2-course` da `campaign` parametri maxraj (denominator) ni filtrlaydi: `default` kampaniyada `total=1, responded=1`; `alt` kampaniyada `total=1, responded=0` (alt rosterda javob yo'q). |
| `test_logout_revokes_access_cookie` | Login qilingan access cookie `POST auth-logout` dan keyin bekor qilinadi: o'sha cookie bilan yangi mijoz `GET auth-me` → **401** (token denylist'ga tushadi). |

`upsert_roster_row` sinxronizatsiya mantig'ini ko'rsatuvchi parcha:

```python
updated = upsert_roster_row({"student_external_id": "s1",
    "program": other_program, "course_year": 2, "is_active": True,
    "roster_campaign": "default"})
assert updated is False          # yangi emas, mavjud roster yangilandi
survey.refresh_from_db()
assert survey.program_id == other_program.id   # survey ham yangilandi
assert survey.course_year == 2
```

### 4.5 `test_programs.py` — `seed_programs` va dastur endpointi

`pytestmark = pytest.mark.django_db` butun fayl uchun DB ruxsatini yoqadi.

| Test | Tekshiradi |
|------|-----------|
| `test_seed_programs_idempotent` | `seed_programs` ikki marta chaqirilganda PROGRAM soni `13` bo'lib qoladi (idempotent), barcha `code` qiymatlari unikal. |
| `test_program_endpoint_filters_by_level_and_track` | `GET catalog-program-list?level=bachelor&track=italian` → barcha qatorlar `bachelor`+`italian`; ro'yxatda `MECHANICAL ENGINEERING` bor. |
| `test_program_endpoint_includes_masters` | `?level=master` → ro'yxatda `MASTER OF BUSINESS ADMINISTRATION (MBA)` va `MECHATRONIC ENGINEERING` bor; barcha master dasturlarning `track`'i faqat `{"n/a"}`. |
| `test_invalid_program_metadata_rejected` | To'liq bo'lmagan metadata (`{"level": "bachelor"}`, qolgan maydonlarsiz) bilan PROGRAM yaratish → **400**, `error.code == "INVALID"`, `details` ichida `non_field_errors`. |

> `seed_programs` aniq **13** dastur kiritadi: 6 ta bachelor `italian`, 3 ta bachelor `uzbek`, 4 ta master `n/a` (`server/catalog/management/commands/seed_programs.py:PROGRAMS`).

### 4.6 `test_analytics.py` — coverage analitikasi

| Test | Tekshiradi |
|------|-----------|
| `test_analytics_requires_time_range` | `from`/`to` parametrlarsiz `GET analytics-bot2-course` → **400**, `error.code == "TIME_RANGE_REQUIRED"`. |
| `test_course_year_coverage_includes_all_years` | 1-4 kurslar uchun roster yaratilib, faqat 1-kurs javob bersa: javobda **5 ta qator** (kurs 1-5), `year_map[1].responded == 1`, va 1,2,3,4,5 kurslarning hammasi bor. |

> Coverage endpointi hamisha 5 kurs qatorini qaytaradi (1-5), hatto 5-kurs uchun roster bo'lmasa ham — bu UI da to'liq jadval ko'rsatish uchun.

### 4.7 `test_seed_ttpumock.py` — soxta (mock) ma'lumot generatori

`seed_ttpumock` management komandasini tekshiradi. Yordamchi: `run_seed(seed, scale)` → `call_command("seed_ttpumock", "--upsert", "--seed", str(seed), "--scale", scale, "--days", "60")`.

| Test | Tekshiradi |
|------|-----------|
| `test_seed_idempotent_counts` | Bir xil `seed=42` bilan ikki marta `--upsert` ishga tushirilsa, `StudentRoster` soni o'zgarmaydi (idempotent). |
| `test_course_year_within_bounds` | Generatsiya qilingan barcha roster va survey `course_year` qiymatlari **1 dan 4 gacha** chegarada. |
| `test_programs_restricted_to_tppu` | Rosterlardagi dastur kodlari katalogdagi PROGRAM kodlarining qism to'plami (subset) — soxta dasturlar TTPU dastur ro'yxatidan chiqib ketmaydi. |
| `test_analytics_not_empty` | Seed'dan keyin keng vaqt oralig'i (2024-2027) bilan coverage so'ralganda kamida bitta qatorda `responded > 0`. |

### 4.8 Test fayllari xulosa jadvali

| Fayl | Asosiy fokus | DB markeri |
|------|--------------|------------|
| `test_auth_and_permissions.py` | Cookie login, /auth/me, rol ruxsatlari | har test `*_user` fixturasi orqali |
| `test_bot2_survey.py` | Survey submit, roster override | fayl-darajasida `pytest.mark.django_db` |
| `test_bot2_flow.py` | End-to-end registratsiya oqimi | klass/metod `@pytest.mark.django_db` + `db` fixtura |
| `test_integrity.py` | Model cheklovlari, sinxronizatsiya, logout | `db`/fixtura orqali |
| `test_programs.py` | `seed_programs`, dastur filtri | fayl-darajasida `pytest.mark.django_db` |
| `test_analytics.py` | Coverage time-range va 5-kurs qatori | fixtura orqali |
| `test_seed_ttpumock.py` | Soxta ma'lumot generatori | fayl-darajasida `pytest.mark.django_db` |

---

## 5. QOPLANMAGAN qismlar (test bo'shliqlari)

Quyidagilar HOZIRDA avtomatlashtirilgan test bilan **qoplanmagan**. Yangi xususiyat qo'shganda yoki regressiyadan ehtiyot bo'lganda shularni nazarda tutish kerak:

- **Bot2 Telegram servisi (`bot2_service/`)** — FSM holatlari, `CatalogCache` (15-daqiqalik TTL), `SingleInstanceLock`, aiogram handlerlari uchun hech qanday test yo'q. Faqat backend endpointi tekshiriladi.
- **JWT refresh oqimi** — `auth-refresh` endpointi (access tokenni refresh orqali yangilash) bevosita test qilinmagan. Login va logout bor, lekin refresh-retry sikli yo'q.
- **Audit** (`server/audit/`) — audit log yozish (`AuditLog` yaratish, kim/qachon/nima o'zgartirgani) test bilan qoplanmagan.
- **`import_roster`** — roster'ni fayldan (CSV/Excel) import qiluvchi management komanda yoki endpoint test qilinmagan. Faqat `upsert_roster_row` funksiyasi va `seed_*` komandalar tekshiriladi.
- **`ServiceToken` DB yo'li** — `verify_service_token` avval DB dagi `ServiceToken.token_hash` ga, keyin `settings.SERVICE_TOKENS` ga solishtiradi. Testlar FAQAT `settings.SERVICE_TOKENS` (env/settings) yo'lini qoplaydi; DB dagi `ServiceToken` yozuvi orqali tekshiruv (va revoke/expiry) test qilinmagan.
- **Dashboard (`dashboard/`)** — Next.js SPA uchun hech qanday unit yoki e2e test yo'q (`apiFetch` 401→refresh retry, `proxy.ts` cookie gate, sahifalar).
- **Boshqa qoplanmagan tafsilotlar:**
  - `auth-refresh` va token rotatsiyasi;
  - throttling / rate-limit (`common/throttles.py`);
  - xato envelopining barcha shoxlari (`custom_exception_handler` ning hamma kodlari — masalan `INVALID_COURSE_YEAR`, `INVALID_REGION` bevosita tekshirilmagan);
  - `CatalogRelation` modeli va u bilan bog'liq endpointlar;
  - paginatsiya chegaraviy holatlari;
  - serializerlarning to'liq validatsiya matritsasi.

---

## 6. Yangi test yozish bo'yicha amaliy maslahatlar

- Yangi test faylini `server/tests/test_<mavzu>.py` deb nomlang (chunki `python_files` `test_*.py` ni topadi).
- DB kerak bo'lsa: yo funksiyaga `db` fixturasini argument qiling, yo fayl boshiga `pytestmark = pytest.mark.django_db` qo'ying.
- HTTP endpoint testida `api_client` fixturasini oling. Auth talab qilsa: tez yo'l — `api_client.force_authenticate(user=admin_user)`; haqiqiy oqim — `auth-login` orqali login qilib cookie/token oling.
- Service token talab qilinadigan endpoint (`bot2-survey-submit`) uchun `settings.SERVICE_TOKENS = {"bot2": _hashed("...")}` o'rnating va so'rovga `HTTP_X_SERVICE_TOKEN="..."` bering (`test_bot2_survey.py` namunasiga qarang).
- URL larni qattiq yozmang — `reverse("<name>")` ishlating (nomlar `server/crm_server/urls.py` da: `auth-login`, `auth-me`, `auth-logout`, `catalog-item-list`, `catalog-program-list`, `bot2-survey-submit`, `analytics-bot2-course`).

---

## Tegishli hujjatlar

- [README.md](./README.md) — Hujjatlar indeksi
- [03-autentifikatsiya.md](./03-autentifikatsiya.md) — Login, JWT, rollar, service token (testlar shu mexanizmlarni tekshiradi)
- [04-katalog.md](./04-katalog.md) — CatalogItem/CatalogRelation, dasturlar (`seed_programs`, dastur filtri)
- [05-bot2-backend.md](./05-bot2-backend.md) — Roster, student, survey, `upsert_roster_row`, `submit_survey`
- [06-analitika-va-audit.md](./06-analitika-va-audit.md) — Coverage analitikasi (test qilingan) va Audit (qoplanmagan)
- [07-api-malumotnoma.md](./07-api-malumotnoma.md) — Test qilingan endpointlarning to'liq ma'lumotnomasi
- [08-telegram-bot.md](./08-telegram-bot.md) — Bot2 servisi (test bilan qoplanmagan qism)
- [09-dashboard.md](./09-dashboard.md) — Dashboard (test bilan qoplanmagan qism)
- [11-deploy-va-operatsiya.md](./11-deploy-va-operatsiya.md) — Seed komandalar (`seed_programs`, `seed_ttpumock`) va o'rnatish
