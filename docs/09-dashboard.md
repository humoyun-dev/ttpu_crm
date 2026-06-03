# Dashboard (Next.js boshqaruv paneli)

Bu hujjat TTPU CRM tizimining **boshqaruv paneli** (`dashboard/`) qismini batafsil yoritadi. Panel — universitet xodimlari (admin va viewer rollari) uchun mo'ljallangan, **butunlay o'zbek tilida** ishlaydigan bir sahifali ilova (SPA). U Telegram bot (Bot 2) orqali yig'ilgan so'rovnoma natijalarini ko'rish/tahrirlash, talabalar ro'yxati (roster) va dasturlar bo'yicha talabalar sonini (enrollment) boshqarish, katalogni tahrirlash va analitika hisobotlarini ko'rsatish uchun xizmat qiladi.

Bu hujjat loyihaga yangi qo'shilgan frontend dasturchi uchun yozilgan: u API klient dizayni, autentifikatsiya oqimi, himoya qatlamlari va har bir sahifaning vazifasini tushunishi kerak. Backend API tafsilotlari uchun [07-api-malumotnoma.md](07-api-malumotnoma.md) ga qarang.

---

## 1. Texnologiyalar steki

`dashboard/package.json` faylidan olingan asosiy bog'liqliklar:

| Texnologiya | Versiya | Vazifasi |
|-------------|---------|----------|
| **Next.js** | `16.1.3` | App Router asosidagi React freymvork. `next dev`/`next build`/`next start`. |
| **React** | `19.2.3` | UI kutubxonasi (React 19). |
| **TypeScript** | `^5` | Statik tiplash. |
| **Tailwind CSS** | `v4` (`@tailwindcss/postcss`) | Utility-first CSS. `app/globals.css` da `@import "tailwindcss"` orqali ulanadi. |
| **Radix UI / shadcn** | `radix-ui ^1.4.3` + alohida `@radix-ui/*` paketlar | Quyi darajadagi accessible komponentlar (dialog, select, dropdown, tabs, popover, alert-dialog, avatar, label, slot). shadcn uslubidagi wrapperlar `components/ui/` da. |
| **next-themes** | `^0.4.6` | Light/dark/system mavzu (theme). |
| **sonner** | `^2.0.7` | Toast bildirishnomalar. |
| **lucide-react** | `^0.562.0` | Ikonkalar. |
| **date-fns** | `^4.1.0` | Sana formatlash (asosan `react-day-picker` uchun). |
| **react-day-picker** | `^9.14.0` | Sana tanlash kalendari (`components/ui/calendar.tsx`). |
| **xlsx** | `^0.18.5` | So'rovnomalarni Excel (`.xlsx`) ga eksport qilish. |
| **clsx + tailwind-merge** | — | `cn()` yordamchisi (`lib/utils.ts`) klass nomlarini birlashtiradi. |

`next.config.ts` da `output: "standalone"` (Docker uchun mustaqil build), `compress: true`, `poweredByHeader: false` va `turbopack.root` o'rnatilgan.

`components/ui/` papkasidagi shadcn komponentlari: `alert-dialog, avatar, badge, button, calendar, card, dialog, dropdown-menu, input, label, popover, select, separator, sheet, sonner, table, tabs, textarea`.

---

## 2. Loyiha tuzilishi (App Router)

