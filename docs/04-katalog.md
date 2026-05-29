# Katalog (Catalog)

Bu hujjat TTPU CRM loyihasining **katalog** app'ini batafsil yoritadi. Katalog — butun
tizimning **tayanch ma'lumotnomasi** (reference data): dasturlar (program), yo'nalishlar
(direction), fanlar (subject), traklar (track), viloyatlar (region) va boshqa lug'at
elementlari shu yerda saqlanadi. Bot2 domeni (roster, student, enrollment) va analitika
funksiyalari shu katalog elementlariga `FK` orqali bog'lanadi, shuning uchun katalogni
to'g'ri tushunish loyihaning qolgan qismini tushunish uchun zarur.

Hujjat loyihaga yangi qo'shilgan dasturchi uchun mo'ljallangan. Bu yerda faqat **kodda
hozir mavjud** narsa hujjatlashtiriladi.

Asosiy fayllar:

| Fayl | Mazmuni |
|------|---------|
| `server/catalog/models.py` | `CatalogItem`, `CatalogRelation` modellari |
| `server/catalog/serializers.py` | Serializer'lar va validatsiya/kod-generatsiya mantiqi |
| `server/catalog/views.py` | `CatalogItemViewSet`, `CatalogRelationViewSet`, `ProgramViewSet` |
| `server/catalog/admin.py` | Django admin sozlamalari |
| `server/catalog/apps.py` | App config (`CatalogConfig`) |
| `server/catalog/management/commands/` | `seed_programs`, `seed_catalog`, `seed_polito_admissions` |
| `server/crm_server/urls.py` | URL router registratsiyasi |
| `server/sql-structure.sql` | Tarixiy/referens SQL sxema (catalog qismi) |

---

## 1. Umumiy g'oya: polimorf ma'lumotnoma

Klassik yondashuvda har bir lug'at uchun alohida jadval bo'lardi (`programs`,
`directions`, `regions` ...). TTPU CRM esa **bitta universal jadval** —
`catalog_items` — ishlatadi va elementning turini `type` ustuni orqali ajratadi
(bu pattern *single-table polymorphism* yoki *type discriminator* deb ataladi).

Afzalliklari:

- Yangi lug'at turi qo'shish uchun yangi migration/jadval kerak emas — `type` ga yangi
  qiymat qo'shilsa kifoya.
- Barcha lug'at elementlari uchun bitta CRUD endpoint (`/api/v1/catalog/items`).
- Ierarxiya (`parent` self-FK) va qo'shimcha maydonlar (`metadata` JSON) hamma turlar
  uchun bir xil ishlaydi.

Kamchiligi: turga xos qoidalar (masalan, faqat `program` uchun majburiy `metadata`
kalitlari) modelda emas, **serializer darajasida** tekshiriladi (pastga qarang).

---

## 2. `CatalogItem` modeli

