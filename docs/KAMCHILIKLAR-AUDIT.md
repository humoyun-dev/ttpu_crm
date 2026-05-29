# TTPU CRM — Kamchiliklar audit hisoboti (tuzatish holati bilan)

> **Eslatma:** Bu fayl 2026-05-29 dagi ko'p-agentli auditning natijasi. Ostidagi to'liq hisobot
> o'sha paytdagi holatni aks ettiradi. Real sirlar (bot token, parol) **redaksiya qilingan**.
> Quyidagi "Tuzatish holati" jadvali shu sessiyada nima tuzatilganini ko'rsatadi.

## Tuzatish holati (2026-05-29 sessiyasi)

| # | Kamchilik | Holat |
|---|-----------|-------|
| C-1 | Git'dagi real sirlar | ✅ `.env` git index'dan olindi, `.env.example` tozalandi. ⚠️ **Token/parol rotatsiyasi va git tarixini tozalash — foydalanuvchi zimmasida** (pastga qarang) |
| C-2 | bot2 Dockerfile modul yo'li | ✅ `ENV PYTHONPATH=/app/src` qo'shildi |
| H-1 | Gunicorn 127.0.0.1 bind | ✅ `server/Dockerfile` da `ENV GUNICORN_BIND=0.0.0.0:8000` |
| H-2 | Polling loop error handler yo'q | ✅ `feed_update` try/except + offset doim oldinga suriladi |
| H-3 | Bo'sh student_id jim tashlanadi | ✅ qayta so'rash; soxta "rahmat" olib tashlandi |
| H-5 | Coverage 100%+ | ✅ `_coverage_percent` clamp (serializer + analytics) |
| H-6 | program_coverage dasturlarni tashlaydi | ✅ union iteratsiya + year-5 roster fallback |
| H-7 | Survey unique constraint yo'q | ✅ `UniqueConstraint(student, survey_campaign)` + migration `0008` (dedup bilan) |
| H-8 / M-7 | submit_survey 500 + str(exc) leak | ✅ ichki savepoint + `IntegrityError`→409 + generic xabar |
| H-14 / M-6 | StudentRoster clean bypass / DIRECTION | ✅ `save()`+`full_clean()`; `clean()` PROGRAM\|DIRECTION ga ruxsat |
| M-9 | course_year import 1..4 vs 1..5 | ✅ import endi 1..5 (bitiruvchilar) |
| M-12 | Dashboard Docker NEXT_PUBLIC_API_URL | ✅ Dockerfile ARG + compose build arg |
| M-13 | Ikkita zid compose / volume yo'q | ✅ `server/docker-compose.yml` o'chirildi (root to'liq stack qoldi) |
| M-14 | DEPLOYMENT docs bot1 unitlari | ✅ DEPLOYMENT.md + PM2 docs + docs/11 tozalandi |
| L-17 / L-18 | bot1 dead config / req.txt | ✅ `.env.example` va `req.txt` dan bot1 olib tashlandi |
| — | **(Auditdan tashqari, verifikatsiyada topildi)** `common/0002_drop_bot1_tables` SQLite'da `DROP ... CASCADE` bilan `migrate` ni buzar edi | ✅ vendor-aware qilindi (SQLite + Postgres) |
| H-11, H-12, H-13, H-10, M-10, L-24, L-25, L-26, L-27 | Dashboard fixlari | 🔄 shu sessiyada bajarilmoqda |
| M-2, M-5, M-8, M-15, M-16–M-20, L-1–L-16, L-19–L-23, L-28, L-29 | Qolgan o'rta/past masalalar | ⏳ tavsiya etilgan keyingi qadamlar (hali tuzatilmagan) |

**Backend testlari:** barcha **31 pytest test o'tdi** (data-integrity o'zgarishlaridan keyin).

### C-1 bo'yicha foydalanuvchi bajarishi shart bo'lgan amallar
1. Telegram tokenini **BotFather** orqali revoke qiling (`/revoke`) va yangisini oling.
2. Service token va dashboard parolini almashtiring.
3. `.env` allaqachon git index'dan olindi — buni **commit** qiling.
4. Git **tarixini tozalang** (`git filter-repo --path server/.env --path bot2_service/.env --invert-paths` yoki BFG), so'ng force-push. Yoki reponi **private** qiling.

---

Quyida TTPU CRM loyihasi uchun to'liq kamchiliklar audit hisoboti keltirilgan.

---

# TTPU CRM — Kamchiliklar Audit Hisoboti

**Sana:** 2026-05-29
**Komponentlar:** `server` (Django/DRF), `bot2_service` (aiogram bot), `dashboard` (Next.js)

---

## 1. Qisqa xulosa

Jami **63 ta tasdiqlangan kamchilik** (turli finderlar topgan takrorlovchilarni birlashtirgandan keyin **~50 ta noyob masala**) va **3 ta noaniq topilma** aniqlandi.

**Jiddiylik bo'yicha taqsimot (boshlang'ich severity asosida):**

| Jiddiylik | Soni (taxminan, birlashtirgandan keyin) |
|-----------|------|
| 🔴 Critical | 3 |
| 🟠 High | 16 |
| 🟡 Medium | 18 |
| ⚪ Low | 23 |

> Eslatma: ko'p topilmalar uchun verifikatsiya jarayonida `adjusted_severity` (moslashtirilgan jiddiylik) pasaytirilgan. Quyida har bir masalada asl va moslashtirilgan jiddiylik ko'rsatilgan.

### Eng muhim 5 ta masala (darhol harakat talab qiladi)

1. **🔴 Git'ga commit qilingan real sirlar** — jonli Telegram bot tokeni, ishlaydigan service token (raw + hash), dashboard parol. Repo PUBLIC. *(C-1)*
2. **🔴 bot2 Dockerfile modul yo'li noto'g'ri** — `ModuleNotFoundError`, bot Docker'da umuman ishlamaydi, restart loop. *(C-2)*
3. **🟠 Gunicorn `127.0.0.1` ga bind qiladi** — Docker deploy butunlay buziladi (Connection refused). *(H-1)*
4. **🟠 Polling loop'da error handler yo'q** — bitta handler xatosi butun botni o'chiradi (recovery yo'q). *(H-2)*
5. **🟠 Bo'sh student_id jimgina tashlanadi + soxta "rahmat"** — to'liq so'rovnoma yo'qoladi, foydalanuvchi muvaffaqiyat deb o'ylaydi. *(H-3)*

---

## 2. Birlashtirilgan (takroriy) topilmalar

Bir nechta finder bir xil masalalarni topgan. Birlashtirildi:

- **Sirlar git'da** — uchta alohida topilma (`C-1`) bitta masalaga birlashtirildi: tasdiqlangan ikki versiya + noaniq `.env.example` versiyasi (oxirida muhokama qilinadi).
- **submit_survey idempotentlik / unique constraint yo'q** — to'rt alohida topilma (data-integrity, concurrency-tx, tests-quality dimensiyalaridan) bitta masalaga (`H-7`) birlashtirildi.
- **submit_survey transaction poisoning / 500 / str(exc) leak** — uch topilma (`H-8`, `M-7`, noaniq) bir-biriga bog'liq; `H-8` ostida birlashtirildi.
- **_auto_generate_code lexicographic Max (999 dan oshsa)** — ikki bir xil topilma `L-1` ostida.
- **course_year 1..4 vs 1..5 nomuvofiqligi** — ikki topilma `M-9` ostida.
- **verify_service_token bare except / fallback** — ikki topilma `L-3` ostida.
- **StudentRoster.clean() / DIRECTION bypass** — ikki bog'liq topilma `M-8` ostida.
- **Bo'sh student_id data loss** — ikki bir xil topilma `H-3` ostida.

---

## 3. Kamchiliklar (jiddiylik bo'yicha)

### 🔴 CRITICAL

#### C-1. Git'ga commit qilingan real sirlar (bot token, service token, dashboard parol) — [deploy/security]
**Joy:** `bot2_service/.env:1,4,6,7`, `server/.env:18-19`
**Nima noto'g'ri:** `server/.env` va `bot2_service/.env` ikkalasi ham git'da kuzatilmoqda (`.gitignore`'da `.env` bo'lsa-da, oldin commit qilingan). Ichida:
- `BOT_TOKEN=<BOT-TOKEN-REDAKSIYA>` — **jonli** Telegram tokeni (Telegram `getMe` `ok:true` qaytaradi, bot `@TTPU_Alumni_bot`).
- `SERVICE_TOKEN=raw-bot2-service-token` (raw) + `server/.env:19` da uning SHA-256 hashi (`sha256('raw-bot2-service-token')` aniq mos keladi) — **ishlaydigan service credential**.
- `DASHBOARD_EMAIL=<EMAIL-REDAKSIYA>` / `DASHBOARD_PASSWORD=<PAROL-REDAKSIYA>`.
- **Repo PUBLIC** (`gh repo view`: `isPrivate=false`) — butun internetga ochiq.