```
dashboard/
├── app/
│   ├── layout.tsx                 # Root layout: ThemeProvider + AuthProvider + Toaster
│   ├── page.tsx                   # "/" — auth holatiga qarab /dashboard yoki /login
│   ├── globals.css                # Tailwind v4 + theme o'zgaruvchilari
│   ├── login/
│   │   ├── layout.tsx             # Markazlashtirilgan login konteyner
│   │   └── page.tsx               # /login — kirish formasi
│   └── dashboard/
│       ├── layout.tsx             # Client guard + DashboardLayout (sidebar)
│       ├── page.tsx               # /dashboard — KPI kartalar (bosh sahifa)
│       ├── surveys/
│       │   ├── page.tsx           # So'rovnomalar ro'yxati + Excel eksport
│       │   └── [id]/page.tsx      # Bitta so'rovnoma: ko'rish + inline tahrir
│       ├── students/
│       │   ├── page.tsx           # Roster ro'yxati
│       │   └── [id]/page.tsx      # Roster yaratish/tahrirlash (id="new" => yangi)
│       ├── enrollments/
│       │   ├── page.tsx           # Dasturlar bo'yicha talabalar soni
│       │   └── [id]/page.tsx      # Enrollment yaratish/tahrirlash
│       ├── catalog/page.tsx       # Tabbed CRUD (barcha CatalogType lar)
│       ├── analytics/
│       │   ├── page.tsx           # Analitika landing (2 karta)
│       │   ├── surveys/page.tsx   # Kurs-yili qamrovi + dastur drill-down
│       │   └── enrollments/page.tsx  # Umumiy qamrov ko'rinishi
│       └── applications/page.tsx  # /dashboard/surveys ga redirect (qoldiq)
├── components/
│   ├── dashboard-layout.tsx       # Sidebar, navigatsiya, user menyu
│   ├── theme-provider.tsx / theme-toggle.tsx
│   ├── loading.tsx / error-display.tsx
│   └── ui/                        # shadcn komponentlari
├── lib/
│   ├── api.ts                     # API klient (apiFetch + modullar)
│   ├── auth-context.tsx           # AuthProvider / useAuth
│   ├── constants.ts               # O'zbekcha label lug'atlari
│   ├── utils.ts                   # cn, formatCourseYearLabel, formatUzPhone
│   └── hooks/                     # use-pagination, use-search, use-date-filter (ISHLATILMAYDI — 5-bo'limga qarang)
├── proxy.ts                       # Cookie gate (ULANMAGAN — 4-bo'limga qarang)
├── next.config.ts
└── package.json
```

---

## 3. API klient dizayni (`lib/api.ts`)

Bu fayl butun panelning backend bilan aloqasining yagona darvozasidir. Markazida `apiFetch<T>()` generic funksiyasi turadi.

### 3.1 Asosiy URL va sarlavhalar

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
```

Har bir so'rov:
- `Content-Type: application/json` bilan ketadi;
- `localStorage` dagi `access_token` mavjud bo'lsa, `Authorization: Bearer <token>` sarlavhasi qo'shiladi (`getToken()`);
- `credentials: "include"` — backend o'rnatgan HttpOnly cookielar (`access_token`/`refresh_token`) ham yuboriladi.

> Diqqat: panel JWT ni **ham `localStorage` da** (Bearer sarlavha uchun), **ham cookie da** (backend `set_cookie` qiladi) saqlaydi. Bearer sarlavha asosiy yo'l, cookie esa refresh uchun ishlatiladi (3.3 ga qarang).

### 3.2 Javob formati

`apiFetch` har doim `ApiResponse<T>` qaytaradi:

```typescript
interface ApiResponse<T> {
  data?: T;
  error?: { code: string; message: string | string[] };
}
```

- Muvaffaqiyatli (`res.ok`) bo'lsa: `{ data: body }`.
- Xatolik bo'lsa: backendning `{error:{code,message,...}}` konvertini qaytaradi, yoki DRF maydon xatolarini (`{"field": ["xato"]}`) `"field: xato"` ko'rinishida bitta stringga yig'adi (`API_ERROR` kodi bilan).
- Tarmoq uzilsa: `{ error: { code: "NETWORK_ERROR", message } }`.

Bu yondashuv tufayli sahifalar `try/catch` o'rniga `if (res.error) ...` shaklida ishlaydi.

### 3.3 401 ishlovi va token refresh (single-flight)

`apiFetch` da `res.status === 401` qaytsa:

```
401 javob
  │
  ├─ retryOnAuthFailure === true ?
  │     │
  │     ├─ refreshAccessToken() ──► muvaffaqiyat ──► so'rovni 1 marta qayta yuborish (retry=false)
  │     │
  │     └─ muvaffaqiyatsiz ──┐
  │                          ▼
  └─ tokenlarni tozalash (clearStoredTokens)
     pathname !== "/login" bo'lsa ──► window.location.replace("/login")
     ──► { error: { code: "UNAUTHORIZED", message: "Session expired" } }
