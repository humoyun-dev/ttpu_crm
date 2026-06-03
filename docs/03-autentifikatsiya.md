# Autentifikatsiya va avtorizatsiya

Bu hujjat TTPU CRM backend'ining autentifikatsiya (kim kirayapti?) va avtorizatsiya (nimaga ruxsati bor?) qismini batafsil yoritadi. U ikki xil "kiruvchi"ni qamrab oladi:

1. **Odamlar (CRM xodimlari)** — admin va viewer rollaridagi foydalanuvchilar. Ular dashboard orqali email/parol bilan kiradi va JWT (access + refresh) token oladi. Tokenlar HttpOnly cookie'da hamda javob body'sida qaytariladi.
2. **Mashinalar (Bot 2)** — Telegram so'rovnoma boti. U JWT ishlatmaydi, balki `X-SERVICE-TOKEN` header'i orqali **service token** (SHA-256 hash bilan tekshiriladigan mashina-mashina token) bilan tasdiqlanadi.

Hujjat yangi kelgan dasturchi uchun yozilgan: har bir tushuncha asl kod fayllariga (`server/authn/...`, `server/common/...`) havola qilingan va har bir muhim oqim ASCII ketma-ketlik diagrammasi bilan ko'rsatilgan.

---

## 1. Custom `User` modeli

Manba: `server/authn/models.py:User` va `server/authn/models.py:UserManager`.

Django'ning standart `User` modeli `username` bilan ishlaydi. TTPU CRM'da esa **email orqali login** qilinadi, shuning uchun `AbstractUser` kengaytirilib o'zgartirilgan.

```python
# server/authn/models.py
class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        VIEWER = "viewer", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = None                                  # username butunlay olib tashlangan
    email = models.EmailField(unique=True)           # login maydoni
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)

    USERNAME_FIELD = "email"      # Django login uchun email ishlatadi
    REQUIRED_FIELDS: list[str] = []
    objects = UserManager()
```

Asosiy xususiyatlari:

| Maydon | Tafsilot |
|--------|----------|
| `id` | **UUIDv4** primary key (`editable=False`). Integer auto-increment emas — ketma-ket ID'lar tashqaridan taxmin qilinmaydi. |
| `username` | `None` qilingan — bu maydon umuman yo'q. |
| `email` | `unique=True`, `USERNAME_FIELD`. Login va identifikatsiya shu orqali. |
| `role` | `admin` yoki `viewer`. Default — `viewer`. Bu **biznes roli** (quyida `is_staff` bilan farqi tushuntiriladi). |
| `REQUIRED_FIELDS` | Bo'sh ro'yxat — `createsuperuser` faqat email va parol so'raydi. |
| `Meta.ordering` | `("email",)` — foydalanuvchilar email bo'yicha alifbo tartibida. |

### 1.1 `role` (biznes roli) bilan `is_staff` / `is_superuser` (Django flaglari) farqi

Bu eng ko'p chalkashtiradigan joy. Ular **uch xil maqsadga** xizmat qiladi:

| Belgi | Nimani boshqaradi | API'ga ta'siri |
|-------|-------------------|----------------|
| `role` (`admin`/`viewer`) | **CRM ichidagi ruxsatlar.** API permission klasslari (`IsAdminUserRole`, `IsViewerOrAdminReadOnly`) aynan shuni tekshiradi. | To'g'ridan-to'g'ri — yozish (POST/PUT/PATCH/DELETE) faqat `role == admin` uchun. |
| `is_staff` | **Django admin paneliga** (`/admin/`) kira olish. | API ruxsatlariga ta'sir qilmaydi. |
| `is_superuser` | Django'ning ichki object-level permission tizimida hamma ruxsatga ega bo'lish. | API permission klasslari **buni tekshirmaydi** — ular faqat `role`'ga qaraydi. |

Demak, masalan, `is_superuser=True` lekin `role="viewer"` bo'lgan foydalanuvchi Django admin'da hamma narsani qila oladi, lekin **REST API'da** baribir faqat o'qish huquqiga ega bo'ladi. CRM API mantig'i uchun **faqat `role` muhim**.