**Ta'siri:** Har kim botni boshqarishi, soxta survey submission yuborishi (forge X-SERVICE-TOKEN), dashboard'ga kirishi mumkin.
**Tuzatish:** Darhol Telegram tokenini BotFather orqali revoke qiling; service token va dashboard parolni almashtiring. `git rm --cached server/.env bot2_service/.env`, commit, so'ng tarixni `git filter-repo`/BFG bilan tozalang. Faqat `.env.example` qoldiring.

---

#### C-2. bot2 Dockerfile modul yo'li noto'g'ri — `python -m bot2_service.main` topilmaydi — [deploy/bot]
**Joy:** `bot2_service/Dockerfile:28-30`
**Nima noto'g'ri:** Paket src-layout'da (`/app/src/bot2_service`), Dockerfile `COPY src /app/src` va `WORKDIR /app` qiladi, lekin `CMD ["python","-m","bot2_service.main"]`. `/app/src` `PYTHONPATH`'ga qo'shilmagan va paket install qilinmagan (`poetry export` faqat dependency'larni beradi). Empirik tasdiqlangan: `ModuleNotFoundError: No module named 'bot2_service'`. Top-level shim paket Docker image'ga ko'chirilmaydi.
**Ta'siri:** Bot konteyner darhol crash bo'ladi va `restart: unless-stopped` bilan restart loop'ga tushadi — Docker'da survey boti umuman ishlamaydi.
**Tuzatish:** `ENV PYTHONPATH=/app/src` qo'shing, yoki `WORKDIR /app/src`, yoki builder'da paketni install qiling (`pip install .`).

---

#### C-3. .env.example raw bot2 token + valid hash — [deploy/security] *(noaniq — pastdagi bo'limga qarang)*
Bu topilma noaniq (cited fayl/qator noto'g'ri). "Tekshirilishi kerak" bo'limida muhokama qilingan; asl xavf C-1 bilan qoplangan.

---

### 🟠 HIGH

#### H-1. Gunicorn default `127.0.0.1:8000` ga bind qiladi — Docker port mapping ishlamaydi — [deploy/backend]
**Joy:** `server/gunicorn.conf.py:5`
**Nima noto'g'ri:** `bind = os.getenv("GUNICORN_BIND", "127.0.0.1:8000")`. Konteyner ichida loopback'ga bind qilingan jarayon `ports: 8000:8000` orqali tashqaridan yetib bo'lmaydi. `GUNICORN_BIND` hech bir `.env`/compose'da o'rnatilmagan. Dashboard va bot2 konteynerlari ham `http://server:8000` ga ulana olmaydi.
**Ta'siri:** Hujjatlangan Docker deploy buziladi — host, dashboard, bot2 hammasi "Connection refused". *(adjusted: high)*
**Tuzatish:** Default'ni `0.0.0.0:8000` qiling yoki compose'da `GUNICORN_BIND=0.0.0.0:8000` env bering.

---