```

**Single-flight refresh** — `refreshAccessToken()` modul darajasidagi `refreshRequest` promise orqali bir vaqtda faqat bitta refresh so'rovi ketishini kafolatlaydi. Bir nechta so'rov bir vaqtda 401 olsa, ular bitta refresh natijasini kutadi:

```typescript
let refreshRequest: Promise<boolean> | null = null;
async function refreshAccessToken(): Promise<boolean> {
  if (refreshRequest) return refreshRequest;   // davom etayotgan refreshga qo'shilish
  refreshRequest = (async () => { ... })();
  try { return await refreshRequest; }
  finally { refreshRequest = null; }
}
```

Refresh so'rovi `POST /api/v1/auth/refresh` ga **tana (body) yubormasdan** ketadi — yangi access token backend tomonidan `refresh_token` **cookie** orqali olinadi (`credentials:"include"`). Javobdagi `access` `localStorage` ga (`persistTokens`) yoziladi, refresh token o'zgartirilmaydi (backendda `ROTATE_REFRESH_TOKENS=False`).

> Eslatma: `localStorage` dagi `refresh_token` faqat "refresh mavjudmi" sharti uchun ishlatiladi; haqiqiy refresh cookie orqali amalga oshadi.

### 3.4 Token saqlash

```typescript
function persistTokens(access, refresh) {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
  setAuthMarkerCookie(true);   // dashboard_auth=1; max-age=7 kun; samesite=lax
}
```

`dashboard_auth` — bu **sezgir bo'lmagan marker cookie** (faqat "kimdir kirgan" belgisi, JWT emas). 7 kun yashaydi. `clearStoredTokens()` esa ikkala localStorage tokenni va marker cookieni o'chiradi.

### 3.5 Modullar

`apiFetch` ustiga to'rtta modul qurilgan:

#### `authApi`
| Metod | Endpoint | Izoh |
|-------|----------|------|
| `login(email, password)` | `POST /api/v1/auth/login` | Muvaffaqiyatda `persistTokens` chaqiradi. |
| `logout()` | `POST /api/v1/auth/logout` | `LogoutResult` qaytaradi; har holatda `finally` da `clearStoredTokens`. 401 ni xato deb hisoblamaydi. |
| `me()` | `GET /api/v1/auth/me` | Joriy foydalanuvchi (`User`). |

#### `catalogApi`
- `list(type?, params?)` → `GET /api/v1/catalog/items/?type=...` (qo'shimcha `params` ham qo'shiladi, masalan `is_active`, `page_size`).
- `get(type, id)`, `create(type, data)`, `update(type, id, data)`, `delete(type, id)`.
- **Muhim remapping:** `create`/`update` da klient `meta` maydonini olib, backendga `metadata` deb yuboradi va `description` ni **butunlay tashlab yuboradi**:
  ```typescript
  const { meta, description, ...rest } = data;
  body: JSON.stringify({ type, ...rest, metadata: meta });
  ```
  Demak panel orqali katalog elementiga `description` saqlab bo'lmaydi; `meta` esa backenddagi `metadata` ga tushadi.

#### `bot2Api`
So'rovnoma domeni uchun CRUD:
- `listSurveys/getSurvey/updateSurvey` → `/api/v1/bot2/surveys/`
- `listStudents/getStudent/updateStudent` → `/api/v1/bot2/students/`
- `listRoster/getRoster/createRoster/updateRoster/deleteRoster` → `/api/v1/bot2/roster/`
- `listEnrollments/getEnrollment/createEnrollment/updateEnrollment/deleteEnrollment` → `/api/v1/bot2/enrollments/`

Har bir `list*` ixtiyoriy `params` (masalan `page_size`, `ordering`, `is_active`) ni `URLSearchParams` orqali query string ga aylantiradi.

#### `analyticsApi`
Bot 2 qamrov tahlili uchun (faqat o'qish):

```typescript
function _analyticsParams(opts?) {
  const end   = opts?.to   || new Date(Date.now() + 400*86400000).toISOString(); // bugun + ~400 kun
  const start = opts?.from || new Date(Date.now() - 730*86400000).toISOString(); // bugun - ~730 kun (2 yil)
  const params = new URLSearchParams({ from: start, to: end });
  if (opts?.academicYear) params.set("academic_year", opts.academicYear);
  return params.toString();
}
```

Backend analitika endpointlari **vaqt oralig'ini majburiy** talab qiladi (`TIME_RANGE_REQUIRED`), shu sababli `_analyticsParams` standart keng oraliq beradi (taxminan 2 yil orqaga va ~1 yil oldinga). Bu keng oraliq deyarli barcha yozuvlarni qamrab oladi.

| Metod | Endpoint | Sahifada ishlatiladi |
|-------|----------|----------------------|
| `getAcademicYears()` | `/api/v1/analytics/bot2/academic-years` | analytics/surveys |
| `getCourseYearCoverage(opts?)` | `/api/v1/analytics/bot2/course-year-coverage` | analytics/surveys |
| `getProgramDetailsByYear(courseYear, opts?)` | `/api/v1/analytics/bot2/program-details-by-year` | analytics/surveys |
| `getEnrollmentOverview(opts?)` | `/api/v1/analytics/bot2/enrollments-overview` | analytics/enrollments |
| `getProgramCoverage(opts?)` | `/api/v1/analytics/bot2/program-coverage` | **ISHLATILMAYDI** (dead code) |

`getProgramCoverage` aniqlangan, lekin hech bir sahifa uni chaqirmaydi.

### 3.6 Yordamchi funksiyalar (`lib/api.ts` oxiri)

- `getItemName(item, lang="uz")` — `name_uz`/`name`/`metadata.name_uz`/`code` ketma-ketligida nom topadi.
- `formatDate(date, includeTime=false)` — `uz-UZ` lokalida formatlaydi (`null` => `"-"`).
- `getGenderLabel(gender)` — `male→Erkak`, `female→Ayol`, `other→Boshqa`, `unspecified→Ko'rsatilmagan`.