### 1.2 `UserManager` — foydalanuvchi yaratish

`UserManager` (`BaseUserManager` voris) email majburiy bo'lishini ta'minlaydi va rol default'larini o'rnatadi:

```python
def create_user(...):   # is_staff=False, is_superuser=False, role=VIEWER
def create_superuser(...):  # is_staff=True, is_superuser=True, role=ADMIN
```

`create_superuser` qattiq tekshiruv qiladi: `is_staff` va `is_superuser` `True` bo'lmasa `ValueError` ko'tariladi. E'tibor bering — superuser yaratilganda `role` avtomatik `ADMIN` bo'ladi.

---

## 2. JWT konfiguratsiyasi (SimpleJWT)

Manba: `server/crm_server/settings.py` (`SIMPLE_JWT` bloki), `REST_FRAMEWORK`.

Backend `djangorestframework-simplejwt` kutubxonasidan foydalanadi. JWT — **stateless** (server xotirada sessiya saqlamaydi); foydalanuvchi har so'rovda imzolangan token yuboradi.

```python
# server/crm_server/settings.py
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "15"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.getenv("REFRESH_TOKEN_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}
```

| Sozlama | Qiymat | Izoh |
|---------|--------|------|
| `ACCESS_TOKEN_LIFETIME` | **15 daqiqa** (default; `ACCESS_TOKEN_MINUTES` env bilan) | Qisqa umrli — o'g'irlansa ham tez eskiradi. |
| `REFRESH_TOKEN_LIFETIME` | **7 kun** (default; `REFRESH_TOKEN_DAYS` env bilan) | Yangi access token olish uchun. |
| `ROTATE_REFRESH_TOKENS` | `False` | Refresh ishlatilganda **yangi refresh berilmaydi** — eski refresh 7 kun davomida amal qiladi. |
| `BLACKLIST_AFTER_ROTATION` | `True` | Rotatsiya o'chiq bo'lgani uchun amaliy ta'siri yo'q. |
| `AUTH_HEADER_TYPES` | `("Bearer",)` | Header formati: `Authorization: Bearer <token>`. |
| `AUTH_TOKEN_CLASSES` | faqat `AccessToken` | API uchun faqat access token qabul qilinadi (refresh emas). |

**Imzolash algoritmi:** SimpleJWT default'i — **HS256** (simmetrik). Alohida `SIGNING_KEY` berilmagan, shuning uchun u Django `SECRET_KEY` (`DJANGO_SECRET_KEY` env, default `"dev-secret-key-change-me"`) bilan imzolanadi. **Production'da `DJANGO_SECRET_KEY` albatta o'rnatilishi shart**, aks holda tokenlar zaif kalit bilan imzolanadi.

> Eslatma: `ROTATE_REFRESH_TOKENS=False` bo'lgani uchun token denylist'i (`RevokedToken`) qo'lda boshqariladi — bu logout va revoke uchun (4-bo'lim).

### 2.1 Cookie sozlamalari

```python
# server/crm_server/settings.py
ACCESS_COOKIE_NAME = os.getenv("ACCESS_COOKIE_NAME", "access_token")
REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "refresh_token")
JWT_COOKIE_SECURE = ...     # default false, production'da true
JWT_COOKIE_SAMESITE = ...   # default "Lax"
JWT_COOKIE_DOMAIN = ...     # default None
```

Tokenlar `HttpOnly` cookie sifatida o'rnatiladi (`server/authn/views.py:_set_cookie`), ya'ni JavaScript ularni o'qiy olmaydi — XSS himoyasi. `secure`, `samesite`, `domain` env orqali sozlanadi. `path="/"` — butun sayt uchun.

---

## 3. `CookieJWTAuthentication` — autentifikatsiya mantig'i

Manba: `server/authn/authentication.py:CookieJWTAuthentication`.

Bu klass `REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"]` da yagona default authentication klass. Har bir API so'rovida ishlaydi. U SimpleJWT'ning `JWTAuthentication`'ini kengaytiradi va **ikki manbadan token qabul qiladi**:

1. `Authorization: Bearer <token>` header (dashboard `apiFetch` shuni yuboradi).
2. Agar header bo'lmasa yoki yaroqsiz bo'lsa — `access_token` cookie'dan (fallback).

### 3.1 `authenticate()` oqimi

```python
def authenticate(self, request):
    header = self.get_header(request)
    raw_token = self.get_raw_token(header)
    if raw_token:
        try:
            return self._authenticate_token(raw_token)      # 1. header tokenni sina
        except InvalidToken:
            pass                                              # 2. eskirgan bo'lsa — cookie'ga o't
        except Exception:
            logger.warning(...); pass                         # kutilmagan xato — cookie'ga o't

    raw_cookie_token = request.COOKIES.get(settings.ACCESS_COOKIE_NAME)
    if not raw_cookie_token:
        return None                                           # 3. token umuman yo'q → anonim

    try:
        return self._authenticate_token(raw_cookie_token)    # 4. cookie tokenni sina
    except InvalidToken:
        raise                                                 # cookie ham yaroqsiz → 401
    except Exception:
        logger.warning(...)
        raise InvalidToken("Authentication failed due to a server error.")
```

**Nega header eskirsa cookie'ga o'tiladi?** Frontend ba'zan eskirgan `Authorization` header'ni saqlab qolishi mumkin, ayni paytda cookie yangilangan bo'ladi. Header xatosini "yutib", cookie orqali jimgina tiklash uchun shunday qilingan (kod izohida ham yozilgan).

**Muhim nuans:** cookie token bosqichida `InvalidToken` (eskirgan/yaroqsiz token) → DRF buni 401 ga aylantiradi. Lekin DB xatosi kabi **kutilmagan xatolar** ham `InvalidToken`'ga o'raladi — bu 500 emas, **401** qaytishini ta'minlaydi.

```
So'rov keladi
   │
   ▼
Authorization header bormi?
   │ ha                          │ yo'q
   ▼                              ▼
header tokenni validate     access_token cookie bormi?
   │ valid │ InvalidToken/xato      │ yo'q → None (anonim foydalanuvchi)
   ▼       └──────────┐             │ ha
(user, token)         ▼             ▼
qaytadi          cookie tokenni validate
                       │ valid → (user, token)
                       │ InvalidToken → 401
                       │ boshqa xato → InvalidToken → 401
```

### 3.2 `get_validated_token()` va RevokedToken tekshiruvi

Har bir token tasdiqdan o'tganda, denylist'da emasligi ham tekshiriladi:

```python
def get_validated_token(self, raw_token):
    validated = super().get_validated_token(raw_token)   # imzo + exp tekshiruvi
    if RevokedToken.is_revoked(validated):                # denylist tekshiruvi
        raise InvalidToken("Token has been revoked.")
    return validated
```

`super().get_validated_token()` imzo va muddat (`exp`) ni tekshiradi. Keyin token `jti` (JWT ID) bo'yicha `RevokedToken` jadvalida bormi tekshiriladi — bu logout qilingan tokenlarni bekor qilish imkonini beradi.

---

## 4. `RevokedToken` — token denylist

Manba: `server/authn/models.py:RevokedToken`, migration `server/authn/migrations/0002_revokedtoken.py`.

