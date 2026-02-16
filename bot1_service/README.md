# Bot1 Telegram Service (Admissions Helper)

Telegram bot for abituriyentlar: til tanlash, kontakt va profil ma'lumotlarini yig'ish, so'ng arizalarni yuborish (Campus Tour, Admissions 2026, Foundation, Polito Academy). Backend sifatida `server/` ichidagi CRM API lariga `X-SERVICE-TOKEN` bilan murojaat qiladi. Bot kodi `server/` dan tashqarida joylashgan.

## Asosiy imkoniyatlar
- `/start` → til tanlash (UZ/RU/EN) → kontakt (share contact) → ism/familiya → bo'limlar menyusi.
- Bo'limlar: Campus Tour, Admissions 2026, Foundation Year, Polito Academy, Profile, My applications, Settings.
- Har bir bo'limga kirganda qisqa ma'lumot yuboradi.
- Campus Tour: tashkilot/maktab nomi, lavozim, qo'shimcha telefon, sana (inline calendar), vaqt sloti (serverdan yoki lokal preset), tasdiq → serverga yuborish.
- Foundation/Polito/Admissions: qo'shimcha telefon, (agar oldin to'ldirilmagan bo'lsa) tug'ilgan sana, jinsi, hudud (12 ta viloyat + Qoraqalpog'iston + Chet el), tanlovlar (fan/track/direction) serverdan olinadi yoki lokal keshdan, tasdiq → serverga yuborish.
- Polito Academy: fanlar ro'yxati serverdan (catalog `subject`) yoki lokal fallback.
- Admissions 2026: track (uzbek/italian/american), yo'nalishlar (catalog `direction`), tasdiq → yuborish.
- My applications: lokal keshdagi oxirgi yuborilgan arizalar statuslari (serverga GET autentikatsiyasi kerakligi uchun lokalga yozib boriladi).
- Settings: tilni o'zgartirish, kontakt/ism/familiyani yangilash.

## O'rnatish
1. Python 3.11+ o'rnating.
2. Poetry: `pip install poetry`
3. Bog'liqliklar: `cd bot1_service && poetry install`
4. `.env` faylini tayyorlang (`.env.example` nusxasidan).

## Ishga tushirish
```bash
cd bot1_service
poetry run python src/bot1_service/main.py
```

## Konfiguratsiya (`.env`)
- `BOT_TOKEN` – Telegram bot tokeni.
- `SERVER_BASE_URL` – CRM API bazasi (masalan `http://localhost:8000/api/v1`).
- `SERVICE_TOKEN` – CRM `X-SERVICE-TOKEN` (bot1 uchun sha256 hashlanmagan **xom** token yuborasiz). Backend `.env` dagi `SERVICE_TOKEN_BOT1_HASH` ga shu tokenning sha256 hashi yozilgan bo'lishi kerak.
- `DASHBOARD_EMAIL` / `DASHBOARD_PASSWORD` – ixtiyoriy; agar berilsa bot katalog (direction/track/subject/region) ma'lumotlarini CRM dan cookies orqali oladi. Berilmasa lokal katalog fallback ishlatiladi.
- `DEFAULT_LANGUAGE` – `uz`, `ru` yoki `en` (sukut bo'yicha `uz`).
- `CATALOG_CACHE_TTL` – kesh muddati (sekund).

## Katalog ma'lumotlari
- Agar `DASHBOARD_EMAIL/PASSWORD` berilsa, bot `/auth/login` orqali cookie oladi va `/catalog/items` GET qilib direction/track/subject/region ma'lumotlarini oladi.
- Hududlar serverdan olinmasa, lokal ro'yxat: 12 viloyat + Qoraqalpog'iston + Chet el.
- Track va open-slotlar lokal presetlardan ham chiqadi, kerak bo'lsa `catalog_cache.py` da o'zgartiring.

## Kod tuzilmasi (`src/bot1_service`)
- `config.py` – `.env` dan sozlamalar, constants.
- `api.py` – CRM bilan integratsiya (auth login + bot service endpointlari).
- `catalog_cache.py` – katalogni serverdan olish va lokal fallback.
- `store.py` – oddiy JSON fayl kesh (profil va ariza statuslarini saqlash).
- `keyboards.py` – inline va reply klaviaturalar (til, menyu, kalendar, tanlovlar).
- `states.py` – FSM state gruplari.
- `texts.py` – bo'limlar bo'yicha ma'lumotlar/so'rovlar matnlari.
- `handlers.py` – barcha handlerlar va oqimlar (start, profil, arizalar).
- `main.py` – botni ishga tushirish, routerlarni ulash.
- `calendar.py` – inline kalendar generatori.

## Test
Hoziroq unit test yo'q. `poetry run pytest` bilan kelajakdagi testlar uchun tayyor.

## Cheklovlar
- My applications serverdan o'qilmaydi (CRM GET uchun user-auth kerak); bot yuborgan arizalarni lokal keshda saqlaydi.
- Cookie bilan katalog olish ishlashi uchun `DASHBOARD_EMAIL/PASSWORD` admin/viewer foydalanuvchisi kerak.
- Sana tanlash inline calendar bilan, vaqt slotlari lokal preset; istasangiz `catalog_cache.py` ga serverdan keladigan slot endpointini qo'shing.


## Production
- `SERVER_BASE_URL` ni production API manziliga sozlang (`https://api.example.com/api/v1`).
- `SERVICE_TOKEN`, `DASHBOARD_EMAIL`, `DASHBOARD_PASSWORD` ni secret manager yoki environment orqali bering.
- Bot processini systemd/supervisor orqali ishlating va avtomatik qayta ishga tushirishni yoqing.
- Katalog olishda auth xatolari bo'lsa, bot relogin + retry qiladi; loggingni monitoring tizimiga ulang.