---

## 4. Autentifikatsiya va himoya qatlamlari

### 4.1 Auth context (`lib/auth-context.tsx`)

`AuthProvider` butun ilovani o'raydi (`app/layout.tsx`) va `useAuth()` orqali `{ user, loading, login, logout }` beradi.

- **`hydrateUser()`** — bir marta ishlaydi (`hydratedRef` orqali himoyalangan). Agar `localStorage` da na `access_token`, na `refresh_token` bo'lsa, `/auth/me` ni **umuman chaqirmaydi** (kafolatlangan 401 va konsol xatosidan qochish uchun) va `/login` ga yo'naltiradi. Token bor bo'lsa `authApi.me()` chaqiradi; `UNAUTHORIZED` qaytsa — `/login`.
- **`login(email, password)`** — `authApi.login` so'ng `authApi.me()` orqali `user` ni o'rnatadi. Xatoda `{ success:false, error }`.
- **`logout()`** — `authApi.logout()`, `user=null`, `router.replace("/login")` + `router.refresh()`.

### 4.2 Uch qatlamli himoya — nazariya va amaliyot

Loyiha dizayni uch qatlamli himoyani nazarda tutadi, lekin amalda faqat ikkitasi ishlaydi:

```
1-qatlam: proxy.ts (Next middleware) — cookie gate
          ┌─────────────────────────────────────────────┐
          │ ⚠️ ULANMAGAN — pastdagi "Muhim nuance" ga    │
          │    qarang. Hozir kuchga kirmaydi.            │
          └─────────────────────────────────────────────┘
2-qatlam: app/dashboard/layout.tsx — client guard ✅ ISHLAYDI
          loading? → PageLoading; !user? → null + replace("/login")
3-qatlam: apiFetch 401 ishlovi ✅ ISHLAYDI
          har qanday 401 → refresh → bo'lmasa replace("/login")
```

**2-qatlam (asosiy himoya, ishlaydi).** `app/dashboard/layout.tsx` client komponent: `useAuth()` dan `user`/`loading` oladi. `loading` bo'lsa `PageLoading` ko'rsatadi; `!user` bo'lsa `null` qaytaradi va `/login` ga yo'naltiradi (`hasRedirected` ref bilan bir martalik). Faqat `user` mavjud bo'lganda `DashboardLayout` (sidebar) render qiladi.

**3-qatlam (ishlaydi).** Yuqorida 3.3 da tasvirlangan — istalgan API chaqiruvi 401 olsa refresh urinadi, bo'lmasa `/login` ga uloqtiradi.

**1-qatlam — `proxy.ts` (ULANMAGAN).** Fayl `proxy` nomli funksiyani eksport qiladi:

```typescript
export function proxy(request: NextRequest) {
  const isAuthenticated = Boolean(
    request.cookies.get("access_token")?.value ||
    request.cookies.get("refresh_token")?.value
  );
  // /login + /dashboard/* uchun cookie gate
}
export const config = { matcher: ["/login", "/dashboard/:path*"] };
```