Manba: `server/catalog/models.py:CatalogItem` (`common.models.BaseModel` dan meros oladi
— ya'ni `id` UUID primary key, `created_at`, `updated_at` maydonlari avtomatik bor).

### 2.1. Maydonlar

| Maydon | Tip | Tavsif |
|--------|-----|--------|
| `id` | `UUIDField` (pk) | `BaseModel` dan; `uuid4` default |
| `type` | `CharField(max_length=50, choices=ItemType.choices)` | Element turi (discriminator) |
| `code` | `CharField(max_length=100, null=True, blank=True)` | Ixtiyoriy ichki kod (masalan `B-IT-ME`) |
| `name` | `CharField(max_length=255)` | Asosiy nom (majburiy) |
| `name_uz` | `CharField(max_length=255, blank=True, default="")` | O'zbekcha nom |
| `name_ru` | `CharField(max_length=255, blank=True, default="")` | Ruscha nom |
| `name_en` | `CharField(max_length=255, blank=True, default="")` | Inglizcha nom |
| `parent` | `ForeignKey("self", null=True, blank=True, related_name="children", on_delete=SET_NULL)` | Ierarxiya (adjacency list) |
| `is_active` | `BooleanField(default=True)` | Faol/nofaol bayrog'i |
| `sort_order` | `IntegerField(default=0)` | Tartiblash uchun |
| `metadata` | `JSONField(default=dict, blank=True)` | Turga xos qo'shimcha maydonlar |
| `created_at` / `updated_at` | `DateTimeField` | `TimeStampedModel` dan (`auto_now_add` / `auto_now`) |

### 2.2. `type` — discriminator (ItemType)

`server/catalog/models.py:CatalogItem.ItemType` — `models.TextChoices`:

| Qiymat (DB) | Yorliq | Ma'nosi |
|-------------|--------|---------|
| `program` | Program | O'quv dasturi (bakalavr/magistr) |
| `direction` | Direction | Yo'nalish |
| `subject` | Subject | Fan (qabul imtihoni fani va h.k.) |
| `track` | Track | Trak (Italian / Uzbek) |
| `region` | Region | Viloyat/hudud |
| `other` | Other | Boshqa lug'at elementi |

### 2.3. `parent` — ierarxiya (adjacency list)

`parent` — `self`'ga `ForeignKey`, ya'ni element o'zining ota-elementiga ishora qiladi.
Bu **adjacency list** pattern: butun daraxt bitta jadvalda saqlanadi.

```
CatalogItem (program: "MECHANICAL ENGINEERING")
        ▲ parent
        │
CatalogItem (direction: "Mechanical Engineering")
```

`related_name="children"` — teskari tomondan `item.children.all()` orqali bolalarni olish
mumkin. `on_delete=models.SET_NULL` — ota-element o'chirilsa, bola elementning `parent` i
`NULL` bo'ladi (bola o'chmaydi).

> **Muhim:** Bu yerda ORM va SQL sxema farq qiladi — pastdagi 8-bo'limga qarang.

### 2.4. `metadata` — JSON kengaytirish

`metadata` (`JSONField`, default `dict`) — turga xos maydonlarni schema o'zgartirmasdan
saqlash uchun. Misollar (seed kodlaridan):