JWT stateless bo'lgani uchun, oddiy holatda logout'dan keyin ham token amal qilaveradi (muddati tugagunicha). Buni hal qilish uchun **denylist** (bekor qilingan tokenlar ro'yxati) ishlatiladi.

```python
class RevokedToken(models.Model):
    class TokenType(models.TextChoices):
        ACCESS = "access", "Access"
        REFRESH = "refresh", "Refresh"

    jti = models.CharField(max_length=255, unique=True)   # JWT ID
    token_type = models.CharField(max_length=32, choices=TokenType.choices)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    # indexes: expires_at, token_type
```

Asosiy metodlar:

| Metod | Vazifasi |
|-------|----------|
| `is_revoked(token)` | Tokenning `jti`'si jadvalda bormi tekshiradi. `jti` bo'lmasa `False`. |
| `revoke(token, token_type)` | Tokenning `jti` va `exp`'ini olib, denylist'ga `get_or_create` bilan yozadi. `jti` yoki `exp` yo'q bo'lsa hech narsa qilmaydi. |
| `_exp_to_dt(exp)` | UNIX timestamp'ni UTC `datetime`'ga aylantiradi. |

`expires_at` saqlanishining sababi: token muddati tugagach uni denylist'dan o'chirib tashlash mumkin (8-bo'limdagi `cleanup_tokens` komandasi). Aks holda jadval cheksiz o'sib ketardi.

> Diqqat: bu `RevokedToken` modeli SimpleJWT'ning o'z `token_blacklist` ilovasidan **alohida** — loyiha denylist'ni shu custom model orqali boshqaradi.

---

## 5. Login / Refresh / Logout / Me oqimlari

Manba: `server/authn/views.py`, URL'lar: `server/crm_server/urls.py` (`/api/v1/auth/...`).

| Endpoint | View | Permission | Throttle |
|----------|------|-----------|----------|
| `POST /api/v1/auth/login` | `LoginView` | `AllowAny` | `LoginRateThrottle` (10/daqiqa) |
| `POST /api/v1/auth/refresh` | `RefreshView` | `AllowAny` | (default) |
| `POST /api/v1/auth/logout` | `LogoutView` | `IsAuthenticated` | (default) |
| `GET /api/v1/auth/me` | `MeView` | `IsAuthenticated` | (default) |

Cookie o'rnatish/tozalash uchun ikki yordamchi funksiya bor: `_set_cookie()` (HttpOnly, env'dan secure/samesite/domain) va `_clear_cookie()` (qiymatni bo'sh qilib, muddatni o'tmishga qo'yib o'chiradi).

### 5.1 Login (`LoginView`)

`LoginSerializer` (`server/authn/serializers.py`) email/parol qabul qiladi va `django.contrib.auth.authenticate()` bilan tekshiradi. Foydalanuvchi topilmasa **yoki `is_active=False` bo'lsa** — `"Invalid credentials."` (ataylab umumiy xabar, foydalanuvchi mavjudligini oshkor qilmaslik uchun).

Muvaffaqiyatda:
- `RefreshToken.for_user(user)` orqali refresh va undan access token yaratiladi.
- Javob body'sida `{user, access, refresh}` qaytariladi (dashboard buni localStorage'ga saqlaydi).
- Access va refresh tokenlar **HttpOnly cookie** sifatida ham o'rnatiladi.
- Audit log yoziladi (`action="login"`, `actor_type="user"`).

```
Dashboard                         LoginView                    DB / Audit
   │  POST /auth/login                │                            │
   │  {email, password}               │                            │
   │─────────────────────────────────▶│                            │
   │                                  │ authenticate(email, pwd)   │
   │                                  │───────────────────────────▶│
   │                                  │   user (active) yoki None  │
   │                                  │◀───────────────────────────│
   │                       None/inactive → 400 "Invalid credentials."
   │                                  │ RefreshToken.for_user()    │
   │                                  │ log_audit(login)           │
   │                                  │───────────────────────────▶│
   │  200 {user, access, refresh}     │                            │
   │  Set-Cookie: access_token,       │                            │
   │             refresh_token        │                            │
   │◀─────────────────────────────────│                            │
```

**Rate limiting:** `LoginRateThrottle` (`server/common/throttles.py`) — `AnonRateThrottle` voris, `scope="login"`, rate `10/minute` (`DEFAULT_THROTTLE_RATES`). Bu parol bilan brute-force urinishlarini cheklaydi. Limitdan oshilsa 429 qaytadi.

### 5.2 Refresh (`RefreshView`)

Yangi access token oladi. Refresh token **faqat cookie'dan** olinadi (body'dan emas):

```python
raw_refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
if not raw_refresh:
    raise APIError("NOT_AUTHENTICATED", "Refresh token missing.", 401)
refresh = RefreshToken(raw_refresh)                 # yaroqsiz bo'lsa → InvalidToken
if RevokedToken.is_revoked(refresh):                # denylist tekshiruvi
    raise InvalidToken("Refresh token has been revoked.")
access_token = refresh.access_token                 # yangi access
```

Yangi access token body'da qaytariladi **va** `access_token` cookie yangilanadi. `ROTATE_REFRESH_TOKENS=False` bo'lgani uchun **refresh token o'zgarmaydi**.

```
Dashboard                         RefreshView
   │  POST /auth/refresh              │
   │  (Cookie: refresh_token)         │
   │─────────────────────────────────▶│
   │                       cookie yo'q → 401 NOT_AUTHENTICATED
   │                       yaroqsiz   → 401 InvalidToken
   │                       revoked    → 401 InvalidToken
   │                                  │ refresh.access_token
   │  200 {access}                    │
   │  Set-Cookie: access_token        │
   │◀─────────────────────────────────│
```

Dashboard mantig'i (`apiFetch`) odatda 401 olganda avtomatik `refresh` chaqirib, so'rovni qayta urinadi (batafsil `09-dashboard.md`).

### 5.3 Logout (`LogoutView`)

`IsAuthenticated` talab qilinadi. Ham refresh, ham access tokenni denylist'ga qo'shadi (`jti` revoke), keyin ikkala cookie'ni tozalaydi:

```python
raw_refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
if raw_refresh:
    try: RevokedToken.revoke(RefreshToken(raw_refresh), RevokedToken.TokenType.REFRESH)
    except Exception: pass            # yaroqsiz token logout'ni buzmaydi
raw_access = request.COOKIES.get(settings.ACCESS_COOKIE_NAME)
if raw_access:
    try: RevokedToken.revoke(AccessToken(raw_access), RevokedToken.TokenType.ACCESS)
    except Exception: pass
# cookie'larni tozalash + audit log (action="logout")
```

Token parse qilinmasa ham (`except: pass`) logout baribir muvaffaqiyatli yakunlanadi — cookie'lar tozalanadi va `{success: True}` qaytadi. Audit log yoziladi.

```
Dashboard                         LogoutView                   RevokedToken
   │  POST /auth/logout               │                            │
   │  (Cookies: access, refresh)      │                            │
   │─────────────────────────────────▶│                            │
   │                                  │ revoke(refresh jti)        │
   │                                  │───────────────────────────▶│
   │                                  │ revoke(access jti)         │
   │                                  │───────────────────────────▶│
   │                                  │ log_audit(logout)          │
   │  200 {success: true}             │                            │
   │  Set-Cookie: (bo'sh, eskirgan)   │                            │
   │◀─────────────────────────────────│                            │
```

Endi bu revoke qilingan tokenlar `get_validated_token()` orqali rad etiladi (3.2-bo'lim).

### 5.4 Me (`MeView`)

Joriy foydalanuvchi ma'lumotini qaytaradi (`get_object` → `self.request.user`). `UserSerializer` quyidagi maydonlarni beradi: `id, email, role, first_name, last_name, full_name`. `IsAuthenticated` talab qilinadi. `APIError` istisnolari `build_error_response` orqali standart envelope formatda qaytariladi.

---

## 6. Rollar va permission klasslari

Manba: `server/common/permissions.py`. Default permission — `IsAuthenticated` (`settings.py`).

| Klass | Mantiq | Qayerda ishlatiladi |
|-------|--------|---------------------|
| `IsAdminUserRole` | Faqat autentifikatsiyalangan **va** `role == admin` ruxsat. | Roster import (`server/bot2/views.py:184`). |
| `IsViewerOrAdminReadOnly` | SAFE_METHODS (GET/HEAD/OPTIONS) — har qanday autentifikatsiyalangan user. Yozish (POST/PUT/PATCH/DELETE) — faqat `admin`. | Bot2 viewset'lar, analytics endpointlar. |
| `IsAdminCatalogWriter` | Mantiqan `IsViewerOrAdminReadOnly` bilan bir xil: o'qish — hamma, yozish — faqat `admin`. | Catalog viewset'lar (`server/catalog/views.py`). |
| `ServiceTokenPermission` | JWT'siz: `view.service_name`'ni olib, `verify_service_token()` chaqiradi. | Service token'li endpointlar (qarang 7-bo'lim). |