#### H-2. Polling loop'da global error handler yo'q — bitta handler xatosi botni o'chiradi — [bot]
**Joy:** `bot2_service/src/bot2_service/handlers.py:567-569`
**Nima noto'g'ri:** Qo'lda yozilgan polling loop'da faqat `bot(get_updates)` try/except ichida; `dp.feed_update(bot, update)` (568-qator) tashqarida. Hech qaerda `@dp.errors`/`router.errors` ro'yxatdan o'tkazilmagan. aiogram v3 handler ichidagi har qanday uncaught exception'ni (masalan `call.message` None bo'lsa `call.message.chat.id` AttributeError, yoki `from_user` None, yoki `TelegramForbiddenError`/`TelegramBadRequest`) qayta ko'taradi → butun jarayon to'xtaydi.
**Ta'siri:** Bitta nuqsonli update yoki handler xatosi survey botni butunlay o'chiradi, avtomatik recovery yo'q. *(adjusted: high; `delete_webhook(drop_pending_updates=True)` redelivery'ni qisman yumshatadi)*
**Tuzatish:** `@dp.errors` global handler ro'yxatdan o'tkazing yoki `feed_update`'ni o'z try/except'ida o'rang (offset'ni baribir oldinga suring).

---

#### H-3. Bo'sh student_id jimgina tashlanadi — so'rovnoma yo'qoladi + soxta "rahmat" — [bot/data-integrity]
**Joy:** `bot2_service/src/bot2_service/handlers.py:394-399`
**Nima noto'g'ri:** Foydalanuvchi `waiting_student_id` bosqichida matn o'rniga rasm/stiker/audio yuborsa (`set_student_id`, 237-qator: `message.text` None → `student_id=""`), `_final_submit` student_id bo'shligini ko'rib serverga **umuman yubormaydi**, lekin foydalanuvchiga "Rahmat! Ma'lumotlaringiz qabul qilindi ✅" ko'rsatadi va state'ni tozalaydi. Re-prompt yo'q. (`submission_failed` matni mavjud, lekin bu yerda ishlatilmaydi.)
**Ta'siri:** To'liq so'rovnoma jimgina yo'qoladi; foydalanuvchi muvaffaqiyat deb o'ylab qayta urinmaydi. *(adjusted: medium — tor trigger, lekin soxta "rahmat" jiddiyligini saqlaydi)*
**Tuzatish:** Bo'sh student_id'da `thanks` o'rniga `submission_failed`/qayta kiritish so'rang; state'ni tozalamang.

---

#### H-4. 401 relogin retry stale javobga o'tib bo'sh katalog qaytaradi — [bot/error-handling]
**Joy:** `bot2_service/src/bot2_service/api.py:94-113`
**Nima noto'g'ri:** `_get_catalog`'da 401 + attempt==1 bo'lsa relogin qiladi va muvaffaqiyatda `continue`. Lekin relogin **muvaffaqiyatsiz** bo'lsa `continue`/`return` yo'q — kod stale 401 javobga o'tib, generic warning logga yozadi va `[]` qaytaradi. attempt==2 da yana 401 bo'lsa ham `[]`.
**Ta'siri:** Auth buzilganda katalog (program/region) jimgina bo'sh ro'yxat qaytaradi → bot bo'sh klaviatura ko'rsatadi, xato ko'rsatilmaydi. *(adjusted: medium — kosmetik fall-through, lekin distinguishable error signal yo'qligi haqiqiy)*
**Tuzatish:** Relogin muvaffaqiyatsiz bo'lsa aniq xato bilan `[]` qaytaring; persistent 401'ni caller distinguish qilsin.

---

#### H-5. ProgramEnrollment.student_count qo'lda — qamrov 100% dan oshishi mumkin — [backend/data-integrity]
**Joy:** `server/bot2/models.py:156`, `serializers.py:62-67`, `views.py:115-125`
**Nima noto'g'ri:** `student_count` (qamrov maxraji) faqat qo'lda CRUD orqali kiritiladi, hech qachon roster'dan rekonsil qilinmaydi. `responded_count` esa real survey qatorlarini sanaydi, vaqt chegarasi yo'q. `coverage_percent = responded*100/total` clamp'siz. Agar `student_count` respondentlardan kam bo'lsa, qamrov >100% chiqadi.
**Ta'siri:** Dashboard imkonsiz >100% ko'rsatadi; maxraj va numerator orasida yaxlitlik bog'lanishi yo'q. *(adjusted: medium — asosiy analytics endpointlar `_latest_responses_qs` orqali himoyalangan, eng o'tkir muammo CRUD serializer field'da)*
**Tuzatish:** `coverage_percent`'ni 100 da clamp qiling va/yoki `student_count`'ni roster soniga nisbatan validatsiya qiling.

---

#### H-6. bot2_program_coverage javoblari bor lekin enrollment'siz dasturlarni tashlab yuboradi — [backend/bug]
**Joy:** `server/analytics/views.py:113-157` (loop 143-qator)
**Nima noto'g'ri:** Funksiya `total_map`'dan iteratsiya qiladi va faqat shu kalitlarni emit qiladi. `resp_map`'da bor, lekin `total_map`'da yo'q dastur (xususan course_year=5 bitiruvchilar — `ProgramEnrollment` faqat 1-4 ni kuzatadi) hech qachon chiqarilmaydi. `bot2_program_course_matrix` va `enrollments_overview` da bor year-5 roster fallback bu yerda yo'q.
**Ta'siri:** Survey topshirgan butun dastur/bitiruvchi kohortalari hisobotdan tushib qoladi; qamrov undercount. course_year=5 bilan so'ralganda esa bo'sh javob qaytaradi. *(adjusted: medium — ichki analytics undercount, security/crash emas)*
**Tuzatish:** `total_map` va `resp_map` kalitlari birlashmasidan iteratsiya qiling; sibling endpointlardagi year-5 roster fallback'ni qo'shing.

---

#### H-7. submit_survey idempotentlik DB darajasida ta'minlanmagan — dublikat survey qatorlari — [backend/concurrency/data-integrity]
**Joy:** `server/bot2/views.py:333-337`, `models.py:114-126`, migration `0005_remove_unique_roster_campaign.py`
**Nima noto'g'ri:** `update_or_create(student=, survey_campaign=, ...)` idempotentlikka tayanadi, lekin `(student, survey_campaign)` (yoki `(roster, survey_campaign)`) bo'yicha **unique constraint yo'q** (0005 da eski constraint olib tashlangan, plain index qo'yilgan). `update_or_create` qulfsiz SELECT-then-INSERT → ikki bir vaqtdagi so'rov (yoki bot retry: `api.py:131-147` timeout'da, `handlers.py:443` xatoda) ikkala INSERT qiladi → dublikat. `@transaction.atomic` racega yordam bermaydi.
**Ta'siri:** Bir student+kampaniya uchun dublikat qatorlar. Asosiy analytics `Count(distinct)`/`_latest_responses_qs` bilan himoyalangan, lekin raw list/export dublikat ko'rsatadi va kelajakdagi dedup'siz agregatsiya overcount qiladi. *(adjusted: medium — SQLite default'da writes serialize, asosan Postgres muammosi)*
**Tuzatish:** `UniqueConstraint(fields=['student','survey_campaign'])` + migration qo'shing, yoki upsert oldidan `select_for_update`. Konkurrent regression test qo'shing.

---

#### H-8. submit_survey: IntegrityError @transaction.atomic ichida → 500 + str(exc) leak — [backend/bug]
**Joy:** `server/bot2/views.py:231,302/306/333,340`
**Nima noto'g'ri:** View `@transaction.atomic`, ichida to'g'ridan-to'g'ri yozuvlar nested savepoint'siz. DB-darajadagi IntegrityError (masalan `student_external_id` yoki `telegram_user_id` unique to'qnashuvi, TOCTOU race) `except Exception` (340-qator) tomonidan ushlanib normal `Response` qaytarsa, transaction "needs rollback" holatida qoladi → exit'da COMMIT urinishi `TransactionManagementError` ko'taradi → opaque 500. Qo'shimcha: `str(exc)` raw internal xato matnini caller'ga qaytaradi (information disclosure), `roster.objects.create()` (264-qator) try bloki tashqarisida bo'lgani uchun u yerdagi IntegrityError uncaught propagatsiya bo'ladi.
**Ta'siri:** Unique-conflict toza 400/409 emas, opaque 500; bot retry loop'ga tushadi. *(adjusted: medium — model `save()` `full_clean()` ko'pini ValidationError sifatida toza 400 qiladi; haqiqiy trigger TOCTOU race)*
**Tuzatish:** Yozuv blokini ichki `with transaction.atomic():` savepoint'ga o'rang; `IntegrityError`'ni alohida ushlab 409/400 qaytaring; raw `str(exc)` o'rniga generic xabar.

---

#### H-9. RevokedToken jadvali avtomatik tozalanmaydi (cron yo'q) — [backend/perf]
**Joy:** `server/authn/authentication.py:55`, `models.py:61-101`, `docker-compose.yml:19-37`
**Nima noto'g'ri:** Har autentifikatsiyalangan so'rovda `RevokedToken.is_revoked()` = `filter(jti=jti).exists()`. `cleanup_tokens` komandasi bor va hujjatlar cron tavsiya qiladi, lekin compose/entrypoint'da hech qanday scheduler yo'q — hech qachon avtomatik bajarilmaydi.
**Ta'siri:** Jadval o'sadi (faqat logout'da yangi qator; refresh `ROTATE_REFRESH_TOKENS=False` bo'lgani uchun qator qo'shmaydi). *(adjusted: low — `jti` unique indeks O(log n), kichik CRM'da yillarda ham minimal o'sish)*
**Tuzatish:** `cleanup_tokens`'ni cron/scheduler'ga ulang yoki `is_revoked()`'da faqat `expires_at__gte=now` yozuvlarni hisobga oling.

---

#### H-10. Surveys sahifasi faqat 500 yozuv yuklaydi — client-side statistika noto'g'ri — [dashboard/perf]
**Joy:** `dashboard/app/dashboard/surveys/page.tsx:130-146,165-194`
**Nima noto'g'ri:** `page_size:'500'` bilan survey+student yuklab, qidiruv/saralash/sahifalash/statistika hammasini client-side qiladi. Server `max_page_size=500` (hard cap), shuning uchun 500 dan oshsa eski yozuvlar serverda tushib qoladi; "Jami javoblar", employed/unemployed sonlari, eksport jimgina noto'g'ri.
**Ta'siri:** 500 dan oshganda jadval va statistika to'liqsiz/noto'g'ri. *(adjusted: medium — threshold-gated latent muammo)*
**Tuzatish:** Server-side pagination/filtr/search'ga o'ting (`bot2/views.py:89-106` allaqachon qo'llab-quvvatlaydi); statistikani server count/agregatsiyadan oling.

---

#### H-11. proxy.ts hech qachon ishlamaydi — server-side route guard yo'q — [dashboard/security]
**Joy:** `dashboard/proxy.ts:7`
**Nima noto'g'ri:** Next.js middleware fayl `middleware.ts` deb nomlanishi kerak; bu yerda `proxy.ts` va `export function proxy(...)`. Hech kim import qilmaydi → o'lik kod. Bundan tashqari u `access_token`/`refresh_token` cookie'larni o'qiydi, lekin ular httpOnly va API domenida (dashboard domenida emas).
**Ta'siri:** /dashboard/* yo'llari faqat client-side himoyalangan (flash holati). Lekin barcha data Bearer token bilan olinadi → token'siz 401 → faqat bo'sh shelllar ko'rinadi, sezgir SSR data leak yo'q. *(adjusted: medium — defense-in-depth/UX-flash, data exposure emas)*
**Tuzatish:** Faylni `middleware.ts` ga ko'chiring, `middleware` deb eksport qiling, tekshiriladigan cookie'ni `dashboard_auth` markeriga o'zgartiring; yoki o'lik faylni o'chiring.

---

#### H-12. students/[id] saqlashda xato tekshirilmaydi — soxta muvaffaqiyat — [dashboard/error-handling]
**Joy:** `dashboard/app/dashboard/students/[id]/page.tsx:92-98`
**Nima noto'g'ri:** `apiFetch` 4xx/5xx'ni throw qilmaydi, `{error}` qaytaradi. `handleSubmit` `createRoster/updateRoster` natijasini tekshirmasdan to'g'ridan-to'g'ri `router.push` qiladi. Validatsiya xatosi, dublikat `student_external_id` (unique=True), yoki 403 (viewer roli) bo'lsa ham muvaffaqiyat ko'rsatiladi. (`enrollments/[id]` to'g'ri tekshiradi — nomuvofiqlik.)
**Ta'siri:** Foydalanuvchi saqlandim deb o'ylaydi, aslida saqlanmagan; xato xabari yo'q. *(adjusted: medium)*
**Tuzatish:** `if (res.error) { toast.error(...); setSaving(false); return; }` qo'shing, faqat xatosiz holatda `router.push`.

---

#### H-13. Talabalar ro'yxati faqat 100 ta ko'rsatadi, pagination yo'q — [dashboard/data-integrity]
**Joy:** `dashboard/app/dashboard/students/page.tsx:51`
**Nima noto'g'ri:** `page_size:"100"` bilan so'raydi, sarlavhada haqiqiy `count` (masalan 350) ko'rsatadi, lekin jadvalda faqat 100 qator va pagination tugmasi yo'q. 100 dan keyingi talabalarni ko'rish/tahrirlash/o'chirish mumkin emas (faqat ID bo'yicha to'g'ridan-to'g'ri route).
**Ta'siri:** 100 dan ortiq talaba UI orqali boshqarib bo'lmaydi. *(adjusted: medium — ma'lumot DB'da bor, faqat UI cheklovi)*
**Tuzatish:** Server-side pagination (page/page_size state + Oldingi/Keyingi).

---

#### H-14. StudentRoster.clean() (program-type tekshiruvi) API CRUD yo'lida bypass qilinadi — [backend/validation]
**Joy:** `server/bot2/models.py:37-39`, `serializers.py:13-18`, `views.py:264`
**Nima noto'g'ri:** `StudentRoster.clean()` `program.type==PROGRAM` ni talab qiladi, lekin StudentRoster'da `save()` override yo'q (Bot2Student/Bot2SurveyResponse'da bor). DRF serializer `fields='__all__'`, `validate()` yo'q, ModelSerializer `clean()` chaqirmaydi. ViewSet POST/PUT va `submit_survey`'dagi `objects.create()` `clean()`'ni bypass qiladi. Faqat import yo'li (`upsert_roster_row` → `full_clean()`) himoyalangan.
**Ta'siri:** Admin roster'ni region/subject/track CatalogItem'ga biriktirishi mumkin → dastur qamrovi analitikasi buziladi. *(adjusted: low — faqat admin-gated; submit_survey auto-create PROGRAM|DIRECTION bilan cheklangan)*
**Tuzatish:** `StudentRoster`'ga `save()` → `full_clean()` qo'shing, yoki serializer'da `validate_program`.

---

### 🟡 MEDIUM

#### M-1. MemoryStorage — restart'da yarim to'ldirilgan so'rovnomalar yo'qoladi — [bot/data-integrity]
**Joy:** `bot2_service/src/bot2_service/handlers.py:467`
**Nima noto'g'ri:** `Dispatcher(storage=MemoryStorage())`. Deploy/crash'da barcha FSM holatlari yo'qoladi; restart'dan keyin foydalanuvchi xabari hech bir state'ga mos kelmaydi va jimgina tashlanadi (default state handler yo'q) — `/start`gacha tiqilib qoladi.
**Ta'siri:** Har restart yarim so'rovnomalarni yo'qotadi. *(adjusted: low — bir martalik intake bot, `/start` har doim ishlaydi)*
**Tuzatish:** RedisStorage; yoki kamida default_state fallback handler.

---

#### M-2. Region/program cache'da topilmasa tanlov jimgina yo'qoladi — [bot/data-integrity]
**Joy:** `handlers.py:214-225, 251-262`
**Nima noto'g'ri:** `pick_region`/`pick_program` `next(...)` bilan qidiradi; topilmasa `if selected:`/`if program:` o'tkazib yuboriladi (else yo'q) — `region_id`/`program_id` state'ga yozilmaydi, lekin keyingi bosqichga o'tadi. Yangi student uchun `program_id`'siz server `ROSTER_NOT_FOUND` qaytaradi.
**Ta'siri:** Roster'siz studentlar uchun submit rad etiladi. *(adjusted: low — tor race (kesh TTL 900s ichida o'zgarish); foydalanuvchi `submission_failed` ko'radi)*
**Tuzatish:** None bo'lsa loglab keshni yangilab keyboard'ni qayta ko'rsating.

---

#### M-3. Callback-only bosqichlar uchun fallback handler yo'q — xabarlar jimgina tashlanadi — [bot/ux]
**Joy:** `handlers.py:43-385`
**Nima noto'g'ri:** `waiting_gender/region/program/course_year/employment/help/share_consent` faqat callback handler'iga ega. Foydalanuvchi tugma o'rniga matn yozsa hech bir handler mos kelmaydi → jimgina e'tiborsiz. `/cancel` yoki default catch-all yo'q; faqat `/start`.
**Ta'siri:** Foydalanuvchi tiqilib qoladi, chalkashadi. *(adjusted: low)*
**Tuzatish:** Default-state fallback handler + callback bosqichlarda matn kelsa eslatma + `/cancel`.

---

#### M-4. Failed submission barcha state'ni tozalaydi — to'liq qayta kiritish — [bot/error-handling]
**Joy:** `handlers.py:447-454`
**Nima noto'g'ri:** Submit + bitta retry ham muvaffaqiyatsiz bo'lsa `submission_failed` ko'rsatiladi va 454-qatorda shartsiz `state.clear()` — barcha kiritilgan javoblar o'chadi. `submission_failed` matni `/start`'dan qayta boshlashni aytadi.
**Ta'siri:** O'tkinchi server/tarmoq uzilishi to'liq javoblar yo'qolishiga olib keladi → abandonment. *(adjusted: medium)*
**Tuzatish:** Terminal xatoda state'ni tozalamang; resubmit/`/retry` imkoni bering.

---

#### M-5. ProgramEnrollment.responded_count academic_year/vaqt e'tiborsiz — tarixiy yillar uchun noto'g'ri — [backend/bug]
**Joy:** `server/bot2/views.py:115-125`, `serializers.py:62-67`
**Nima noto'g'ri:** `responded_count` faqat `course_year` + `survey_campaign` bo'yicha filtrlanadi. `Bot2SurveyResponse`'da `academic_year` maydoni yo'q, ProgramEnrollment esa har academic_year bo'yicha unique. Demak bir xil (program,course_year,campaign) ikki academic_year qatori bir xil all-time survey count oladi → tarixiy yil qamrovi inflated.
**Ta'siri:** Bir program/course_year uchun >1 academic_year bo'lsa coverage_percent noto'g'ri. *(adjusted: low — bitta academic_year bo'lsa to'g'ri)*
**Tuzatish:** Bu list'dan `coverage_percent`'ni olib tashlang yoki roster kohortasiga bog'lang.

---

#### M-6. submit_survey DIRECTION program bilan roster yaratishi mumkin — invariant buziladi — [backend/data-integrity]
**Joy:** `server/bot2/views.py:255-270`, `models.py:37-39`
**Nima noto'g'ri:** Lookup PROGRAM **yoki** DIRECTION'ni qabul qiladi (255-259), keyin `objects.create(program=program)`. StudentRoster'da `save()`/`full_clean()` yo'q → `clean()` (faqat PROGRAM'ga ruxsat) bypass → DIRECTION-typed roster jimgina saqlanadi. Import yo'li esa `full_clean()` orqali DIRECTION'ni rad etadi — nomuvofiq yozuv yo'llari.
**Ta'siri:** Bot orqali yaratilgan rosterlar import/model invariantini buzadigan DIRECTION program ushlaydi. *(adjusted: medium)*
**Tuzatish:** Yozuv yo'llarini moslang: yo submit_survey'ni PROGRAM'ga cheklang, yo `clean()`'da DIRECTION'ga ruxsat bering; StudentRoster.save()'ga `full_clean()` qo'shing.

---

#### M-7. submit_survey klient data konflikti uchun 500 + raw exception leak — [backend/error-handling]
**Joy:** `server/bot2/views.py:284-341`
**Nima noto'g'ri:** `telegram_user_id` orqali topilgan student'ning `student_external_id`'sini boshqa student egasi bo'lgan qiymatga qayta tayinlash IntegrityError beradi; faqat broad `except Exception` → HTTP 500 `SERVER_ERROR` + `str(exc)`. (H-8 bilan bog'liq.)
**Ta'siri:** Doimiy data konflikti retryable server xatosi (500) sifatida ko'rsatiladi; raw exception leak. *(adjusted: low — caller ishonchli ichki bot)*
**Tuzatish:** `IntegrityError`'ni alohida ushlab 409/400 + barqaror error kod; raw `str(exc)` qaytarmang.

---

#### M-8. sql-structure.sql ORM sxemasidan jiddiy farq qiladi — [deploy/config]
**Joy:** `server/sql-structure.sql:265-360` vs `bot2/models.py` & migratsiyalar
**Nima noto'g'ri:** Referens SQL ORM bilan mos emas: course_year 1-4 (ORM 1-5), `uq_roster_campaign` UNIQUE hali bor (ORM olib tashlagan), `roster_campaign` ustuni va `ProgramEnrollment` jadvali yo'q, ON DELETE RESTRICT vs CASCADE, bot1_* jadvallar hali bor.
**Ta'siri:** Bu fayldan Postgres provision qilgan kishi noto'g'ri sxema oladi. *(adjusted: low — provision faqat `migrate` orqali; docs allaqachon bu farqlarni hujjatlaydi va Django modellariga ishonishni aytadi)*
**Tuzatish:** Migratsiyalarni yagona haqiqat manbai sifatida qoldiring; `sql-structure.sql`'ni o'chiring yoki `sqlmigrate`/`pg_dump` bilan regeneratsiya qiling; bot1_* qismlarni o'chiring.

---

#### M-9. course_year roster import (1..4) vs survey submit (1..5) nomuvofiqligi — [backend/validation]
**Joy:** `server/bot2/services.py:34-35`
**Nima noto'g'ri:** `parse_roster_payload` 1..4 dan tashqarini rad etadi, lekin model 1..5 (migration 0007 graduated=5), `submit_survey` 1..5 qabul qiladi, analytics year-5 bitiruvchilarni boshqaradi. Bitiruvchi rosterlari CSV/JSON import orqali umuman yuklanmaydi (HTTP import ham, management komandasi ham `parse_roster_payload`'dan o'tadi).
**Ta'siri:** Bitiruvchi (5-kurs) rosterlari bulk-import qilinmaydi → graduate qamrov maxraji bo'sh; xato xabari ham noto'g'ri ("1..4"). *(adjusted: medium — deliberate feature negated, bir qatorli fix)*
**Tuzatish:** `parse_roster_payload`'da 1..5 ga ruxsat bering (tuple/range va xabarni yangilang).

---

#### M-10. Bir nechta dashboard sahifalarida error state UI yo'q — faqat console.error — [dashboard/error-handling]
**Joy:** `dashboard/app/dashboard/students/page.tsx:56`, `enrollments/page.tsx:74`, `analytics/surveys/page.tsx:102`
**Nima noto'g'ri:** Bu sahifalar yuklash xatosini faqat `console.error` qiladi va loading'ni tugatadi. Foydalanuvchi bo'm-bo'sh jadval/nol statistikani ko'radi, retry yoki sabab yo'q. Catalog va analytics/enrollments esa `ErrorDisplay` ishlatadi — nomuvofiqlik.
**Ta'siri:** Xatolikda foydalanuvchi ma'lumot yo'q deb o'ylaydi; retry yo'q. *(adjusted: low — UX polish, mavjud `ErrorDisplay` komponentidan foydalanish)*
**Tuzatish:** `error` state + `ErrorDisplay` (`onRetry`) qo'shing.

---

#### M-11. Survey detail saqlashda consents/answers tip o'zgarishi — [dashboard/data-integrity]
**Joy:** `dashboard/app/dashboard/surveys/[id]/page.tsx:239`
**Nima noto'g'ri:** PATCH `consents`/`answers`'ni to'liq obyekt yuboradi; `populateSurveyForm` barcha answer qiymatlarini `String()` ga aylantiradi (185-qator). JSONField wholesale almashadi → raqamli qiymatlar (masalan course_year 4) string `"4"` bo'lib qaytadi.
**Ta'siri:** Tahrirlab saqlashda answer tiplari buziladi. *(adjusted: low — kalitlar yo'qolmaydi (spread bilan saqlanadi); bot faqat label+course_year yozadi, hech narsa buzilmaydi)*
**Tuzatish:** Original tiplarni saqlang (faqat ko'rsatish uchun string), yoki faqat o'zgargan maydonlarni PATCH qiling.

---

#### M-12. Dashboard Docker NEXT_PUBLIC_API_URL'siz build qilinadi — localhost'ga qotib qoladi — [deploy/dashboard]
**Joy:** `dashboard/Dockerfile:7`, `lib/api.ts:3`
**Nima noto'g'ri:** `NEXT_PUBLIC_*` build vaqtida bundle'ga inline bo'ladi. Dockerfile `RUN npm run build`'ni `NEXT_PUBLIC_API_URL` bermasdan bajaradi → `http://localhost:8000` (default) qotib yoziladi. Runtime `env_file` kech.
**Ta'siri:** Docker-built dashboard har doim `localhost:8000`'ga so'rov yuboradi → prod'da login/barcha API ishlamaydi. *(adjusted: medium — hujjatlangan bare-metal deploy yo'lida muammo yo'q; Docker yo'li mavjud bo'lmagan `./dashboard/.env`'ga ishora qilib baribir buzilgan)*
**Tuzatish:** Dockerfile'ga `ARG/ENV NEXT_PUBLIC_API_URL` ni `npm run build`dan oldin qo'shing; compose'da `build.args` bilan bering.

---

#### M-13. Ikkita docker-compose.yml zid — server/ chala (postgres volume yo'q) — [deploy/config]
**Joy:** `server/docker-compose.yml:19`, root `docker-compose.yml:19-81`
**Nima noto'g'ri:** Root compose to'liq stack + `postgres_data` named volume. `server/docker-compose.yml` faqat db+web, service nomi `web` (root'da `server`), va **postgres uchun volume yo'q** → container qayta yaratilsa DB yo'qoladi. `server` vs `web` nomi ALLOWED_HOSTS/CSRF'dagi `server` bilan mos kelmaydi. docs/11-deploy bu db-only compose'ni operatsion deb hujjatlaydi va Postgres tavsiya qiladi — aynan data-loss yo'li.
**Ta'siri:** server/docker-compose'dan foydalansa Postgres volume'siz → DB yo'qolishi; service-nom nomuvofiqligi. *(adjusted: medium)*
**Tuzatish:** Bitta rasmiy compose qoldiring (root, to'liq); server/'nikiga `postgres_data` volume qo'shing yoki o'chiring; service nomini `server` ga moslang.

---

#### M-14. DEPLOYMENT hujjatlari olib tashlangan bot1 unitlarini ko'rsatadi — [deploy/config]
**Joy:** `DEPLOYMENT.md:106-227`, `DEPLOYMENT_PM2_SUPERVISOR.md:136-227`
**Nima noto'g'ri:** Ikkala hujjatda ham `bot1_service` o'rnatish, `ttpu-bot1.service` (systemd) va `[program:ttpu-bot1]` (supervisor) bor. `bot1_service` papkasi yo'q. `systemctl enable --now ... ttpu-bot1` fail/restart loop'ga tushadi.
**Ta'siri:** Deploy qiluvchi bot1 venv'da xatoga uchraydi; orphan unit fail loop + log spam (asosiy deploy ishlaydi). *(adjusted: medium)*
**Tuzatish:** Ikkala hujjatdan barcha bot1 bo'limlarini (install, systemd/supervisor unit, enable, journalctl) olib tashlang.

---

#### M-15. submit_survey to'liq @transaction.atomic SQLite'da uzoq lock — [backend/concurrency]
**Joy:** `server/bot2/views.py:231`, `crm_server/settings.py:96-100`
**Nima noto'g'ri:** Default SQLite OPTIONS'siz (timeout/WAL yo'q), view bir atomic blokda bir nechta yozuv + `full_clean()` qiladi. Kampaniya burstida konkurrent submit'lar lock uchun kutadi. (Eslatma: Django timeout bermasa `sqlite3` default `busy_timeout=5000` ishlatadi — darhol fail emas, ~5s kutadi.)
**Ta'siri:** Konkurensiyada `OperationalError 'database is locked'` → 500 → retry amplifikatsiyasi. *(adjusted: low — 5s busy cushion yengil contention'ni yumshatadi)*
**Tuzatish:** SQLite qolsa OPTIONS `{"timeout": 20}` + WAL; atomic blokni qisqartiring; real konkurensiya uchun Postgres.

---

#### M-16. ServiceToken DB-token yo'li (_verify_db_token) butunlay test qilinmagan — [backend/test-gap]
**Joy:** `server/common/auth.py:18-31, 34-62`
**Nima noto'g'ri:** Asosiy DB-backed token yo'li (is_active, expiry, service_name scoping, last_used_at) hech qaerda test qilinmagan — barcha testlar settings fallback shoxini ishlatadi. Bare `except Exception: pass` ham pin qilinmagan.
**Ta'siri:** Asosiy rotatable token mexanizmi verifikatsiyasiz shippanadi; expiry/scoping/silent-fallback regressiyalari sezilmaydi. *(adjusted: medium)*
**Tuzatish:** Testlar qo'shing (valid/expired/inactive/service-mismatch/last_used_at); except'ni DB exception'lariga toraytiring.

---

#### M-17. JWT refresh endpoint (RefreshView) test qilinmagan, jumladan revoked shoxi — [backend/test-gap]
**Joy:** `server/authn/views.py:76-93`
**Nima noto'g'ri:** Refresh cookie'dan yangi access token chiqaradi va `RevokedToken.is_revoked` bilan revoked refresh'ni rad etadi. Hech bir test `auth-refresh`'ni chaqirmaydi — missing-cookie 401, malformed InvalidToken, va xavfsizlik-kritik revoked rejection qoplanmagan.
**Ta'siri:** `is_revoked` tekshiruvini olib tashlovchi regressiya logout qilingan foydalanuvchiga cheksiz token mint qilishga ruxsat berishi mumkin — hech narsa fail bo'lmaydi. *(adjusted: medium)*
**Tuzatish:** `reverse('auth-refresh')` testlari: success, missing-cookie 401, invalid, logout-then-refresh→rejected.

---

#### M-18. import_roster view (CSV/JSON bulk import) test qilinmagan — [backend/test-gap]
**Joy:** `server/bot2/views.py:183-226`
**Nima noto'g'ri:** Uch input shakli (CSV file, JSON list, `{'rows':[...]}`), 207 vs 200 split, audit log — view darajasida test yo'q. `file.read().decode("utf-8")` ushlanmagan → non-UTF-8/cp1251 yoki BOM'li (Excel default) CSV opaque 500 beradi.
**Ta'siri:** Bulk-import bug (noto'g'ri status, swallowed errors, cp1251 CSV'da 500) sezilmay shippanadi. *(adjusted: low — admin-only, kam chastotali; root'da test-gap)*
**Tuzatish:** import_roster testlari (JSON list, rows, CSV, fail-row→207, 400). Decode'ni try/except'ga o'rang.

---

#### M-19. 5 ta analytics endpoint (6 tadan) test qilinmagan — [backend/test-gap]
**Joy:** `server/analytics/views.py:113-435`
**Nima noto'g'ri:** Faqat `bot2_course_year_coverage` test qilingan. `bot2_program_coverage`, `bot2_program_course_matrix`, `bot2_program_details_by_year`, `enrollments_overview`, `bot2_academic_years` testsiz. Bularda eng xatога moyil mantiq bor: academic_year auto-resolution, year-5 graduate fallback, va `bot2_program_details_by_year`'dagi mo'rt substring matching (`'ishlayapman'/'employed'/'ишлаяпман'` → employed, qolgani unemployed; bo'sh status → unemployed).
**Ta'siri:** Dashboard KPI'larini boshqaruvchi endpointlar verifikatsiyasiz; bot'da label o'zgarishi jimgina noto'g'ri employment hisoblaydi. *(adjusted: medium; sarlavhadagi "7 tadan 5" — aslida "6 tadan 5")*
**Tuzatish:** Har endpoint uchun happy-path + employment classification + academic_year/graduate-fallback testlari.

---

#### M-20. Bot2StudentViewSet / Bot2SurveyResponseViewSet yozuvlari audit qilinmaydi — [backend/data-integrity]
**Joy:** `server/bot2/views.py:74-111`, `audit/utils.py:40-72`
**Nima noto'g'ri:** Audit logging butunlay qo'lda (signal yo'q). Bu ikki to'liq writable ModelViewSet `perform_*` override'siz — admin student PII (ism, telefon, telegram_user_id, region) va survey javoblarini tahrirlashi/o'chirishi **audit izi qoldirmaydi**. Roster/enrollment/catalog viewset'lar esa `log_audit` qiladi.
**Ta'siri:** Shaxsiy ma'lumot va survey o'zgarishi/o'chirilishi kuzatilmaydi — audit log maqsadini buzadi. *(adjusted: medium)*
**Tuzatish:** Bu ikki viewset'ga `perform_*`+`log_audit` qo'shing yoki (afzal) audited-mixin/post_save signal. AuditLog yaratilishini tasdiqlovchi test.

---

### ⚪ LOW

#### L-1. _auto_generate_code 999 dan oshsa lexicographic Max buziladi — [backend/bug]
**Joy:** `server/catalog/serializers.py:36-48`
Codes 3 raqamga zero-pad, `Max('code')` string. `PROGRAM-1000` paydo bo'lgach lexicographic Max `PROGRAM-999` qaytaradi → keyingi kod to'qnashadi → spurious duplicate-code xato (auto-generate shoxi uniqueness re-check qilmaydi → IntegrityError). *(Bir turdagi 1000 element — kichik CRM'da deyarli erishilmas.)* **Tuzatish:** Numerik suffix'ni Python'da parse qiling yoki integer counter.

#### L-2. _auto_generate_code Max(code) read-modify-write race — [backend/concurrency]
**Joy:** `server/catalog/serializers.py:36-48`
Konkurrent ikki catalog create bir xil kod generatsiya qiladi → ikkinchi INSERT IntegrityError → noto'g'ri 400 ("kod allaqachon mavjud", garchi foydalanuvchi kod kiritmagan). *(Default SQLite writes serialize; admin-only kam chastotali.)* **Tuzatish:** IntegrityError'da auto-generated kodni qayta urinib loop qiling yoki sequence.

#### L-3. verify_service_token DB xatolarini jimgina yutadi, fallback loglanmaydi — [backend/security]
**Joy:** `server/common/auth.py:40-53`
Bare `except Exception: pass` har qanday DB xatosini yutadi va static `settings.SERVICE_TOKENS`'ga o'tadi (logsiz). DB blip'da revoked/expired DB token static hash orqali qabul qilinishi mumkin (faqat dual-config'da). **Tuzatish:** Except'ni DB exception'lariga toraytiring, fallback'ni loglang, DB-token deployment'da SERVICE_TOKENS bo'sh bo'lsin.

#### L-4. Login uchun account-level lockout yo'q (faqat 10/min/IP throttle) — [backend/security]
**Joy:** `server/authn/serializers.py:22-28`, `common/throttles.py:1-5`
`LoginRateThrottle` 10/min/IP, per-account lockout yo'q → IP aylantirib credential-stuffing loosely cheklanadi. (Serializer generic "Invalid credentials." qaytaradi — enumeration yo'q. *Eslatma: "<EMAIL-REDAKSIYA> committed creds" da'vosi server/.env'da emas — bu bot2_service/.env'da.*) **Tuzatish:** Account-targeted throttle/lockout; exposed credential'larni rotate qiling.

#### L-5. Submit_survey unauthenticated endpoint faqat IP-based AnonRateThrottle (100/day) — [backend/security]
**Joy:** `server/bot2/views.py:229-232`, `settings.py:137-141`
`permission_classes([])` permission'larni tozalaydi, lekin `throttle_classes`'ni emas → default `AnonRateThrottle` 100/day/IP. Per-token/write throttle yo'q. Bitta NAT IP ortidagi bot kampaniyada 100/day cap'ga urilib silently 429 olishi mumkin. *(Abuse yarmi token leak'ga bog'liq; LocMemCache per-worker.)* **Tuzatish:** Service-scoped `ScopedRateThrottle`; anon throttle'ni bu endpoint'dan oling.

#### L-6. Bot2SurveyResponse.clean() course_year drift (sync gap) — [backend/validation]
**Joy:** `server/bot2/models.py:128-134`
`clean()` `survey.course_year==roster.course_year` talab qiladi, lekin `services.py:71` `.update()` ishlatib `clean()`'ni bypass qiladi, va RosterViewSet admin roster course_year'ni o'zgartirsa denormalizatsiyalangan survey qatorlari drift bo'ladi. *(Sarlavhadagi "graduate surveys block" da'vosi submit yo'lida refuted.)* **Tuzatish:** Denormalizatsiya sync'ni hujjatlang; roster-edit'da survey'larni re-validatsiya qiling.

#### L-7. Insecure cookie/transport defaultlari (Secure/HSTS/SSL redirect off) — [backend/config]
**Joy:** `server/crm_server/settings.py:181-197`
`JWT_COOKIE_SECURE/SESSION/CSRF_COOKIE_SECURE/SSL_REDIRECT` default false, HSTS=0, hech narsa DEBUG'ga bog'liq emas. Committed `.env` SECURE_* blokini tashlab ketadi. *(`.env.example` to'g'ri prod blokga ega.)* **Tuzatish:** DEBUG=False'da Secure=True + SSL redirect + HSTS majburlang.

#### L-8. Default SECRET_KEY + DEBUG fallback insecure boot — [backend/config]
**Joy:** `server/crm_server/settings.py:13-14, 20-21`
`SECRET_KEY` default `'dev-secret-key-change-me'`, fail-fast check yo'q. Committed `.env`'da `DJANGO_SECRET_KEY=replace-me`, `DJANGO_DEBUG=true`. (Eslatma: DEBUG default `false`; ['*'] va CORS-all faqat committed `.env` yuklansa fire qiladi.) **Tuzatish:** Non-DEBUG'da SECRET_KEY default/yo'q bo'lsa `ImproperlyConfigured` ko'taring.

#### L-9. Dashboard JWT'ni localStorage'ga dublikat qiladi — httpOnly'ni buzadi (XSS) — [dashboard/security]
**Joy:** `dashboard/lib/api.ts:219-224, 205-208, 287-291`
Backend httpOnly cookie o'rnatadi, lekin LoginView access+refresh'ni JSON body'da ham qaytaradi va dashboard ularni localStorage'ga yozadi + har so'rovga Authorization header qo'yadi → XSS ikkala token'ni (7-kunlik refresh'ni ham) o'g'irlashi mumkin. *(Refresh aslida credentials:'include' bilan ishlaydi; localStorage refresh faqat presence gate — past riskli; revocation mavjud.)* **Tuzatish:** Faqat httpOnly cookie'larga tayaning; JSON body'dan token qaytarmang, localStorage'ni olib tashlang.

#### L-10. Cookie-auth catch-all barcha server xatolarini 401 InvalidToken qiladi — [backend/error-handling]
**Joy:** `server/authn/authentication.py:48-51`
DB down kabi haqiqiy server xatosi 401 ("session expired") sifatida ko'rsatiladi → frontend foydalanuvchini logout qiladi, infratuzilma incidentlari auth muammosi bo'lib ko'rinadi (server-side warning loglanadi). **Tuzatish:** Transient DB xatolarini token-validatsiyadan ajrating (5xx/503 propagatsiya).

#### L-11. CatalogItemViewSet is_active filtri non-canonical qiymatlarni jimgina e'tiborsiz qoldiradi — [backend/bug]
**Joy:** `server/catalog/views.py:26-27`
`is_active` faqat `'true'/'false'` da qo'llaniladi; `'1'/'0'/'True'/'yes'` jimgina e'tiborsiz → unfiltered list. *(Mavjud consumerlar canonical "true" yuboradi.)* **Tuzatish:** Kengroq boolean encodinglar yoki noma'lum qiymatga 400.

#### L-12. RevokedToken logout yozuvlari non-atomik best-effort — [backend/concurrency]
**Joy:** `server/authn/models.py:89-100`, `views.py:99-113`
`revoke` `get_or_create`+unique jti — race-safe (yaxshi). Lekin LogoutView refresh+access'ni alohida `try/except:pass`'da, atomic'siz revoke qiladi; jarayon orada o'lsa biri qolib ketadi. Refresh birinchi (security-kritik) bo'lgani uchun ta'sir cheklangan. **Tuzatish:** Ikki revoke'ni `transaction.atomic`'ga o'rang; exception'larni loglang.

#### L-13. AuditLog jadvali cheksiz o'sadi — retention/cleanup yo'q — [backend/perf]
**Joy:** `server/audit/models.py:7-49`
RevokedToken'dan farqli, AuditLog uchun cleanup komandasi/retention/cron yo'q. catalog create to'liq `serializer.data`'ni yozadi. *(Import faqat bitta kichik xulosa qatori; katalog CRUD kam chastotali.)* **Tuzatish:** Retention komandasi (N kundan eskini o'chiradigan, cleanup_tokens kabi).

#### L-14. Bot2Student'da unique maydonlar uchun dublikat indekslar — [backend/perf]
**Joy:** `server/bot2/models.py:49,53,71-74`
`student_external_id`/`telegram_user_id` `unique=True` (allaqachon indeks), Meta.indexes'da yana ortiqcha indeks. INSERT/UPDATE'da keraksiz write amplification. **Tuzatish:** Meta.indexes'dan bu ikki bir-ustunli indeksni olib tashlang (migration bilan).

#### L-15. Server Dockerfile poetry.lock'siz `poetry install` — non-reproducible build — [deploy/config]
**Joy:** `server/Dockerfile:13-15`
`poetry.lock` yo'q + caret range'lar (`^5.0`) → har build turli versiya. Poetry (Dockerfile) vs pip/requirements.txt (DEPLOYMENT.md) ikki manba sinxron emas. *(Hozir mos; upper bound'lar major sakrashni oldini oladi.)* **Tuzatish:** `poetry.lock` yarating va commit; yoki bitta manbaga o'ting (`poetry export`, bot2 kabi).

#### L-16. docker-compose bind-mount butun loyihani ulaydi — image kodi soya qilinadi — [deploy/config]
**Joy:** `server/docker-compose.yml:23-24`, root `docker-compose.yml:26-27`
`- .:/app`/`- ./server:/app` runtime'da image kodini host fayllariga almashtiradi (dev pattern). *(Paketlar system site-packages'da, soya qilinmaydi — finding shu qismda noto'g'ri; rasmiy prod yo'li Docker-free.)* **Tuzatish:** Prod compose'dan kod bind-mount'ni oling; dev uchun `docker-compose.override.yml`.

#### L-17. SERVICE_TOKEN_BOT1_HASH eskirgan dead config — [deploy/dead-code]
**Joy:** `server/.env.example:19`, `server/.env:18`, `.env.example:24`
Bot1 olib tashlangan; `settings.py` faqat `bot2` o'qiydi, lekin BOT1_HASH (server/.env'da real hash bilan) hali bor. README/sql-structure ham bot1'ni hujjatlaydi. **Tuzatish:** Barcha `.env`/`.env.example` va README/SQL'dan bot1 izlarini olib tashlang.

#### L-18. Root req.txt mavjud bo'lmagan bot1_service/requirements.txt'ga havola — [deploy/config]
**Joy:** `req.txt:2`
`-r bot1_service/requirements.txt` (papka yo'q) → `pip install -r req.txt` darhol xato beradi, hech bir dependency o'rnatilmaydi. *(Rasmiy deploy per-service install qiladi.)* **Tuzatish:** `req.txt:2` qatorini o'chiring.

#### L-19. DEPLOYMENT.md pip vs Dockerfile Poetry — manba ikkilanishi — [deploy/config]
**Joy:** `DEPLOYMENT.md:37`, `server/Dockerfile:11-15`
requirements.txt va pyproject.toml ikki alohida qo'lda sinxronlanadigan manba (hozir mos, kelajakda drift). **Tuzatish:** Bitta manba — Dockerfile'da ham requirements.txt yoki `poetry export` (bot2 kabi).

#### L-20. course_year tugmalari faqat o'zbekcha — RU/EN i18n teshigi — [bot/ux]
**Joy:** `bot2_service/src/bot2_service/keyboards.py:67`
`course_year_keyboard(lang)` "graduated"'ni lokalizatsiya qiladi, lekin kurs raqamlari `f"{year}-kurs"` qattiq o'zbekcha. RU/EN foydalanuvchi "1-kurs" ko'radi. *(callback_data neytral — funksional muammo yo'q.)* **Tuzatish:** Kurs label'ini ham lokalizatsiya qiling.

#### L-21. JWT token faqat 401 reaksiyasida yangilanadi — exp tekshirilmaydi — [bot/error-handling]
**Joy:** `bot2_service/src/bot2_service/api.py:79-113`
Token bir marta olinadi, exp tekshirilmaydi; faqat 401'da reaktiv refresh + bitta retry. Token expire bo'lganda birinchi katalog so'rovi qo'shimcha kechikish ko'radi; relogin yiqilsa bo'sh klaviatura. *(15-min cache TTL + 15-min token — minimal ta'sir.)* **Tuzatish:** Proaktiv exp tekshiruvi yoki periodik refresh.

#### L-22. Bo'sh ism/familiya/kompaniya/lavozim non-text input'da jim qabul qilinadi — [bot/data-integrity]
**Joy:** `handlers.py:176,187,306,316`
Matn o'rniga rasm/stiker kelsa `message.text` None → bo'sh string saqlanadi, keyingi bosqichga o'tiladi (validatsiya yo'q). student_id'dan farqli, submit'ni bloklamaydi → ism/familiyasiz student yaratiladi. **Tuzatish:** Bo'sh/non-text input'da o'sha bosqichda qoldirib qayta so'rang (kamida ism/familiya uchun).

#### L-23. CatalogCache global lock'ni network call davomida ushlaydi — [bot/concurrency]
**Joy:** `bot2_service/src/bot2_service/catalog_cache.py:20-32`
`_get_cached` `await self.api.get_catalog_items()` davomida bitta umumiy `self._lock`'ni ushlaydi → bitta sekin fetch barcha konkurrent katalog o'qishlarni bloklaydi; bo'sh natija keshlanmaydi → qayta-qayta bloklovchi fetch. *(Single-instance bot, kam konkurensiya, 900s TTL.)* **Tuzatish:** Per-key lock yoki network call davomida lock'ni bo'shating; negative natijani qisqa keshlang.

#### L-24. Viewer roliga yozish tugmalari ko'rsatiladi, backend 403 qaytaradi — [dashboard/ux]
**Joy:** `dashboard/components/dashboard-layout.tsx:187`
Frontend hech qaerda rolni tekshirmaydi; viewer "Yangi qo'shish"/"Tahrirlash"/"O'chirish"/"Saqlash" tugmalarini ko'radi va bosib faqat 403 toast oladi. *(Backend himoyalaydi — xavfsizlik buzilishi yo'q.)* **Tuzatish:** `user.role !== 'admin'` bo'lsa yozish tugmalarini yashiring/disable qiling.

#### L-25. Enrollments jadvalida colSpan noto'g'ri (7 vs 9 ustun) — [dashboard/bug]
**Joy:** `dashboard/app/dashboard/enrollments/page.tsx:171`
Bo'sh holat qatori `colSpan={7}`, jadval esa 9 ustun → "Ma'lumot topilmadi" noto'g'ri tekislanadi. *(Sof kosmetik.)* **Tuzatish:** `colSpan={9}`.

#### L-26. Analytics o'quv yili tanlagichida ortiqcha "-yil" — [dashboard/ux]
**Joy:** `dashboard/app/dashboard/analytics/surveys/page.tsx:172`
`{year}-yil` → backend "2025-2026" qaytargani uchun "2025-2026-yil" ko'rinadi (diapazon uchun noto'g'ri qo'shimcha). *(value o'zgarmaydi — filtr to'g'ri ishlaydi.)* **Tuzatish:** Label'ni "{year}" yoki "{year} o'quv yili" ga o'zgartiring.

#### L-27. dashboard students/enrollments cheklangan page_size, client-side count noto'g'ri — [dashboard/perf]
**Joy:** `students/page.tsx:51-55`, `enrollments/page.tsx:66-73,102-107`
enrollments `page_size:'200'` bilan yuklab statistikani (totalStudents/coverage) shu 200 item ustida hisoblaydi → 200 dan oshsa noto'g'ri. (H-13 bilan bog'liq, lekin enrollments asosan latent — ProgramEnrollment qatorlari kam.) **Tuzatish:** Server-side pagination; statistikani `enrollments_overview` agregatsiya endpointidan oling.

#### L-28. O'lik kod to'plami — [bot/dashboard/backend/dead-code]
Birlashtirilgan past-jiddiylikli o'lik kod:
- `dashboard/lib/hooks/use-pagination.ts` (+ use-search, use-date-filter) — hech qaerda import qilinmaydi.
- `bot2_service/.../texts.py:86-152` `get_regions`/static `REGIONS` — chaqirilmaydi (catalog API bo'sh qaytarsa fallback ishlamaydi).
- `states.py:19` `waiting_channels` — hech qachon set qilinmaydi.
- `catalog_cache.py:40-44` `get_subjects`/`get_tracks` — chaqirilmaydi.
- `config.py:18,41` `DEFAULT_LANGUAGE` — parse qilinadi, hech qaerda o'qilmaydi (kod "uz" qattiq kodlangan).
- `common/permissions.py:12-23` `IsAdminCatalogWriter` — `IsViewerOrAdminReadOnly`'ning byte-for-byte nusxasi.
- `settings.py:37,39,148-149` `token_blacklist`/`authtoken` app'lar ishlatilmaydi; `BLACKLIST_AFTER_ROTATION` inert (ROTATE=False).
- `catalog/views.py:2` `DjangoFilterBackend` — import qilinadi, ishlatilmaydi.

**Tuzatish:** O'lik kodni olib tashlang yoki haqiqatda ulang; `IsAdminCatalogWriter`'ni alias qiling yoki o'chiring.

#### L-29. SingleInstanceLock faqat host-lokal (fcntl) — [bot/concurrency]
**Joy:** `bot2_service/.../single_instance.py:33-52`
Lock /tmp fayl + fcntl — faqat bitta host. Windows'da lock yo'q, ko'p container/mashinada bir nechta poller → TelegramConflictError. *(Compose single replica; `_polling_exit_on_conflict` konfliktda toza chiqadi.)* **Tuzatish:** Single replica deploy'ni hujjatlang; ko'p-host kerak bo'lsa distributed lock (Redis SETNX).

---

## 4. Tavsiya etilgan tuzatish tartibi

**Bosqich 0 — Darhol (xavfsizlik, eng katta ta'sir):**
1. **C-1** — Sirlarni rotate qiling (Telegram token, service token, dashboard parol), `.env`'larni git'dan oling, tarixni tozalang. *(Repo public — eng shoshilinch.)*

**Bosqich 1 — Deploy bloklovchilari (kam mehnat, katta ta'sir):**
2. **C-2** — bot2 Dockerfile PYTHONPATH/install (1 qator) — bot Docker'da ishga tushadi.
3. **H-1** — Gunicorn `0.0.0.0:8000` (1 qator) — Docker deploy ochiladi.
4. **L-18, L-17, M-14** — bot1 dead-code/havolalarni tozalang (req.txt, .env, DEPLOYMENT docs) — deploy onboarding'ni tuzatadi.
5. **M-13** — Bitta rasmiy compose; postgres volume — data-loss oldini oladi.
6. **M-12** — Dashboard Dockerfile NEXT_PUBLIC_API_URL build-arg.

**Bosqich 2 — Bot ishonchliligi (foydalanuvchiga ta'sir, kam mehnat):**
7. **H-2** — Global error handler (bot crash'ni oldini oladi).
8. **H-3** — Bo'sh student_id soxta "rahmat" → re-prompt/submission_failed.
9. **M-4, M-3, M-1** — State'ni terminal xatoda saqlash, fallback handler/`/cancel`, RedisStorage.

**Bosqich 3 — Data integrity (backend):**
10. **H-7 / H-8 / M-7** — `UniqueConstraint(student, survey_campaign)` + ichki savepoint + `IntegrityError`→409 (bir nechta masalani birga hal qiladi).
11. **M-9** — course_year 1..5 (1 qator) — bitiruvchi import.
12. **M-6, H-14** — StudentRoster `save()`+`full_clean()` (program-type invariant).
13. **H-5, H-6, M-5** — coverage clamp + year-5 fallback + academic_year scoping.

**Bosqich 4 — Dashboard UX/correctness:**
14. **H-12** — students/[id] error tekshiruvi.
15. **H-13, H-10, L-27** — server-side pagination (students, surveys, enrollments).
16. **H-11** — middleware.ts route guard (yoki o'lik faylni o'chirish).
17. **M-10, L-24, L-25, L-26** — error UI, role-gating, kosmetik tuzatishlar.

**Bosqich 5 — Sifat/test/gigiyena (past shoshilinch):**
18. **M-16, M-17, M-18, M-19, M-20** — test gap'lar va audit signal.
19. **H-9, L-13** — RevokedToken/AuditLog retention scheduler.
20. **L-1..L-23, L-28, L-29** — qolgan low'lar (dead-code tozalash, throttle, cookie secure defaultlar, i18n).

---

## 5. Tekshirilishi kerak (noaniq topilmalar)

Bu topilmalar ehtiyotkorona kiritilgan — asosiy da'voda noaniqlik bor:

**U-1. `.env.example` raw bot2 token + valid hash (critical, security)**
*Cited joy NOTO'G'RI:* `server/.env.example:19` aslida `SERVICE_TOKEN_BOT1_HASH=` (bo'sh, BOT1), `:20` `SERVICE_TOKEN_BOT2_HASH=` (bo'sh). Hash u yerda **yo'q**. `.env.example`'ni verbatim copy qilgan deploy world-writable EMAS (bo'sh hash → PermissionDenied). Lekin **haqiqiy xavf C-1 bilan qoplangan**: committed `server/.env:19` (real hash) + `bot2_service/.env:4` (raw token) repo'da ishlaydigan juftlik. Tekshirish: faqat C-1'ga e'tibor bering; bu finding noto'g'ri faylga ishora qiladi.

**U-2. submit_survey atomic rollback return-on-exception bilan bypass + str(exc) leak (medium, error-handling)**
`str(exc)` leak **haqiqiy** va loyiha o'z `custom_exception_handler` (generic xabar) konvensiyasiga zid. Lekin "atomic rollback bypass → partial commit" da'vosi **asosan refuted**: Django `mark_for_rollback_on_error` DatabaseError'da `needs_rollback=True` o'rnatadi, shuning uchun cited IntegrityError stsenariylari aslida to'g'ri rollback bo'ladi (partial commit emas). Bot caller bo'lgani uchun leak ta'siri past. Tekshirish: faqat `str(exc)`→generic xabar tuzatishini bajaring (H-8 bilan birga).

**U-3. server/.env'da DJANGO_DEBUG=true va USE_SQLITE=1 — prod uchun xavfli (high, config)**
`DEBUG=true` + `USE_SQLITE=1` committed `.env`'da **tasdiqlangan**. Lekin eng o'tkir da'volar **refuted**: bu `.env` `DJANGO_ALLOWED_HOSTS` va `CORS_ALLOWED_ORIGINS`'ni o'rnatadi, shuning uchun `ALLOWED_HOSTS=['*']` va `CORS_ALLOW_ALL_ORIGINS=True` chainlari **fire qilmaydi**. Faqat DEBUG stack-trace exposure haqiqiy. Prod docs (`.env.example`) `DEBUG=false`. Tekshirish: bu C-1 (`.env`'ni git'dan olish) bilan asosan hal bo'ladi; qo'shimcha — prod docs'da multi-worker SQLite tavsiyasini olib tashlang (`DEPLOYMENT_PM2_SUPERVISOR.md:101`).