- `program` uchun: `{"level": "bachelor", "track": "italian", "language": "Italian/English", "duration_years": 4}`
- `direction` / `region` / `subject` / `track` uchun seed komandalar `metadata` ga
  `name_uz`/`name_ru`/`name_en` ni (ba'zan `diploma` ni) yozadi — chunki seed yozilgan
  paytda `name_uz/ru/en` ustunlari hali alohida saqlanmagan edi.

### 2.5. `Meta`: tartib, indekslar, cheklovlar

```python
class Meta:
    ordering = ("type", "sort_order", "name")
    indexes = [
        models.Index(fields=["type", "code"]),
        models.Index(fields=["type", "is_active"]),
    ]
    constraints = [
        models.UniqueConstraint(
            fields=["type", "code"],
            condition=~Q(code__isnull=True) & ~Q(code=""),
            name="catalog_item_type_code_unique_nonnull",
        ),
    ]
```

- **Tartib:** default qatorda `type → sort_order → name`.
- **Indekslar:** `(type, code)` va `(type, is_active)` — filtrlar tez ishlashi uchun.
- **Cheklov `catalog_item_type_code_unique_nonnull`:** bu **partial unique constraint**.
  `(type, code)` juftligi noyob bo'lishi shart, **lekin faqat** `code` `NULL` ham,
  bo'sh string `""` ham bo'lmaganda. Ya'ni:
  - `code` belgilangan bo'lsa — bir xil turdagi ikki element bir xil kodga ega bo'lolmaydi.
  - `code` bo'sh/`NULL` bo'lsa — istalgancha element bo'lishi mumkin (cheklov ishlamaydi).

> **Migration tarixi (kontekst uchun):** bu cheklov bir necha bor o'zgargan —
> `0002_type_safety_constraints` qo'shgan, `0004_..._unique_nonnull_and_more` qayta
> shakllantirgan, `0006_remove_overly_strict_code_constraint` esa `NULL`/bo'sh kodlar
> uchun juda qattiq bo'lgan variantni olib tashlab, hozirgi partial unique shaklga
> keltirgan. Yakuniy holat yuqorida ko'rsatilganidek.

### 2.6. `clean()` validatsiyasi haqida eslatma

Modelda **`clean()` metodi yo'q**. Turga xos barcha validatsiya (dastur metadata
kalitlari, kod noyobligi, kod avtogeneratsiyasi) `server/catalog/serializers.py`
ichida amalga oshiriladi (3-bo'limga qarang). Demak, bu qoidalar **REST API orqali**
ishlaydi; Django admin yoki to'g'ridan-to'g'ri ORM `save()` orqali yozilganda
serializer validatsiyasi chaqirilmaydi (faqat DB cheklovlari ishlaydi).

---

## 3. `CatalogRelation` modeli

Manba: `server/catalog/models.py:CatalogRelation`. Bu model ikkita katalog elementi
o'rtasidagi **ixtiyoriy bog'lanishni** ifodalaydi (parent self-FK dan farqli o'laroq,
ko'plab-ko'plabga (many-to-many) tipidagi va turli xil munosabatlarni saqlash uchun).

| Maydon | Tip | Tavsif |
|--------|-----|--------|
| `from_item` | `FK(CatalogItem, on_delete=CASCADE, related_name="outgoing_relations")` | Boshlang'ich element |
| `to_item` | `FK(CatalogItem, on_delete=CASCADE, related_name="incoming_relations")` | Maqsad element |
| `relation_type` | `CharField(max_length=100, choices=RelationType.choices, default=CUSTOM)` | Munosabat turi |

`RelationType` (`models.TextChoices`):

| Qiymat | Yorliq |
|--------|--------|
| `program_direction` | Program -> Direction |
| `program_track` | Program -> Track |
| `subject_prereq` | Subject prerequisite |
| `custom` | Custom (default) |

`Meta`:

```python
constraints = [
    models.UniqueConstraint(
        fields=["from_item", "to_item", "relation_type"],
        name="unique_catalog_relation",
    )
]
```

Ya'ni bir xil `(from_item, to_item, relation_type)` uchligi takrorlanmaydi.

> **Eslatma `on_delete=CASCADE`:** agar `from_item` yoki `to_item` o'chirilsa, unga bog'liq
> barcha relation'lar avtomatik o'chadi. Bu ORM xulqi SQL sxemadagi `ON DELETE RESTRICT`
> dan farq qiladi (8-bo'limga qarang).

---

## 4. Serializer'lar va validatsiya mantiqi

Manba: `server/catalog/serializers.py`.

### 4.1. Modul darajasidagi yordamchilar

**Dasturlar uchun ruxsat etilgan qiymatlar:**

```python
PROGRAM_LEVELS = {"bachelor", "master"}
PROGRAM_TRACKS = {"italian", "uzbek", "n/a"}
```

**`_validate_program_metadata(metadata)`** — `program` turidagi element uchun `metadata`
to'g'riligini tekshiradi:

- Majburiy kalitlar bo'lishi shart: `level`, `track`, `language`, `duration_years`.
  Yo'q bo'lsa → `Program metadata missing keys: ...`.
- `level` ∈ `{bachelor, master}` bo'lishi kerak, aks holda xato.
- `track` ∈ `{italian, uzbek, n/a}` bo'lishi kerak.
- `duration_years` musbat butun son (`int > 0`) bo'lishi kerak.
- `language` bo'sh bo'lmagan string bo'lishi kerak.

**`_auto_generate_code(item_type)`** — kod ko'rsatilmaganda avtomatik generatsiya:

```python
def _auto_generate_code(item_type: str) -> str:
    prefix = (item_type or "item").upper()
    result = CatalogItem.objects.filter(
        type=item_type, code__startswith=f"{prefix}-"
    ).aggregate(max_code=Max("code"))
    max_code = result["max_code"]
    max_num = 0
    if max_code:
        try:
            max_num = int(max_code.split("-")[-1])
        except (ValueError, IndexError):
            pass
    return f"{prefix}-{max_num + 1:03d}"
```

Mantiq: shu turdagi, `PREFIX-` bilan boshlanadigan eng katta kodni topadi, oxiridagi
raqamni oladi va `+1` qiladi, 3 xonali qilib formatlaydi. Masalan `type="region"` uchun:
agar `REGION-007` eng katta bo'lsa → yangi kod `REGION-008`.

> **Eslatma:** kod string sifatida `Max` orqali olinadi (leksikografik solishtirish), shu
> sababli mavjud kodlar `PREFIX-NNN` shaklida bir xil uzunlikda bo'lishi taxmin qilinadi.
> Seed komandalar `B-IT-ME`, `DIR-MECH-IT` kabi qo'l bilan yozilgan kodlardan
> foydalanadi — ular `_auto_generate_code` shablonidan farq qiladi va avtogeneratsiyaga
> ta'sir qilmaydi (ular `PREFIX-` namunasiga to'liq mos kelmaydi).

### 4.2. `CatalogItemSerializer`

```python
class CatalogItemSerializer(serializers.ModelSerializer):
    code = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    metadata = serializers.JSONField(required=False, default=dict)

    class Meta:
        model = CatalogItem
        fields = "__all__"
        validators = []   # avtomatik UniqueTogetherValidator o'chirilgan
```

Diqqatga sazovor jihatlar:

- `fields = "__all__"` — barcha model maydonlari (jumladan `name_uz/ru/en`,
  `metadata`, `parent`, `sort_order` va h.k.) serializerga kiradi.
- `validators = []` — DRF model cheklovidan avtomatik yaratadigan
  `UniqueTogetherValidator` ataylab **o'chirilgan**, chunki noyoblik `validate()`
  ichida qo'lda tekshiriladi (partial unique constraint'ni DRF to'g'ri qo'llay olmaydi).

**`validate(attrs)` mantiqi:**

1. `item_type` ni `attrs` dan yoki mavjud `instance` dan oladi.
2. `metadata` ni `attrs` dan yoki `instance` dan oladi (bo'sh bo'lsa `{}`).
3. Agar `type == program` **va** `metadata` bo'sh bo'lmasa → `_validate_program_metadata`
   chaqiriladi.
   > **Muhim nyuans:** dastur yaratilayotganda `metadata` umuman berilmasa (bo'sh
   > `{}`), program metadata validatsiyasi **o'tkazib yuboriladi**. Ya'ni metadata'siz
   > program yaratish mumkin.
4. Kod logikasi:
   - **Create paytida** (`self.instance` yo'q) va `code` bo'sh/`None` bo'lsa →
     `_auto_generate_code` orqali avtomatik kod beriladi.
   - Aks holda (`code` berilgan bo'lsa) → `(type, code)` noyobligi qo'lda tekshiriladi.
     Update bo'lsa o'zini (`exclude(pk=...)`) hisobdan chiqaradi. Mavjud bo'lsa:
     `{"code": "Bu turdagi element uchun '<code>' kodi allaqachon mavjud."}` xatosi.

### 4.3. `CatalogRelationSerializer`

Oddiy `ModelSerializer`, `fields = "__all__"`. Maxsus validatsiya yo'q — noyoblik DB
cheklovi (`unique_catalog_relation`) orqali ta'minlanadi.

### 4.4. `ProgramSerializer` — metadata'ni "tekislash"

Manba: `server/catalog/serializers.py:ProgramSerializer`. Bu **faqat o'qish uchun**
mo'ljallangan vakillik (representation) — `ProgramViewSet` da ishlatiladi. U dastur
`metadata` JSON ichidagi kalitlarni yuqori darajadagi maydonlar sifatida chiqaradi.

```python
class ProgramSerializer(serializers.ModelSerializer):
    level = serializers.SerializerMethodField()
    track = serializers.SerializerMethodField()
    language = serializers.SerializerMethodField()
    duration_years = serializers.SerializerMethodField()

    class Meta:
        model = CatalogItem
        fields = ("id", "code", "name", "is_active",
                  "level", "track", "language", "duration_years", "metadata")
```

Har bir `get_*` metodi `obj.metadata` dan tegishli kalitni o'qiydi (`_meta_value`
yordamchisi orqali, `metadata` bo'sh bo'lsa `None` qaytaradi).

Misol javob (response):

```json
{
  "id": "6f1c...uuid",
  "code": "B-IT-ME",
  "name": "MECHANICAL ENGINEERING",
  "is_active": true,
  "level": "bachelor",
  "track": "italian",
  "language": "Italian/English",
  "duration_years": 4,
  "metadata": {
    "level": "bachelor",
    "track": "italian",
    "language": "Italian/English",
    "duration_years": 4
  }
}
```

> **Diqqat (hujjatlash eslatmasi):** `ProgramSerializer` `fields` ro'yxatida
> `name_uz`/`name_ru`/`name_en` **yo'q**. Demak, ushbu uchta ko'p tilli nom maydonlari
> DB da saqlansa-da, `/api/v1/catalog/programs` endpointida **ko'rsatilmaydi**. Ko'p tilli
> nomlar kerak bo'lsa, `CatalogItemSerializer` (`/api/v1/catalog/items?type=program`)
> dan foydalaniladi, u barcha maydonlarni qaytaradi.

---

## 5. API endpointlari

URL'lar `server/crm_server/urls.py` da `DefaultRouter` orqali ro'yxatdan o'tkazilgan va
hammasi `/api/v1/` префiksi ostida:

| Router prefiks | ViewSet | basename |
|----------------|---------|----------|
| `catalog/items` | `CatalogItemViewSet` | `catalog-item` |
| `catalog/relations` | `CatalogRelationViewSet` | `catalog-relation` |
| `catalog/programs` | `ProgramViewSet` | `catalog-program` |

To'liq yo'llar (DRF `DefaultRouter` standart):

```
GET    /api/v1/catalog/items
POST   /api/v1/catalog/items
GET    /api/v1/catalog/items/{id}
PUT    /api/v1/catalog/items/{id}
PATCH  /api/v1/catalog/items/{id}
DELETE /api/v1/catalog/items/{id}

GET    /api/v1/catalog/relations            (+ POST/GET-id/PUT/PATCH/DELETE)
GET    /api/v1/catalog/programs             (+ GET-id) — faqat o'qish
```

### 5.1. `CatalogItemViewSet` — to'liq CRUD

Manba: `server/catalog/views.py:CatalogItemViewSet` (`viewsets.ModelViewSet`).

- **Permission:** `IsAdminCatalogWriter` (`common/permissions.py`). `SAFE_METHODS`
  (GET/HEAD/OPTIONS) — har qanday autentifikatsiyalangan foydalanuvchiga ochiq;
  yozish (POST/PUT/PATCH/DELETE) — faqat `role == admin`.
- **Filter backend'lar:** `SearchFilter`, `OrderingFilter`.
  - `search_fields = ["name", "code"]` → `?search=mech`
  - `ordering_fields = ["sort_order", "name", "type"]` → `?ordering=name` yoki `?ordering=-sort_order`
- **Maxsus `get_queryset` filtrlari:**

```python
def get_queryset(self):
    qs = super().get_queryset()
    item_type = self.request.query_params.get("type")
    is_active = self.request.query_params.get("is_active")
    if item_type:
        qs = qs.filter(type=item_type)
    if is_active in ("true", "false"):
        qs = qs.filter(is_active=is_active == "true")
    return qs
```

  - `?type=program` — turi bo'yicha filtr.
  - `?is_active=true` / `?is_active=false` — faollik bo'yicha filtr (boshqa qiymatlar
    e'tiborsiz qoldiriladi).

- **`create()` override — `IntegrityError → 400`:** agar serializer validatsiyasini
  chetlab o'tib (race condition yoki bevosita) DB unique cheklovi buzilsa, 500 emas,
  400 qaytadi:

```python
def create(self, request, *args, **kwargs):
    try:
        return super().create(request, *args, **kwargs)
    except IntegrityError:
        return Response(
            {"detail": "Bu turdagi element uchun bunday kod allaqachon mavjud.",
             "code": ["Unique constraint violated."]},
            status=status.HTTP_400_BAD_REQUEST,
        )
```

- **Audit:** `perform_create` / `perform_update` / `perform_destroy` har bir o'zgarishni
  `audit.utils.log_audit` orqali audit log'ga yozadi (`before_data` / `after_data`
  serializer ma'lumotlari bilan). Batafsil: `06-analitika-va-audit.md`.

**Misol — yangi viloyat yaratish:**

```bash
curl -X POST https://api.example.com/api/v1/catalog/items \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"type": "region", "name": "Yangi viloyat", "name_uz": "Yangi viloyat"}'
```

`code` berilmagani uchun avtomatik `REGION-NNN` generatsiya qilinadi.

### 5.2. `CatalogRelationViewSet` — to'liq CRUD

Manba: `server/catalog/views.py:CatalogRelationViewSet` (`ModelViewSet`).

- **Permission:** `IsAdminCatalogWriter` (o'qish — auth, yozish — admin).
- **Filter:** `SearchFilter`,
  `search_fields = ["relation_type", "from_item__name", "to_item__name"]`.
- **Audit:** `CatalogItemViewSet` kabi har bir CUD operatsiyasi audit'ga yoziladi.

### 5.3. `ProgramViewSet` — faqat o'qish

Manba: `server/catalog/views.py:ProgramViewSet` (`viewsets.ReadOnlyModelViewSet` —
faqat `list` va `retrieve`).

- **Serializer:** `ProgramSerializer` (metadata'ni tekislaydi, 4.4-bo'lim).
- **Permission:** `IsViewerOrAdminReadOnly` — o'qish har qanday autentifikatsiyalangan
  foydalanuvchiga; yozish admin'ga (lekin read-only viewset bo'lgani uchun yozish baribir
  yo'q).
- **Filter:** `SearchFilter` (`name`, `code`), `OrderingFilter`
  (`sort_order`, `name`, `code`).
- **`get_queryset` — `type=program` qattiq filtri + metadata so'rovi:**

```python
def get_queryset(self):
    qs = CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM)
    level = self.request.query_params.get("level")
    track = self.request.query_params.get("track")
    if level:
        qs = qs.filter(metadata__level=level)
    if track:
        qs = qs.filter(metadata__track=track)
    return qs
```

  - Faqat `type == program` elementlar qaytadi.
  - `?level=bachelor` — JSON `metadata.level` bo'yicha filtr (`metadata__level` lookup).
  - `?track=italian` — `metadata.track` bo'yicha filtr.

**Misol:**

```bash
GET /api/v1/catalog/programs?level=master&ordering=name
GET /api/v1/catalog/programs?track=italian
```

---

## 6. Seed (boshlang'ich ma'lumot) komandalar

Katalog uchun uchta Django management command bor. Hammasi **idempotent**
(`update_or_create` ishlatadi — qayta-qayta ishlatsa dublikat yaratmaydi) va
`@transaction.atomic` ostida ishlaydi.

| Komanda | Fayl | Nima seed qiladi |
|---------|------|------------------|
| `seed_programs` | `management/commands/seed_programs.py` | 13 ta dastur (`type=program`) |
| `seed_catalog` | `management/commands/seed_catalog.py` | 8 ta yo'nalish (`direction`) + 14 ta hudud (`region`) |
| `seed_polito_admissions` | `management/commands/seed_polito_admissions.py` | 2 ta trak (`track`) + 8 ta fan (`subject`) |

Ishga tushirish:

```bash
python manage.py seed_programs
python manage.py seed_catalog
python manage.py seed_polito_admissions
```

Har bir komandada `--deactivate-missing` flagi bor: seed ro'yxatida bo'lmagan, lekin DB
da mavjud elementlarni o'chirmasdan `is_active=False` ga o'tkazadi (soft-deactivate):

```bash
python manage.py seed_programs --deactivate-missing
```

### 6.1. `seed_programs` — dasturlar

`PROGRAMS` ro'yxati 13 ta dasturni o'z ichiga oladi:

- **Bakalavr (italian track), 4 yil:** `B-IT-COMPE`, `B-IT-ME`, `B-IT-IMT`, `B-IT-ICEA`,
  `B-IT-AE`, `B-IT-AS`.
- **Bakalavr (uzbek track), 4 yil:** `B-UZ-SE`, `B-UZ-AD`, `B-UZ-BM`.
- **Magistr (`track="n/a"`), 2 yil:** `M-MECH`, `M-ICE`, `M-RCHM`, `M-MBA`.

Har bir dastur uchun `metadata` ga `level`, `track`, `language`, `duration_years`
yoziladi — bu aynan `ProgramSerializer` ko'rsatadigan va `_validate_program_metadata`
tekshiradigan kalitlar.

```python
CatalogItem.objects.update_or_create(
    type=CatalogItem.ItemType.PROGRAM,
    code=program["code"],
    defaults={
        "name": program["name"],
        "is_active": True,
        "sort_order": sort_map[program["code"]],
        "metadata": {
            "level": program["level"],
            "track": program["track"],
            "language": program["language"],
            "duration_years": program["duration_years"],
        },
    },
)
```

### 6.2. `seed_catalog` — yo'nalish va hududlar

- **`DIRECTIONS`** (8 ta): `name` sifatida inglizcha nom yoziladi, `metadata` ga
  `name_uz`/`name_ru`/`name_en` va `diploma` (`italian`/`uzbek`) saqlanadi. Kodlar:
  `DIR-MECH-IT`, `DIR-COMP-IT`, `DIR-CIVIL-IT`, `DIR-PROD-UZ`, `DIR-SOFT-UZ`,
  `DIR-AUTO-UZ`, `DIR-ARCH-UZ`, `DIR-AVIA-UZ`.
- **`REGIONS`** (14 ta): 12 viloyat + Toshkent shahri + Qoraqalpog'iston Respublikasi.
  Kodlar `REG-...` namunasida (masalan `REG-TASHCITY`, `REG-SAMARKAND`,
  `REG-KARAKALPAK`). `metadata` ga `name_uz`/`name_ru`/`name_en`.

> **Eslatma:** seed kodlari ko'p tilli nomlarni hozircha `metadata` ichiga yozadi
> (`name_uz` ustuni emas), chunki ushbu seed'lar `0005_add_multilingual_name_fields`
> migrationidan oldin yozilgan mantiqqa amal qiladi. Modelda alohida `name_uz/ru/en`
> ustunlari bor, lekin seed ularni to'ldirmaydi.

### 6.3. `seed_polito_admissions` — traklar va qabul fanlari

- **`POLITO_TRACKS`** (2 ta): `TRACK-ITALIAN`, `TRACK-UZBEK`.
- **`ADMISSIONS_SUBJECTS`** (8 ta): `SUBJ-MATH`, `SUBJ-PHYSICS`, `SUBJ-CHEMISTRY`,
  `SUBJ-BIOLOGY`, `SUBJ-INFORMATICS`, `SUBJ-ENGLISH`, `SUBJ-RUSSIAN`, `SUBJ-HISTORY`.

Ikkala holatda ham `name` (inglizcha) + `metadata.name_uz/ru/en`.

---

## 7. Django admin

Manba: `server/catalog/admin.py`.

```python
@admin.register(CatalogItem)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "code", "is_active", "sort_order", "parent")
    list_filter = ("type", "is_active")
    search_fields = ("name", "code")
    ordering = ("type", "sort_order", "name")
    autocomplete_fields = ("parent",)
    readonly_fields = ("id", "created_at", "updated_at")
```

- Ro'yxatda nom, tur, kod, faollik, tartib, ota-element ko'rinadi.
- `type` va `is_active` bo'yicha filtr paneli; nom/kod bo'yicha qidiruv.
- `parent` — autocomplete (katta katalogda qulay).

```python
@admin.register(CatalogRelation)
class CatalogRelationAdmin(admin.ModelAdmin):
    list_display = ("from_item", "to_item", "relation_type", "created_at")
    search_fields = ("from_item__name", "to_item__name", "relation_type")
    autocomplete_fields = ("from_item", "to_item")
    readonly_fields = ("id", "created_at", "updated_at")
```

> **Eslatma:** admin orqali yaratish/tahrirlashda serializer validatsiyasi
> (`_validate_program_metadata`, kod avtogeneratsiyasi, qo'lda noyoblik tekshiruvi)
> **ishlamaydi** — faqat DB cheklovlari kuchda bo'ladi (2.6-bo'limga qarang).

App konfiguratsiyasi: `server/catalog/apps.py:CatalogConfig`
(`name = "catalog"`, `verbose_name = "Catalog"`, `default_auto_field = BigAutoField`).

---

## 8. ORM va `sql-structure.sql` farqlari

Repozitoriydagi `server/sql-structure.sql` — loyihaning **tarixiy/referens** to'liq SQL
sxemasi (1-qatorda "FULL SCHEMA", "Bot1 + Bot2" deb yozilgan). Haqiqiy DB strukturasi
Django migration'lar orqali yaratiladi, shuning uchun ba'zi joylarda SQL fayl ORM dan
farq qiladi. **Haqiqat — bu ORM (modellar + migration'lar).** Asosiy farqlar:

| Jihat | ORM (`models.py`) | `sql-structure.sql` |
|-------|-------------------|---------------------|
| `catalog_items.parent_id` o'chirish xulqi | `on_delete=models.SET_NULL` | `ON DELETE RESTRICT` |
| `catalog_relations.from_item/to_item` | `on_delete=models.CASCADE` | `ON DELETE RESTRICT` |
| `(type, code)` noyoblik | **Partial** unique (`code` NOT NULL va NOT '' bo'lganda) | `UNIQUE (type, code)` — oddiy unique |
| `name_uz/ru/en` ustunlari | Modelda mavjud (`0005_add_multilingual_name_fields`) | SQL faylda yo'q (eski sxema) |
| `id` default | `uuid.uuid4` (Django darajasida) | `gen_random_uuid()` (Postgres `pgcrypto`) |
| `updated_at` yangilash | Django `auto_now` | `set_updated_at()` trigger |

SQL fayldagi catalog qismi (referens):

```sql
CREATE TYPE catalog_type AS ENUM
  ('program', 'direction', 'subject', 'track', 'region', 'other');

CREATE TABLE IF NOT EXISTS catalog_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type       catalog_type NOT NULL,
  code       TEXT,
  name       TEXT NOT NULL,
  parent_id  UUID REFERENCES catalog_items(id) ON DELETE RESTRICT,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ...
  CONSTRAINT uq_catalog_type_code UNIQUE (type, code)
);
```

Boshqa domen jadvallari (`bot2_*`, analitika view'lari) ham `catalog_items(id)` ga
`ON DELETE RESTRICT` bilan ishora qiladi — ya'ni SQL sxemada katalog elementi unga bog'liq
yozuv bo'lsa o'chirilmaydi. ORM darajasida bu bog'lanishlarning aniq xulqi tegishli
domen modellarida (Bot2) belgilanadi — `05-bot2-backend.md` ga qarang.

---

## 9. Tipik ish jarayoni (qisqacha)

```
1. Dasturchi/devops:  python manage.py seed_programs / seed_catalog / seed_polito_admissions
        │                (catalog_items boshlang'ich ma'lumot bilan to'ladi)
        ▼
2. Admin (dashboard):  POST /api/v1/catalog/items   → yangi element (kod avto, validatsiya)
        │              GET  /api/v1/catalog/items?type=region&is_active=true
        ▼
3. Bot2 domeni:        Student/roster yozuvlari catalog_items ga FK orqali bog'lanadi
        ▼
4. Frontend/analitika: GET /api/v1/catalog/programs?level=bachelor  → tozalangan dastur ro'yxati
```

Har bir CUD operatsiyasi audit log'ga tushadi (`log_audit`).

---

## Tegishli hujjatlar

- [README.md](README.md) — Hujjatlar indeksi
- [01-umumiy-korinish.md](01-umumiy-korinish.md) — Umumiy ko'rinish va arxitektura
- [02-backend-arxitekturasi.md](02-backend-arxitekturasi.md) — Backend tuzilishi (common, `BaseModel`, sozlamalar)
- [03-autentifikatsiya.md](03-autentifikatsiya.md) — User, JWT, rollar, permission'lar (`IsAdminCatalogWriter`, `IsViewerOrAdminReadOnly`)
- [05-bot2-backend.md](05-bot2-backend.md) — So'rovnoma domeni: katalogga FK bilan bog'lanadi
- [06-analitika-va-audit.md](06-analitika-va-audit.md) — `log_audit` va analitika
- [07-api-malumotnoma.md](07-api-malumotnoma.md) — To'liq API ma'lumotnoma
- [09-dashboard.md](09-dashboard.md) — Katalogni boshqaruvchi dashboard
- [10-malumotlar-modeli.md](10-malumotlar-modeli.md) — Ma'lumotlar modeli / ER diagramma
- [11-deploy-va-operatsiya.md](11-deploy-va-operatsiya.md) — Seed komandalarini ishga tushirish
- [13-ish-jarayonlari.md](13-ish-jarayonlari.md) — End-to-end ish jarayonlari