> **Muhim nuance (kod tahlilidan aniqlangan):**
> 1. Next.js middleware ishlashi uchun fayl `middleware.ts` deb nomlanishi va `middleware` funksiyasini eksport qilishi kerak. Loyihada `middleware.ts` **yo'q**, fayl `proxy.ts` deb nomlangan va `proxy` eksport qiladi — shuning uchun bu middleware **umuman ulanmagan** (Next uni ishga tushirmaydi).
> 2. U `access_token`/`refresh_token` **cookielarini** o'qiydi, lekin panel kirgan foydalanuvchini belgilash uchun `dashboard_auth` marker cookieni o'rnatadi. Cross-domen deploy da (`api.example.uz` vs `crm.example.uz`) backend o'rnatgan HttpOnly cookielar dashboard domenida ko'rinmaydi. Demak ulansa ham, bu gate cross-domen sharoitida ishlamaydi.
>
> Xulosa: amaldagi himoya **2- va 3-qatlamga** (client guard + apiFetch 401) tayanadi. `proxy.ts` ni jonli middleware sifatida hujjatlashtirmang.

### 4.3 next.config.ts — xavfsizlik sarlavhalari

Barcha yo'llarga (`source: "/:path*"`) quyidagi sarlavhalar qo'yiladi:

| Sarlavha | Qiymat |
|----------|--------|
| `X-Frame-Options` | `DENY` (clickjacking himoyasi) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