Diqqat: bu permission klasslarining barchasi **`request.user.role`** ga qaraydi, `is_staff`/`is_superuser`'ga emas (1.1-bo'limga qarang). Demak viewer foydalanuvchi superuser bo'lsa ham API'da yoza olmaydi.

```python
# IsViewerOrAdminReadOnly mantig'i (soddalashtirilgan)
if request.method in SAFE_METHODS:
    return request.user.is_authenticated            # o'qish: har qanday user
return request.user.is_authenticated and request.user.role == "admin"   # yozish: admin
```

Amaliy misol:
- **Viewer** so'rovnoma natijalarini ko'ra oladi (`GET /api/v1/bot2/surveys`), lekin o'zgartira olmaydi.
- **Admin** katalogga yangi dastur qo'sha oladi, roster import qila oladi, ma'lumotlarni tahrirlay oladi.

---

## 7. Service token (mashina-mashina autentifikatsiya)

Manba: `server/common/auth.py:verify_service_token`, model `server/common/models.py:ServiceToken`, settings `SERVICE_TOKENS`.

Bot 2 servisi JWT ishlatmaydi. U so'rovnoma natijasini yuborganda har so'rovda **`X-SERVICE-TOKEN`** header'ida tokenning **xom (raw)** qiymatini jo'natadi. Backend esa tokenni **hech qachon xom holda saqlamaydi** — faqat uning **SHA-256 hash**'ini saqlaydi va kelgan token hash'ini solishtiradi.

```python
# server/common/auth.py
def _hashed(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
```

### 7.1 `verify_service_token()` oqimi

```python
def verify_service_token(raw_token, service_name=None) -> None:
    if not raw_token:
        raise APIError("SERVICE_TOKEN_REQUIRED", "X-SERVICE-TOKEN header is required.", 403)
    incoming_hash = _hashed(raw_token)

    # 1) Avval DB'dagi ServiceToken'lar bilan tekshir
    try:
        if _verify_db_token(incoming_hash, service_name):
            return
    except Exception:
        pass                       # DB ishlamasa (masalan, testda) — settings'ga o't

    # 2) Fallback: settings.SERVICE_TOKENS dagi hash'lar
    hashes = [...]                 # service_name bo'yicha yoki barchasi
    if not hashes:
        raise exceptions.PermissionDenied("Service tokens are not configured.")
    for expected in hashes:
        if expected and hmac.compare_digest(incoming_hash, expected):  # constant-time
            return
    raise APIError("SERVICE_TOKEN_INVALID", "Invalid service token.", 403)
```

`_verify_db_token()` quyidagi shartlar bilan `ServiceToken`'ni qidiradi:
- `token_hash == incoming_hash`
- `is_active == True`
- `expires_at` `NULL` **yoki** kelajakda (hali tugamagan)
- agar `service_name` berilgan bo'lsa — shu xizmat nomi
- bir nechta mos kelsa, eng yangisi (`-created_at`) olinadi.

Topilsa, `last_used_at` yangilanadi (lekin **eng ko'pi bilan daqiqada bir marta** — har so'rovda DB yozuvini oldini olish uchun: `last_used_at` 60 soniyadan oshgan bo'lsagina update qilinadi).

**Constant-time taqqoslash:** `hmac.compare_digest` ataylab ishlatilgan — oddiy `==` o'rniga. Bu taqqoslash vaqtidagi farq orqali tokenni topishga urinadigan **timing attack**'lardan himoya qiladi (DB qidiruvi noyob index bo'yicha bo'lgani uchun u allaqachon constant-time'ga yaqin).

### 7.2 `ServiceToken` modeli

```python
# server/common/models.py
class ServiceToken(BaseModel):          # UUID PK + created_at/updated_at
    class Service(TextChoices):
        BOT2 = "bot2"; DASHBOARD = "dashboard"; OTHER = "other"
    service_name = CharField(choices=Service.choices)
    token_hash = CharField(max_length=64, unique=True)   # SHA-256 hex (64 belgi)
    scope = CharField(default="default")
    expires_at = DateTimeField(null=True, blank=True)    # NULL = abadiy
    last_used_at = DateTimeField(null=True, blank=True)
    is_active = BooleanField(default=True)
    notes = CharField(blank=True)
    # constraint: (service_name, scope) bo'yicha faqat bitta aktiv token bo'lishi mumkin
```

`active_service_scope_unique` constraint'i: bir xil `service_name` + `scope` uchun bir vaqtning o'zida faqat bitta **aktiv** token bo'la oladi (yangi token chiqarib eskisini `is_active=False` qilib bekor qilish modeli).

### 7.3 Settings fallback

```python
# server/crm_server/settings.py
SERVICE_TOKENS = {
    "bot2": os.getenv("SERVICE_TOKEN_BOT2_HASH", ""),
}
```

DB'da token topilmasa (yoki DB mavjud bo'lmasa), backend bu env'dagi hash bilan solishtiradi. Bu, masalan, dastlabki o'rnatishda yoki test muhitida ishlaydi. CORS uchun `x-service-token` header'i ham ruxsat etilgan (`CORS_ALLOW_HEADERS`).

### 7.4 Qayerda ishlatiladi

Hozir service token faqat bitta joyda to'g'ridan-to'g'ri chaqiriladi:

```python
# server/bot2/views.py:233 — submit_survey (@permission_classes([]))
verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot2")
```

`submit_survey` JWT permission'siz (`@permission_classes([])`), tekshiruv qo'lda funksiya ichida bajariladi. `ServiceTokenPermission` klassi (`server/common/permissions.py`) ham mavjud — u view'ning `service_name` atributini o'qib bir xil tekshiruvni amalga oshiradi, lekin asosiy oqimda funksiya to'g'ridan-to'g'ri chaqirilmoqda.

### 7.5 Bot ↔ backend xulosa diagrammasi

```
Bot 2 (.env: SERVICE_TOKEN=<raw>)            Backend (DB: token_hash / ENV: SERVICE_TOKEN_BOT2_HASH)
        │                                              │
        │  POST /api/v1/bot2/surveys/submit            │
        │  X-SERVICE-TOKEN: <raw>                       │
        │──────────────────────────────────────────────▶│
        │                                  header bo'sh → 403 SERVICE_TOKEN_REQUIRED
        │                                  incoming = sha256(raw)
        │                                  DB ServiceToken (active, mos, tugamagan)?
        │                                     ha → OK (last_used_at yangilanadi)
        │                                     yo'q → settings.SERVICE_TOKENS bilan
        │                                            hmac.compare_digest
        │                                                 mos → OK
        │                                                 mos emas → 403 SERVICE_TOKEN_INVALID
        │  200 (so'rovnoma saqlandi) yoki 403            │
        │◀──────────────────────────────────────────────│
```

| Holat | Javob | Xato kodi |
|-------|-------|-----------|
| Header umuman yo'q | 403 | `SERVICE_TOKEN_REQUIRED` |
| Hash mos kelmadi | 403 | `SERVICE_TOKEN_INVALID` |
| Settings'da token sozlanmagan va DB'da yo'q | 403 (PermissionDenied) | `FORBIDDEN` |
| To'g'ri token | davom etadi | — |

---

## 8. Boshqaruv komandalari

Manba: `server/authn/management/commands/`.

### 8.1 `create_admin`

`create_admin.py` — email/parol bilan admin foydalanuvchi yaratadi. Email allaqachon mavjud bo'lsa `CommandError` ko'tariladi. Yaratilgan user: `role=ADMIN`, `is_staff=True` (lekin `is_superuser` o'rnatilmaydi — ya'ni Django admin'ga kira oladi, ammo superuser emas).

```bash
python manage.py create_admin --email admin@ttpu.uz --password "MahfiyParol123"
```

> `create_superuser` (Django'ning standart komandasi) esa `is_staff=True`, `is_superuser=True`, `role=ADMIN` qiladi (1.2-bo'lim). To'liq superuser kerak bo'lsa o'shani ishlating.

### 8.2 `cleanup_tokens`

`cleanup_tokens.py` — denylist'dagi **muddati tugagan** `RevokedToken` yozuvlarini o'chiradi:

```python
deleted_count, _ = RevokedToken.objects.filter(expires_at__lt=timezone.now()).delete()
```

```bash
python manage.py cleanup_tokens
# Chiqish: "Deleted N expired revoked tokens."
```

Bu komanda jadval cheksiz o'sib ketishining oldini oladi: token muddati tugagach, uni denylist'da saqlash keraksiz (tugagan token allaqachon `exp` bo'yicha rad etiladi). Odatda cron/periodik vazifa orqali ishga tushiriladi (qarang `11-deploy-va-operatsiya.md`).

---

## 9. Django admin integratsiyasi

Manba: `server/authn/admin.py:UserAdmin`, `server/authn/apps.py`.

`UserAdmin` Django'ning `BaseUserAdmin`'ini email-login modeliga moslab qayta sozlaydi:
- `ordering`/`search_fields` — email bo'yicha.
- `list_display` — `email, role, is_staff, is_active`.
- `list_filter` — `role, is_staff, is_superuser, is_active`.
- `fieldsets` da `role` maydoni qo'shilgan, `username` umuman yo'q.
- `add_fieldsets` — yangi user yaratishda `email, role, password1, password2, is_staff, is_superuser` so'raladi.

App nomi `authn` (`AuthnConfig`, verbose: "Authentication"). `AUTH_USER_MODEL = "authn.User"`.

---

## 10. Xato javoblari formati

Manba: `server/common/exceptions.py`.

Barcha API xatolari yagona envelope formatda qaytadi (`custom_exception_handler` + `build_error_response`):

```json
{ "error": { "code": "SERVICE_TOKEN_INVALID", "message": "Invalid service token." } }
```

Autentifikatsiya bilan bog'liq asosiy kodlar:

| Holat | HTTP | `code` |
|-------|------|--------|
| Token yo'q yoki yaroqsiz (JWT) | 401 | `NOT_AUTHENTICATED` |
| Rol yetarli emas (yozishga viewer) | 403 | `FORBIDDEN` |
| Refresh token yo'q | 401 | `NOT_AUTHENTICATED` |
| Service token header yo'q | 403 | `SERVICE_TOKEN_REQUIRED` |
| Service token noto'g'ri | 403 | `SERVICE_TOKEN_INVALID` |
| Login throttle oshib ketdi | 429 | (throttled) |

`APIError` (`server/common/exceptions.py:APIError`) — kod, detail va status'ni moslashtirib tashlash uchun custom istisno klassi; `verify_service_token` va `RefreshView` aynan shuni ishlatadi.

---

## Tegishli hujjatlar

- [README.md](./README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](./01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](./02-backend-arxitekturasi.md) — Backend tuzilishi (common, sozlamalar, asosiy modellar)
- [05-bot2-backend.md](./05-bot2-backend.md) — So'rovnoma domeni va service token ishlatilishi (submit_survey)
- [06-analitika-va-audit.md](./06-analitika-va-audit.md) — Audit log (login/logout yozuvlari)
- [07-api-malumotnoma.md](./07-api-malumotnoma.md) — To'liq API ma'lumotnoma (auth endpointlari)
- [09-dashboard.md](./09-dashboard.md) — Dashboard JWT/cookie boshqaruvi va 401→refresh mantig'i
- [10-malumotlar-modeli.md](./10-malumotlar-modeli.md) — Ma'lumotlar modeli (User, RevokedToken, ServiceToken)
- [11-deploy-va-operatsiya.md](./11-deploy-va-operatsiya.md) — create_admin, cleanup_tokens, env sozlamalari
- [12-testlar.md](./12-testlar.md) — Autentifikatsiya testlari
- [13-ish-jarayonlari.md](./13-ish-jarayonlari.md) — End-to-end ish jarayonlari (login, so'rovnoma yuborish)
