# Telegram Bot Servisi (Bot 2)

Bu hujjat TTPU CRM tizimining Telegram bot servisini — `bot2_service` ni — to'liq tavsiflaydi. Bot mustaqil (standalone) `aiogram v3` ilovasi bo'lib, backend bilan faqat HTTP orqali bog'lanadi. Uning vazifasi: talaba/bitiruvchilardan FSM (Finite State Machine) asosidagi ko'p tillik so'rovnoma orqali ma'lumot yig'ish (profil, ish bilan bandlik, takliflar, roziliklar) va natijani backend'ga yuborish.

Hujjat loyihaga yangi qo'shilgan dasturchi uchun mo'ljallangan: o'qib chiqib, bot qanday ishga tushishini, foydalanuvchi sayohatini, backend bilan aloqani va konfiguratsiyani to'liq tushunib oladi.

> **Eslatma — terminologiya:** bu servis tarixiy sabablarga ko'ra "Bot 2" deb ataladi. Loyihada bir vaqtlar "Bot 1" ham bo'lgan, lekin u `98dd68c` commit'da olib tashlangan. Hozir faqat shu bitta bot mavjud. Eski hujjatlarda "Bot 1" ga oid har qanday narsa eskirgan.

---

## 1. Joylashuvi va struktura

Bot kodi `bot2_service/` papkasida. Haqiqiy kod `src/bot2_service/` ichida (Poetry "src layout"), yuqori darajadagi `bot2_service/bot2_service/` esa faqat `python -m bot2_service.main` ni repo ildizidan ishlatish uchun path-shim.

```
bot2_service/
├── pyproject.toml                 # Poetry paketi (aiogram, httpx, python-dotenv, ujson)
├── .env.example                   # Konfiguratsiya namunasi
├── README.md                      # (qisman eskirgan — pastdagi eslatmalarga qarang)
├── bot2_service/
│   └── main.py                    # Path-shim: src/ ni sys.path ga qo'shib, asl main.py ni ishga tushiradi
└── src/bot2_service/
    ├── main.py                    # Kirish nuqtasi: asyncio.run(start_bot())
    ├── handlers.py                # FSM handlerlar + start_bot() + polling loop
    ├── states.py                  # SurveyState — 16 ta FSM holati
    ├── keyboards.py               # Telegram klaviatura generatorlari
    ├── texts.py                   # Ko'p tillik matnlar (uz/ru/en) + get_text
    ├── api.py                     # CrmApiClient — backend bilan HTTP aloqa
    ├── catalog_cache.py           # CatalogCache — katalogni 15 daqiqa keshlash
    ├── config.py                  # Settings — .env dan o'qish
    └── single_instance.py         # SingleInstanceLock — fcntl flock
```

Kirish nuqtasi (`src/bot2_service/main.py`):

```python
import asyncio
from bot2_service.handlers import start_bot

if __name__ == "__main__":
    asyncio.run(start_bot())
```

Ishga tushirish:

```bash
cd bot2_service
python -m bot2_service.main          # yuqori darajadagi shim orqali
# yoki
poetry run python src/bot2_service/main.py
```

---

## 2. Ishga tushish jarayoni (`handlers.py:start_bot`)

`start_bot()` korutinasi botni boshqaradigan asosiy funksiya. U quyidagi qadamlarni bajaradi:

1. **Logging sozlash** — `logging.basicConfig(level=logging.INFO, ...)`.
2. **Single-instance lock olish** — `SingleInstanceLock.acquire_for_token(settings.bot_token, name="bot2_service")`. Agar lock band bo'lsa (`RuntimeError`), xato log qilinadi va funksiya `return` qiladi (bot ishga tushmaydi).
3. **Bot va Dispatcher yaratish:**
   - `Bot(token=settings.bot_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))` — barcha xabarlar HTML parse rejimida.
   - `Dispatcher(storage=MemoryStorage())` — FSM holatlari **xotirada** saqlanadi.
4. **Bog'liqliklarni tayyorlash:** `CrmApiClient()` va `CatalogCache(api=api)` yaratiladi, `setup_dependencies(api, cache)` orqali handler modulidagi global `api_client` va `catalog` o'zgaruvchilariga o'rnatiladi.
5. **Router ulanadi:** `dp.include_router(router)`.
6. **Webhook o'chiriladi:** `await bot.delete_webhook(drop_pending_updates=True)` — polling webhook bilan to'qnashmasligi va eski yangiliklar tashlanishi uchun.
7. **Conflict-aware polling loop** — `_polling_exit_on_conflict(dp, bot, allowed_updates=...)` ishga tushadi (pastda batafsil).
8. **`finally` bloki tozalash:** `api.close()` (httpx client yopiladi), `bot.session.close()`, `lock.release()`.

### 2.1 SingleInstanceLock (`single_instance.py`)

Bir xil bot token bilan **bir host'da** bir nechta poller ishga tushishining oldini oladi (aks holda Telegram `TelegramConflictError` qaytaradi).

- Lock fayli: `/tmp/bot2_service-<sha256(token)[:12]>.lock` — token hash'idan nom oladi.
- `fcntl.flock(fd, LOCK_EX | LOCK_NB)` — eksklyuziv, bloklamaydigan (non-blocking) flock.
- Lock band bo'lsa → `BlockingIOError` → `RuntimeError("Another instance is already running...")`.
- Lock olingach, faylga joriy PID yoziladi.
- `release()` — flock'ni ochadi, fd ni yopadi, lock faylini o'chiradi.

```python
fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
try:
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    os.close(fd)
    raise RuntimeError(f"Another instance is already running (lock file: {lock_path}). ...")
```

> **Cheklov:** `fcntl` faqat POSIX (Linux/macOS) tizimlarida bor. Windows'da `import fcntl` xato beradi, shunda `fcntl = None` bo'ladi va `acquire_for_token` **lock'siz** ishlaydi (`fd=-1`). Bundan tashqari, lock faqat bitta host doirasida — **bir nechta server/konteyner** bo'ylab koordinatsiya qilmaydi. Ko'p-host holati faqat reaktiv ravishda `TelegramConflictError` orqali aniqlanadi.

### 2.2 Conflict-aware polling loop (`_polling_exit_on_conflict`)

aiogram'ning standart `start_polling` usuli **barcha** xatolarni cheksiz qayta urinib ko'radi. Lekin agar boshqa joyda yana bitta `getUpdates` poller ishlayotgan bo'lsa (konflikt), abadiy qayta urinish foydasiz — operator deployment'ni tuzatishi kerak. Shuning uchun maxsus polling loop yozilgan:

- **Conflict aniqlash** (`_is_conflict_error`): `TelegramConflictError` instansi, yoki turi nomi `"TelegramConflictError"`, yoki xato matnida `"terminated by other getUpdates request"` bo'lsa — konflikt deb hisoblanadi.
- **Konflikt yuz bersa:** xato log qilinadi ("Another instance is already polling this bot token...") va loop **toza** `return` qiladi (bot to'xtaydi).
- **Boshqa xatolar:** `Backoff(min_delay=1.0, max_delay=5.0, factor=1.3, jitter=0.1)` bilan kechiktirib qayta uriniladi (continue). Ulanish tiklangach, `backoff.reset()`.
- **`asyncio.CancelledError`** qayta `raise` qilinadi (graceful shutdown).
- Har bir `update` uchun `dp.feed_update(bot, update)` chaqiriladi, `get_updates.offset = update.update_id + 1`.

```python
backoff = Backoff(config=BackoffConfig(min_delay=1.0, max_delay=5.0, factor=1.3, jitter=0.1))
get_updates = GetUpdates(timeout=10, allowed_updates=allowed_updates)
while True:
    try:
        updates = await bot(get_updates, **kwargs)
    except asyncio.CancelledError:
        raise
    except Exception as e:
        if _is_conflict_error(e):
            logger.error("Polling stopped: ... Another instance is already polling ...")
            return          # operator deployment'ni tuzatishi kerak
        await backoff.asleep()
        continue
    for update in updates:
        await dp.feed_update(bot, update)
        get_updates.offset = update.update_id + 1
```

---

## 3. FSM holatlari (`states.py:SurveyState`)

So'rovnoma 16 ta holatdan iborat `StatesGroup`:

| # | Holat | Kutilayotgan kirish | Handler |
|---|-------|--------------------|---------|
| 1 | `waiting_language` | Til tugmasi (matn) | `set_language` |
| 2 | `waiting_contact` | Kontakt (`F.contact`) | `set_contact` / `contact_text_fallback` |
| 3 | `waiting_first_name` | Matn | `set_first_name` |
| 4 | `waiting_last_name` | Matn | `set_last_name` |
| 5 | `waiting_gender` | `gender:` callback | `pick_gender` |
| 6 | `waiting_region` | `region:` callback | `pick_region` |
| 7 | `waiting_student_id` | Matn | `set_student_id` |
| 8 | `waiting_program` | `program:` callback | `pick_program` |
| 9 | `waiting_course_year` | `course:` callback | `pick_course_year` |
| 10 | `waiting_employment` | `employment:` callback | `employment_choice` |
| 11 | `waiting_company` | Matn | `set_company` |
| 12 | `waiting_role` | Matn | `set_role` |
| 13 | `waiting_help` | `help:` callback | `pick_help` |
| 14 | `waiting_share_consent` | `share:` callback | `pick_share` |
| 15 | `waiting_channels` | — | **(handler yo'q — ishlatilmaydi)** |
| 16 | `waiting_suggestions` | Matn | `set_suggestions` → `_final_submit` |

> `waiting_channels` holati e'lon qilingan, lekin unga hech qanday handler bog'lanmagan va FSM unga hech qachon o'tmaydi — bu o'lik kod. Kanallar oddiy xabar sifatida (alohida holatsiz) ko'rsatiladi.

---

## 4. To'liq foydalanuvchi sayohati (oqim diagrammasi)

```
/start  (cmd_start: state.clear() → waiting_language)
  │  "🇺🇿 O'zbek" / "🇷🇺 Русский" / "🇬🇧 English"
  ▼
waiting_language ── set_language ──► til aniqlanadi (_language_from_text)
  │  Kontakt ulashish (request_contact)
  ▼
waiting_contact ── set_contact ──► phone, telegram_user_id, username, chat_id saqlanadi
  │  (matn yuborilsa → contact_text_fallback qayta so'raydi)
  ▼
waiting_first_name ── set_first_name ──► first_name
  ▼
waiting_last_name ── set_last_name ──► last_name
  ▼
waiting_gender ── pick_gender (gender:male/female) ──► gender; regions keshdan olinadi
  ▼
waiting_region ── pick_region (region:<id>) ──► region_id, region_code, region_label
  ▼
waiting_student_id ── set_student_id ──► student_id; programs (direction) keshdan olinadi
  ▼
waiting_program ── pick_program (program:<id>) ──► program_id, program_code, program_label
  ▼
waiting_course_year ── pick_course_year (course:1..5) ──► course_year (5 = bitirgan)
  ▼
waiting_employment ── employment_choice (employment:yes/no)
  │
  ├── yes (ishlaydi) ──► waiting_company ── set_company ──► waiting_role ── set_role ──┐
  │                                                                                    │
  └── no (ishlamaydi) ──► waiting_help ── pick_help (help:yes/no)                       │
                            │                                                          │
                            ├── help:yes ──► waiting_share_consent ── pick_share        │
                            │                  (share:yes/no)                           │
                            │                  └─► kanallar ko'rsatiladi ───────────────┤
                            │                                                           │
                            └── help:no ──────────────────────────────────────────────►│
                                                                                        │
  ▼ (barcha tarmoqlar bir nuqtaga keladi)                                               │
waiting_suggestions ◄───────────────────────────────────────────────────────────────────┘
  │  takliflar matni
  ▼
set_suggestions ──► _final_submit
  │
  ├── student_id bo'sh? ──► "Rahmat" ko'rsatiladi, LEKIN YUBORILMAYDI (data-loss!)
  │
  └── payload tuzib → api_client.submit_survey
        ├── ok ──► "thanks"
        └── xato ──► 1s kutib qayta urinish
                      ├── ok ──► "thanks"
                      └── xato ──► "submission_failed"
  state.clear()
```

### 4.1 Handlerlar tavsifi (`handlers.py`)

- **`cmd_start`** (`CommandStart()`): `state.clear()`, `waiting_language` ga o'tadi, til tugmalarini ko'rsatadi. Til so'rovi `get_text("ask_language", "uz")` — har doim uzbekcha kalit bilan (uchala til matnida ham bir xil "Tilni tanlang / Выберите язык / Choose language:").
- **`set_language`**: `_language_from_text(message.text)` orqali tilni aniqlaydi. Mantiq: matnda "рус"/"🇷🇺" → `ru`, "eng"/"🇬🇧" → `en`, aks holda → `uz`. So'ng kontakt so'raladi.
- **`set_contact`** (`F.contact` filtri): kontaktdan `phone_number`, `from_user.id` (→ `telegram_user_id`), `username`, `chat.id` olinadi.
- **`contact_text_fallback`**: foydalanuvchi kontakt o'rniga matn yuborsa, kontakt so'rovi qayta ko'rsatiladi.
- **`set_first_name` / `set_last_name`**: matn `strip()` qilinadi.
- **`pick_gender`** (`gender:` callback): `gender` saqlanadi, `catalog.get_regions()` chaqiriladi, regionlar inline klaviatura sifatida ko'rsatiladi.
- **`pick_region`** (`region:` callback): tanlangan region `id` bo'yicha keshdan topiladi. Til bo'yicha nom (`name_<lang>` yoki `metadata.name_<lang>` yoki `name`) `region_label` ga yoziladi.
- **`set_student_id`**: student ID saqlanadi, `catalog.get_programs()` chaqiriladi, dasturlar ko'rsatiladi.
- **`pick_program`** (`program:` callback): tanlangan dastur keshdan topiladi, `program_id/code/label` saqlanadi.
- **`pick_course_year`** (`course:` callback): `year = int(...)`. Klaviatura 1–4 kurs + "Bitirganman" (`course:5`).
- **`employment_choice`** (`employment:` callback): `employed = (choice == "yes")`. `yes` → `waiting_company`; `no` → `waiting_help`.
- **`set_company` / `set_role`**: ishlaydigan foydalanuvchi uchun kompaniya va lavozim; so'ng to'g'ridan-to'g'ri `waiting_suggestions`.
- **`pick_help`** (`help:` callback): `want_help` saqlanadi. `yes` → `waiting_share_consent` (ma'lumot ulashish roziligi); `no` → `waiting_suggestions`.
- **`pick_share`** (`share:` callback): `share_consent` saqlanadi, kanallar (`channels_keyboard`) ko'rsatiladi, so'ng `waiting_suggestions`.
- **`set_suggestions`**: takliflar saqlanadi, oldingi xabarlar tozalanadi, `_final_submit` chaqiriladi.

### 4.2 Xabarlarni tozalash mantiq'i

Chat'ni toza saqlash uchun ko'makchi funksiyalar mavjud:
- `_send_and_save(message, ...)` — yangi xabar yuboradi, uning ID'sini va foydalanuvchi xabari ID'sini state'ga yozadi, oldingilarni o'chiradi (`last_bot_message_id`, `last_user_message_id`).
- `_send_and_save_callback(call, ...)` — callback bo'lganda, inline klaviatura bosilgan xabarni o'chirib, yangi xabar yuboradi.
- `_delete_previous_messages(...)` — oldingi bot va foydalanuvchi xabarlarini xatosiz (silently) o'chiradi.

---

## 5. So'rovni yuborish (`_final_submit`)

`_final_submit(message, state)` so'rovnomani yakunlaydi:

1. **Validatsiya:** `student_id` bo'sh yoki faqat bo'shliqdan iborat bo'lsa, `logger.error(...)` yoziladi, foydalanuvchiga "thanks" ko'rsatiladi, `state.clear()` qilinadi va **payload backend'ga YUBORILMAYDI**.

   > **Data-loss riski:** bu holatda foydalanuvchi "Rahmat, ma'lumotlaringiz qabul qilindi" xabarini ko'radi, ammo aslida hech narsa saqlanmaydi. Faqat log'da xato qoladi. Bu jim (silent) data-loss — `_final_submit` ga `payload` validatsiyasidan tashqari hech qanday foydalanuvchini ogohlantiruvchi mexanizm yo'q.

2. **Payload tuzish** (pastdagi 5.1).
3. **Yuborish:** `api_client.submit_survey(payload)`. Agar `res.ok` bo'lmasa, `asyncio.sleep(1)` va bir marta qayta urinish. Ikkala urinish ham muvaffaqiyatsiz bo'lsa → `submission_failed` matni.
4. **Har holatda** `state.clear()`.

### 5.1 Yuborilayotgan payload tarkibi

`POST /bot2/surveys/submit` ga yuboriladigan JSON (handler'dagi haqiqiy maydonlar):

```json
{
  "student_external_id": "sen7115",
  "telegram_user_id": 123456789,
  "username": "john_doe",
  "phone": "+998901234567",
  "first_name": "John",
  "last_name": "Doe",
  "gender": "male",
  "region_id": "<uuid>",
  "region_code": "tashkent_city",
  "program_id": "<uuid>",
  "program_code": "B-IT-COMPE",
  "course_year": 4,
  "language": "uz",
  "employment_status": "employed",
  "employment_company": "Tech Company",
  "employment_role": "Software Engineer",
  "suggestions": "Amaliyot dasturlarini kuchaytirish kerak",
  "consents": {
    "share_with_employers": false,
    "want_help": false
  },
  "answers": {
    "region_label": "Toshkent shahri",
    "program_label": "Computer Engineering",
    "course_year": 4
  }
}
```

Maydonlar manbasi:
- `student_external_id` — `data["student_id"]` (strip qilingan).
- `telegram_user_id`, `username`, `phone` — kontaktdan.
- `gender` — `male`/`female`, bo'lmasa `"unspecified"`.
- `employment_status` — `"employed"` agar `data["employed"]` bo'lsa, aks holda `"unemployed"`.
- `consents.share_with_employers` — `share_consent` (default `False`).
- `consents.want_help` — `want_help` (default `False`).
- `answers` — faqat ko'rsatish/audit uchun teglar: `region_label`, `program_label`, `course_year`.

> **README bilan farq:** `bot2_service/README.md` payload'da `survey_campaign`, tasdiqlash (confirm) qadami va `answers.channel` borligini aytadi. **Kod bularning hech birini yubormaydi.** README bu qismda eskirgan — haqiqat yuqoridagi payload. Backend `survey_campaign` ni o'zi "default" qilib qo'yadi (qarang [05-bot2-backend.md](05-bot2-backend.md)).

---

## 6. Backend bilan aloqa (`api.py:CrmApiClient`)

`CrmApiClient` ikki xil autentifikatsiyadan foydalanadi: **katalog o'qish uchun JWT** va **so'rov yuborish uchun service token**.

HTTP client — `httpx.AsyncClient`:
- `base_url = settings.server_base_url` (default `http://localhost:8000/api/v1`).
- timeout: `connect=5s, read=15s, write=10s, pool=5s`.
- `follow_redirects=True`, `limits(max_connections=20, max_keepalive_connections=10)`.

`ApiResult` dataclass — natija konteyneri: `ok: bool`, `data`, `error: str | None`, `status: int | None`.

### 6.1 Katalog o'qish (JWT bilan)

1. **`login_dashboard()`** — agar `email`/`password` berilmagan bo'lsa, warning va `False`. Allaqachon kirilgan bo'lsa (`_logged_in` va `_auth_token`), `True`. Aks holda `POST /auth/login` (JSON `{email, password}`) → javobdan `access` JWT olinadi, `_auth_token` ga saqlanadi.
2. **`_get_catalog(item_type)`** — avval `login_dashboard()`. So'ng `GET /catalog/items/?type=<t>&is_active=true` ni `Authorization: Bearer <jwt>` bilan chaqiradi.
   - **401 → qayta login:** birinchi urinishda 401 kelsa, token tozalanadi, qayta login qilinadi va so'rov **bir marta** takrorlanadi.
   - Boshqa non-200 → warning + bo'sh ro'yxat.
   - Javob DRF `{"results": [...]}` (paginatsiyalangan) yoki to'g'ridan-to'g'ri `[...]` ro'yxat bo'lishi mumkin — ikkalasi ham qo'llab-quvvatlanadi.
3. **Qulay metodlar:**
   - `get_programs()` → `_get_catalog("direction")` — **dasturlar `direction` tipidagi katalog itemlardan olinadi** (bakalavriat yo'nalishlari).
   - `get_regions()` → `_get_catalog("region")`.
   - `get_catalog_items(item_type)` — umumiy (har qanday tip).

> Diqqat: dastur tanlash uchun `type=direction` ishlatiladi, `type=program` emas. Bu muhim nuans — backend'da `program` va `direction` ikki alohida katalog tipi (qarang [04-katalog.md](04-katalog.md)).

### 6.2 So'rov yuborish (service token bilan)

- **`_post_service(path, payload)`** — `X-SERVICE-TOKEN: <raw>` header bilan POST qiladi (JWT ishlatmaydi).
  - `httpx.TimeoutException` → birinchi urinishda qayta urinadi, ikkinchisida `ApiResult(ok=False, error="Timeout: ...")`.
  - `httpx.ConnectError` → 1s kutib qayta urinadi.
  - 2xx → `ApiResult(ok=True, data=..., status=...)`.
  - 5xx → birinchi urinishda 1s kutib qayta urinadi.
  - 4xx (5xx'dan tashqari) → darhol `ApiResult(ok=False, error=..., status=...)`.
- **`submit_survey(payload)`** → `_post_service("/bot2/surveys/submit", payload)`.

Raw service token `.env`'da `SERVICE_TOKEN` sifatida saqlanadi. Backend faqat uning SHA-256 hash'ini biladi va `X-SERVICE-TOKEN` header'ini tekshiradi (qarang [03-autentifikatsiya.md](03-autentifikatsiya.md)).

```
Bot                                  Backend
 │  GET /catalog/items/?type=direction
 │  Authorization: Bearer <jwt>          ──────►  (CookieJWTAuthentication)
 │  ◄── 200 {results:[...]}  /  401 → relogin → retry
 │
 │  POST /bot2/surveys/submit
 │  X-SERVICE-TOKEN: <raw>               ──────►  (verify_service_token, sha256)
 │  ◄── 2xx {ok:true,...}  /  4xx-5xx → retry
```

---

## 7. Katalog keshlash (`catalog_cache.py:CatalogCache`)

Botning har bir foydalanuvchi qadamida backend'ga so'rov yubormasligi uchun katalog xotirada keshlanadi.

- **TTL:** `ttl_seconds=900` (15 daqiqa).
- **Lock:** `asyncio.Lock` — bir vaqtning o'zida bir nechta korutina bir xil tipni qayta yuklamasligi uchun.
- **Bo'sh natija keshlanmaydi:** agar API bo'sh ro'yxat qaytarsa (`if data:` `False`), kesh yangilanmaydi va keyingi chaqiruvda yana urinib ko'riladi. Faqat warning log qilinadi.
- Metodlar: `get_programs()` (`direction`), `get_regions()` (`region`), `get_subjects()` (`subject`), `get_tracks()` (`track`).

```python
async def _get_cached(self, key, item_type):
    async with self._lock:
        cached = self._cache.get(key)
        if cached and time.time() - cached["ts"] < self.ttl_seconds:
            return cached["data"]
        data = await self.api.get_catalog_items(item_type)
        if data:
            self._cache[key] = {"ts": time.time(), "data": data}
        return data
```

> `get_subjects()` va `get_tracks()` so'rovnomada ishlatilmaydi (o'lik metodlar). So'rovnoma faqat `programs` va `regions` dan foydalanadi.

---

## 8. Ko'p tillik (i18n) — `texts.py`

Uchta til qo'llab-quvvatlanadi: `uz` (default), `ru`, `en`. Barcha matnlar `PROMPTS` lug'atida.

- **`get_text(key, lang="uz")`** — `lang` topilmasa `uz` ga, kalit topilmasa o'sha kalitning uzbekcha versiyasiga, u ham bo'lmasa xom kalitning o'ziga qaytadi:

```python
def get_text(key, lang="uz"):
    return PROMPTS.get(lang, PROMPTS["uz"]).get(key, PROMPTS["uz"].get(key, key))
```

- **`CHANNELS`** — obuna uchun kanal havolalari ro'yxati (`channels_keyboard` ishlatadi). Hozir faqat "TTPU Career Center" faol.
- **`REGIONS` va `get_regions(lang)`** — 14 ta viloyatning 3 tilda qattiq kodlangan zaxira ro'yxati. **Lekin bu kod hech qaerda chaqirilmaydi** — handlerlar regionlarni faqat `catalog.get_regions()` (backend) dan oladi. Demak, agar backend katalogida region bo'lmasa, bot uchun zaxira yo'q (foydalanuvchi bo'sh klaviatura ko'radi).

Tilga qarab katalog item nomi `_localized_name` (keyboards.py) orqali tanlanadi: `name_<lang>` → `metadata.name_<lang>` → `name` → `"-"`.

---

## 9. Klaviaturalar (`keyboards.py`)

| Funksiya | Turi | Tavsif |
|----------|------|--------|
| `language_keyboard()` | Reply | 3 til tugmasi (bayroq + nom) |
| `contact_keyboard(lang)` | Reply | `request_contact=True` tugma |
| `gender_keyboard(lang)` | Inline | `gender:male` / `gender:female` |
| `regions_keyboard(regions, lang)` | Inline | har bir region uchun `region:<id>` (2 ustun) |
| `programs_keyboard(programs, lang)` | Inline | har bir dastur `program:<id>` (1 ustun) |
| `course_year_keyboard(lang)` | Inline | `course:1..4` + "Bitirganman" `course:5` (2 ustun) |
| `yes_no_keyboard(prefix, lang)` | Inline | `<prefix>:yes` / `<prefix>:no` (`employment`, `help`, `share`) |
| `channels_keyboard()` | Inline | URL tugmalar (`CHANNELS` dan) |

---

## 10. Konfiguratsiya (`config.py` + `.env`)

`config.py` `python-dotenv` orqali `.env` ni o'qiydi va `Settings` dataclass'ini to'ldiradi:

| `.env` kaliti | Settings maydoni | Default | Majburiymi |
|---------------|------------------|---------|------------|
| `BOT_TOKEN` | `bot_token` | `""` | **Ha** — bo'sh bo'lsa `RuntimeError` |
| `SERVER_BASE_URL` | `server_base_url` | `http://localhost:8000/api/v1` | URL validatsiyadan o'tadi |
| `SERVICE_TOKEN` | `service_token` | `""` | **Ha** — bo'sh bo'lsa `RuntimeError` |
| `DASHBOARD_EMAIL` | `dashboard_email` | `None` | Yo'q (katalog o'qish uchun kerak) |
| `DASHBOARD_PASSWORD` | `dashboard_password` | `None` | Yo'q (katalog o'qish uchun kerak) |
| `DEFAULT_LANGUAGE` | `default_language` | `uz` | Yo'q |

> Diqqat: konfiguratsiya kaliti `SERVER_BASE_URL` (`CRM_BASE_URL` emas) va u **`/api/v1` qo'shimchasini o'z ichiga oladi**. `_validate_url` schema va netloc borligini tekshirib, oxiridagi `/` ni olib tashlaydi.

Import paytida tekshiruvlar (`config.py` oxirida):

```python
if not settings.bot_token:
    raise RuntimeError("BOT_TOKEN is required in .env")
if not settings.service_token:
    raise RuntimeError("SERVICE_TOKEN is required (raw bot2 token).")
```

`.env` namunasi (`bot2_service/.env.example`):

```env
BOT_TOKEN=123456:telegram-bot-token
DEFAULT_LANGUAGE=uz
SERVER_BASE_URL=http://localhost:8000/api/v1
SERVICE_TOKEN=raw-bot2-service-token
DASHBOARD_EMAIL=
DASHBOARD_PASSWORD=
```

Agar `DASHBOARD_EMAIL`/`DASHBOARD_PASSWORD` bo'sh bo'lsa, `login_dashboard()` ishlamaydi → katalog bo'sh qaytadi → region/dastur klaviaturalari bo'sh bo'ladi (chunki zaxira `REGIONS` ishlatilmaydi). Demak katalog o'qish uchun bu ikki kalit amalda majburiy.

### 10.1 Bog'liqliklar (`pyproject.toml`)

- `python ^3.11`
- `aiogram ^3.12.0`
- `httpx ^0.27.0`
- `python-dotenv ^1.2.1`
- `ujson ^5.10.0`

---

## 11. Muhim eslatmalar va xavf-xatarlar

- **Bo'sh `student_id` → jim data-loss.** `_final_submit` `student_id` bo'sh bo'lsa, foydalanuvchiga "thanks" ko'rsatadi, lekin so'rovni yubormaydi. Foydalanuvchi muvaffaqiyat deb o'ylaydi; faqat log'da `logger.error` qoladi.
- **MemoryStorage restartda yo'qoladi.** FSM holatlari xotirada — bot qayta ishga tushsa, yarim to'ldirilgan barcha so'rovnomalar yo'qoladi. `/cancel` yoki timeout handler yo'q.
- **`fcntl` faqat POSIX.** Windows/non-POSIX'da single-instance lock ishlamaydi — bot lock'siz ishlaydi, dublikat poller xavfi reaktiv (`TelegramConflictError`) ravishda hal qilinadi.
- **Single-instance lock faqat bir host doirasida.** Bir nechta server/konteynerda bir xil token bilan ishga tushsa, lock buni ushlamaydi — Telegram konflikt qaytaradi va polling loop o'zi to'xtaydi.
- **Katalog uchun zaxira yo'q.** `texts.py:REGIONS` zaxira ro'yxati ishlatilmaydi; backend katalogida `region`/`direction` bo'lmasa, mos klaviatura bo'sh chiqadi.
- **JWT faqat reaktiv yangilanadi.** Katalog JWT'i 401 kelganda qayta olinadi; proaktiv (oldindan) yangilash yo'q.
- **README qisman eskirgan** — `survey_campaign`, confirm qadami va `answers.channel` haqidagi qismlar kodga mos kelmaydi. `course_year` ham README'da 1–4 deyilgan, lekin bot `course:5` (bitirgan) ni ham yuboradi.

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — JWT va service token (botning login va `X-SERVICE-TOKEN` aloqasi)
- [04-katalog.md](04-katalog.md) — Katalog (`direction`, `region` tiplari)
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovni qabul qiluvchi backend domeni (roster, student, survey)
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma (`/auth/login`, `/catalog/items`, `/bot2/surveys/submit`)
- [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md) — Deploy, process manager, bot'ni autorestart bilan ishga tushirish
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari (so'rovnoma to'ldirishdan analitikagacha)