Bundan tashqari `poweredByHeader: false` (`X-Powered-By` o'chirilgan), `compress: true`.

---

## 5. Qayta ishlatiladigan hooklar — ESLATMA: ishlatilmaydi

`lib/hooks/` da uchta hook bor, lekin **hech bir sahifa ularni import qilmaydi** (kod bo'yicha grep bilan tasdiqlandi — ular dead code):

| Fayl | Eksport | Mo'ljallangan vazifa |
|------|---------|----------------------|
| `lib/hooks/use-pagination.ts` | `usePagination(initialPage=1, pageSize=25)` | `page/totalCount/totalPages/goNext/goPrev/resetPage`. |
| `lib/hooks/use-search.ts` | `useSearch(delay=300)` | Debounce qilingan qidiruv (`searchTerm`, `debouncedSearch`). |
| `lib/hooks/use-date-filter.ts` | `useDateFilter()` | `fromDate/toDate` + `toApiParams()` (ISO stringlar). |

Amalda har bir sahifa o'zining lokal `useState` mantiqini takrorlaydi (masalan `surveys/page.tsx` da pagination, qidiruv va sana oralig'i to'g'ridan-to'g'ri komponent ichida yozilgan). Bu hooklar refaktoring uchun tayyorlangan, ammo hozircha ulanmagan.

---

## 6. Yagona layout va navigatsiya

`components/dashboard-layout.tsx` (`DashboardLayout`) — desktopda chap tomonda 64-kenglikdagi sidebar (`<aside className="hidden ... lg:block">`), mobilda esa `Sheet` (drawer) orqali ochiladi. Yuqori header da mobil menyu tugmasi va `ThemeToggle` joylashgan.

Sidebar navigatsiyasi (`navigation` massivi):

| Sarlavha | Yo'l | Ikonka | Bolalar |
|----------|------|--------|---------|
| So'rovnomalar | `/dashboard/surveys` | `Users` | — |
| Talabalar | `/dashboard/students` | `GraduationCap` | — |
| Talabalar soni | `/dashboard/enrollments` | `BookOpen` | — |
| Analitika | `/dashboard/analytics` | `BarChart3` | So'rovnoma (`/analytics/surveys`), Talabalar soni (`/analytics/enrollments`) |
| Katalog | `/dashboard/catalog` | `FolderTree` | — |

> Eslatma: `/dashboard/applications` navigatsiyada **yo'q** (qoldiq stub). Faol holat `pathname === href || pathname.startsWith(href + "/")` bilan aniqlanadi.

Sidebar ostida user menyu (DropdownMenu): avatar (email birinchi harfi), email, rol (`user.role`) va "Chiqish" (logout) tugmasi. Logout `useAuth().logout()` ni chaqiradi, natijaga qarab `sonner` toast ko'rsatadi.

---

## 7. Sahifalar (har biri batafsil)

| Yo'l | Fayl | Vazifasi qisqacha |
|------|------|-------------------|
| `/` | `app/page.tsx` | Auth holatiga qarab `/dashboard` yoki `/login` ga `router.replace`. Yuklanayotganda "Yuklanmoqda...". |
| `/login` | `app/login/page.tsx` | Kirish formasi (Login + Parol). `useAuth().login`; muvaffaqiyatda toast + `/dashboard`. `user` allaqachon bo'lsa `/dashboard` ga yo'naltiradi. Layout (`login/layout.tsx`) formani markazlashtiradi. |
| `/dashboard` | `app/dashboard/page.tsx` | 4 ta KPI karta. Har biri `page_size=1` bilan `count` oladi (faqat son kerak): so'rovnomalar, talabalar (students), talabalar soni (enrollments), faol katalog (`is_active=true`). Kartalar tegishli ro'yxatga link. |
| `/dashboard/surveys` | `surveys/page.tsx` | So'rovnomalar jadvali: matn qidiruvi, ish bandligi/sana statistikasi, klient-tomon pagination, Excel eksport. Pastda 7.1 da batafsil. |
| `/dashboard/surveys/[id]` | `surveys/[id]/page.tsx` | Bitta javobni ko'rish va **inline tahrirlash** (`?edit=true` bilan tahrir rejimida ochiladi). 7.2 da batafsil. |
| `/dashboard/students` | `students/page.tsx` | Roster jadvali (`page_size=100`, klient-tomon). "Talaba qo'shish" → `/dashboard/students/new`. Tahrir/o'chirish (AlertDialog tasdiq). |
| `/dashboard/students/[id]` | `students/[id]/page.tsx` | Roster forma. `id === "new"` => yaratish, aks holda tahrir. Dastur (program) tanlovi, kurs (1–4 va "Bitirgan"=5), kampaniya, holat. |
| `/dashboard/enrollments` | `enrollments/page.tsx` | Dasturlar bo'yicha talabalar soni jadvali (`page_size=200`). Klient qidiruv, qamrov foizlari, umumiy statistika, o'chirish (AlertDialog). |
| `/dashboard/enrollments/[id]` | `enrollments/[id]/page.tsx` | Enrollment forma. Yangi yozuvda joriy o'quv yili avtomatik to'ldiriladi. 7.3 da batafsil. |
| `/dashboard/catalog` | `catalog/page.tsx` | Tabbed CRUD: barcha `CatalogType` lar bo'yicha. 7.4 da batafsil. |
| `/dashboard/analytics` | `analytics/page.tsx` | Landing — 2 ta karta (So'rovnoma, Talabalar soni) + tushuntirish. |
| `/dashboard/analytics/surveys` | `analytics/surveys/page.tsx` | Kurs-yili qamrovi (doiraviy progress kartalar) + dastur darajasidagi drill-down. O'quv yili filtri. 7.5 da batafsil. |
| `/dashboard/analytics/enrollments` | `analytics/enrollments/page.tsx` | Umumiy qamrov: jami/ishtirok/foiz + kurslar bo'yicha + dastur×kurs jadvali. |
| `/dashboard/applications` | `applications/page.tsx` | `redirect("/dashboard/surveys")` — server-side stub. Navigatsiyada yo'q. |

### 7.1 So'rovnomalar ro'yxati (`surveys/page.tsx`)

Eng murakkab sahifa. Asosiy xususiyatlar:

- **Yuklash:** `fetchData()` ikki so'rov yuboradi:
  ```typescript
  bot2Api.listSurveys({ page_size: "500", ordering: "-submitted_at" });
  bot2Api.listStudents({ page_size: "500" });   // student xaritasi: id -> Bot2Student
  ```
  Talabalar `studentMap` ga to'planadi, chunki jadvalda har bir so'rovnoma uchun talaba ismi, telefoni, viloyati kerak (so'rovnomada `student_details` bo'lmasa ham).
- **Qidiruv:** klient-tomon `useMemo` filtri — ism, familiya, `student_external_id`, telefon, kampaniya, kompaniya, lavozim, takliflar bo'yicha. Qidiruv o'zgarganda `currentPage` 1 ga qaytadi.
- **Statistika kartalar:** jami javoblar, noyob kampaniyalar soni, "Ishlamoqda" (`employment_status === "employed"`), "Ishlamaydi" (`unemployed`).
- **Pagination:** to'liq klient-tomon. `PAGE_SIZE_OPTIONS = [20, 50, 100]`, navigatsiya tugmalari (birinchi/oldingi/keyingi/oxirgi). Ya'ni 500 ta yozuv bir marta yuklanib, brauzerda sahifalanadi.
- **Excel eksport:** alohida "Excel eksport" kartasi. Sana oralig'i preseti (`all/today/week/month/year/custom`) tanlanadi; `custom` da `react-day-picker` kalendarlari (Dan/Gacha) ochiladi. `exportSurveys` — `filteredSurveys` ustiga sana filtri qo'llangan ro'yxat. `handleExport` `xlsx` (`XLSX.utils.json_to_sheet`) bilan o'zbekcha ustun sarlavhalari (Ism, Familiya, Student ID, Telefon, Jins, Viloyat, Telegram username/ID, Yo'nalish, Kurs, Ishlaysizmi?, Kompaniya, Lavozim, Yordam kerakmi?, Ma'lumot ulashish, Takliflar, Kampaniya, Sana) bilan fayl yaratadi. Fayl nomi: `sorovnomalar_<preset>_<YYYY-MM-DD>.xlsx`. Ustun kengliklari avtomatik hisoblanadi.
- **Jadval:** responsivlik uchun ko'p ustunlar faqat `lg`/`xl` da ko'rinadi. Har bir qatorda "Ko'rish" (`/surveys/[id]`) va "Tahrirlash" (`/surveys/[id]?edit=true`) tugmalari.

### 7.2 So'rovnoma tafsiloti (`surveys/[id]/page.tsx`)

- `useParams()` dan `id`, `useSearchParams()` dan `?edit=true` (boshlang'ich tahrir rejimi).
- Yuklashda: `getSurvey(id)`; agar `student_details` bo'lmasa `getStudent(...)`; viloyat dropdowni uchun `catalogApi.list("region")`.
- Ikki rejim: **ko'rish** (`InfoRow` lar) va **tahrir** (`EditField` + `Select` lar). Tahrirda:
  - Talaba: ism, familiya, jins, telefon, Telegram username, viloyat. (Student ID va Telegram ID o'zgarmas.)
  - So'rovnoma: kurs (1–5), ish holati (`employed`/`unemployed`), kompaniya, lavozim, kampaniya, takliflar.
  - Roziliklar (`consents`): har bir kalit uchun Ha/Yo'q tugmasi.
  - Javoblar (`answers`): dinamik maydonlar; rating kalitlari (`dormitory, transport, food, library, ...`) yulduzcha (★/5) sifatida ko'rsatiladi.
- **Saqlash** (`handleSave`): avval `updateStudent`, so'ng `updateSurvey` (`consents` va `answers` bilan birga). Muvaffaqiyatda toast + ko'rish rejimiga qaytish.
- Label tarjimalari `lib/constants.ts` dagi `EMPLOYMENT_LABELS`, `CONSENT_LABELS`, `LABEL_TRANSLATIONS`, `courseYearLabel` dan keladi.

### 7.3 Enrollment forma (`enrollments/[id]/page.tsx`)

- `id === "new"` => yaratish.
- **Joriy o'quv yili avtomatik:** `currentAcademicYear()` — sentyabr (oy ≥ 9) bo'lsa `YYYY-(YYYY+1)`, aks holda `(YYYY-1)-YYYY`. Bu `academic_year` ning standart qiymati.
- Dastur tanlovi uchun **ham `program`, ham `direction`** turlari yuklanadi (`Promise.all`) va birlashtirilib alfavit bo'yicha saralanadi; `direction` lar `(yo'nalish)` deb belgilanadi.
- Tahrir rejimida yuqorida 3 ta read-only ko'rsatkich karta: jami talabalar, ishtirok etganlar (`responded_count`), qamrov (`coverage_percent`) — bu maydonlar backend tomonidan hisoblanadi.
- Saqlashda `payload` aniq tiplab yuboriladi (`Number(course_year)`, `Number(student_count)`, va h.k.).

### 7.4 Katalog (`catalog/page.tsx`)

- `Tabs` orqali 6 ta `CatalogType` (`CATALOG_TYPES_INFO`): Dasturlar, Yo'nalishlar, Hududlar, Tarmoqlar, Fanlar, Boshqa.
- Tab o'zgarganda `fetchData()` (`catalogApi.list(activeTab)`) qayta yuklaydi va formani tozalaydi.
- Jadval: O'zbekcha / Ruscha / Inglizcha nomlar, Meta (maydonlar soni), Yaratilgan sana. Har bir qatorda DropdownMenu (Tahrirlash / O'chirish).
- **Yaratish/Tahrirlash dialogi:** `name_uz` majburiy. `name_ru`, `name_en` ixtiyoriy. Meta — JSON textarea (`JSON.parse` xato bo'lsa toast). Saqlashda `meta` faqat bo'sh bo'lmasa yuboriladi.
- **O'chirish:** `AlertDialog` tasdiq.

> **Muhim cheklov (koddan):** Meta JSON maydoni dialogda **faqat `formData.type !== "program"`** bo'lganda ko'rsatiladi:
> ```tsx
> {formData.type !== "program" && ( <Label>Meta (JSON)</Label> ... )}
> ```
> Backend esa `program` turiga `level`, `track`, `language`, `duration_years` metadatasini **majburiy** qiladi (`CATALOG_TYPES_INFO` da `requiresMetadata: true`). Demak dastur (program) elementini panel UI orqali yaratishda metadata kiritib bo'lmaydi va backend `INVALID`/`400` qaytarishi mumkin. Dasturlar amalda `seed_programs` management komandasi orqali to'ldiriladi (qarang [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md)).

### 7.5 Analitika — So'rovnoma (`analytics/surveys/page.tsx`)

- Mount da `getAcademicYears()` chaqiriladi; natija bo'lsa eng yangi yil tanlanadi, bo'lmasa filtersiz `loadCoverage()`.
- `selectedAcademicYear` o'zgarganda `getCourseYearCoverage({academicYear})` qayta yuklanadi.
- Har bir kurs uchun **doiraviy SVG progress** karta (qamrov foizi rangli: ≥75% yashil, ≥50% primary, >0 to'q sariq).
- Kartani bosish → `getProgramDetailsByYear(courseYear, {academicYear})` — shu kurs ichidagi dasturlar bo'yicha jadval (Jami / Qatnashgan / Qamrov / Ishlaydi / Ishlamaydi). Qayta bosish yopadi (toggle).

### 7.6 Analitika — Talabalar soni (`analytics/enrollments/page.tsx`)

- `getEnrollmentOverview()` bitta so'rov bilan: umumiy `total_students`, `total_responded`, `coverage_percent`, `by_year[]`, `by_program[]`.
- Uchta yuqori karta (jami / ishtirok / qamrov), so'ng "Kurslar bo'yicha" jadvali va "Yo'nalish va kurslar kesimida" jadvali.

---

## 8. Stil, mavzu va o'zbekcha matn

- **Mavzu (theme):** `next-themes` orqali `attribute="class"`, `defaultTheme="system"`, `enableSystem`. `ThemeToggle` header da. Tailwind v4 `@custom-variant dark` bilan dark rejim uchun CSS o'zgaruvchilari `globals.css` da.
- **Toast:** `sonner` `<Toaster position="top-right" />` — root layout da. Barcha xato/muvaffaqiyat xabarlari o'zbekcha.
- **Til:** `<html lang="uz">`. Barcha UI matni o'zbek tilida. Sana `formatDate` orqali `uz-UZ` lokalida; telefon `formatUzPhone` orqali `+998 XX XXX XX XX` formatiga keltiriladi (`lib/utils.ts`).
- **Kurs yorlig'i:** `formatCourseYearLabel`/`courseYearLabel` — `5` => "Bitirgan", aks holda `${year}-kurs`.

---

## 9. Tezkor xulosa (yangi dasturchi uchun)

1. Backend manzilini `NEXT_PUBLIC_API_URL` orqali bering (standart `http://localhost:8000`).
2. Barcha API chaqiruvlari `lib/api.ts` dagi modullardan (`authApi`, `catalogApi`, `bot2Api`, `analyticsApi`) o'tadi — to'g'ridan-to'g'ri `fetch` yozmang.
3. Yangi himoyalangan sahifa qo'shsangiz, uni `app/dashboard/...` ostiga joylashtiring — `dashboard/layout.tsx` client guard avtomatik ishlaydi.
4. Pagination/qidiruv mantiqini yangidan yozish o'rniga `lib/hooks/` dagi tayyor hooklarni ulashni ko'rib chiqing (hozir ular ishlatilmayapti).
5. Katalog dasturlarini (program) UI orqali yaratishga urinmang — metadata maydoni yo'q; `seed_programs` dan foydalaning.
6. `proxy.ts` ni ishonchli himoya deb hisoblamang — u Next middleware sifatida ulanmagan.

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — JWT, cookie, rollar va service token (backend tomoni)
- [04-katalog.md](04-katalog.md) — CatalogItem/CatalogRelation va dasturlar
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovnoma domeni (roster, student, survey, enrollment)
- [06-analitika-va-audit.md](06-analitika-va-audit.md) — Analitika endpointlari (panel shu yerdan o'qiydi)
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma (barcha endpointlar)
- [08-telegram-bot.md](08-telegram-bot.md) — Telegram bot servisi (ma'lumot manbai)
- [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md) — Deploy, build va seed komandalar
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari
