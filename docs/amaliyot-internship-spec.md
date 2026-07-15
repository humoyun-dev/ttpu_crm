# Amaliyot (Internship) moduli — spec

> Talaba botda "qayerda amaliyot o'tmoqchisiz?" arizasini yuboradi — kompaniyani reestrdan
> tanlaydi yoki o'zi yozadi. Xodim ko'rib chiqadi: tasdiqlaydi yoki rad etadi. Natija botga xabar
> qilinadi. Mustaqil modul (faqat yangi jadval) — eski datага tegmaydi, 🟢 xavfsiz faza.

---

## 1. Model

```python
# internships/models.py
class InternshipRequest(BaseModel):
    class Status(models.TextChoices):
        PENDING  = "pending"    # ko'rib chiqilmoqda (boshlang'ich)
        APPROVED = "approved"   # tasdiqlandi
        REJECTED = "rejected"   # rad etildi

    student       = models.ForeignKey("bot2.Bot2Student", on_delete=models.CASCADE,
                                       related_name="internship_requests")
    employer      = models.ForeignKey("employers.Employer", null=True, blank=True,
                                       on_delete=models.SET_NULL, related_name="+")   # reestrdan tanlansa
    company_name  = models.CharField(max_length=255)   # har doim to'ldiriladi (reestrdan yoki qo'lda)
    note          = models.TextField(blank=True)        # talabaning ixtiyoriy izohi
    status        = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    staff_comment = models.TextField(blank=True)        # rad/tasdiq sababi
    reviewed_by   = models.ForeignKey("authn.User", null=True, on_delete=models.SET_NULL, related_name="+")
    reviewed_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            # bitta talabada bir vaqtda faqat bitta PENDING ariza
            models.UniqueConstraint(
                fields=["student"], condition=models.Q(status="pending"),
                name="uq_one_pending_internship_per_student",
            )
        ]
```

`employer` va `company_name` birga: agar talaba reestrdan tansa — ikkalasi ham to'ladi (`company_name` = employer.name, snapshot sifatida); o'zi yozsa — faqat `company_name`, `employer=null`.

---

## 2. Logika

### 2.1. Ariza berish qoidasi

- Bitta talabada bir vaqtda **faqat bitta faol (`pending`) ariza** bo'lishi mumkin (DB darajasida constraint bilan qat'iy).
- Ariza **tasdiqlansa yoki rad etilsa** — talaba **yangi ariza bera oladi** (boshqa yoki xuddi shu kompaniyaga).
- Kompaniya tanlash: **ikkalasi ham** — reestrdan (`Employer`) tanlash yoki o'zi erkin matn kiritish.

### 2.2. Bot oqimi

```
Menyu → 🎓 Amaliyot
  -> "Qayerda amaliyot o'tmoqchisiz?"
     [ Ro'yxatdan tanlash ]   [ O'zim yozaman ]
     - Ro'yxatdan tanlash: Employer ro'yxati (paginatsiya) -> tanlaydi
     - O'zim yozaman: erkin matn kiritadi
  -> (ixtiyoriy) izoh so'raladi: "Qo'shimcha izoh bo'lsa yozing (yoki o'tkazib yuborish)"
  -> POST /api/bot/internship
  -> bot: "Arizangiz qabul qilindi, ko'rib chiqilmoqda."
```

Agar talabada allaqachon `pending` ariza bo'lsa, bot yangisini so'ramaydi:
`"Sizda ko'rib chiqilayotgan ariza bor: {company_name}. Natija kutilmoqda."`

### 2.3. Xodim ko'rigi (dashboard)

- Yangi arizalar `pending` holatda navbatda ko'rinadi.
- Xodim **tasdiqlaydi** yoki **rad etadi** (sabab bilan, ixtiyoriy).
- Qaror qilinganda `reviewed_by`, `reviewed_at` to'ladi va **talabaga avtomatik xabar** ketadi (follow-up bilan bir xil transport — `crm/telegram.py`).

### 2.4. Bot xabarlari (natija)

```
approved: "🎉 Amaliyot arizangiz tasdiqlandi! Kompaniya: {company_name}"
rejected: "Amaliyot arizangiz rad etildi. Sabab: {staff_comment}" (sabab bo'lmasa — sababsiz umumiy xabar)
```

---

## 3. Endpointlar

### Bot (service token)

```
POST  /api/bot/internship
req : { "telegram_id": 12345, "employer_id": "emp_...", "company_name": "Artel",
        "note": "Yozgi amaliyot" }
      // employer_id bo'lsa — reestrdan; bo'lmasa faqat company_name (erkin matn)
resp: { "id": "int_...", "status": "pending" }
      // agar allaqachon pending bor bo'lsa:
      { "error": "already_pending", "existing": { "id": "int_...", "company_name": "..." } }

GET   /api/bot/internship/status?telegram_id=12345
resp: { "has_pending": true, "company_name": "Artel", "status": "pending" }
      // menyuda "Amaliyot" bosilganda joriy holatni ko'rsatish uchun

GET   /api/bot/employers                     // reestrdan tanlash uchun ro'yxat
resp: [ { "id": "emp_...", "name": "Artel", "industry": "Ishlab chiqarish" }, ... ]
```

### Xodim (dashboard, JWT)

```
GET   /api/internships?status=pending
resp: [ { "id": "int_...", "student": "Diyora Karimova", "company_name": "Artel",
          "note": "...", "created_at": "2026-06-18T09:00:00Z" } ]

PATCH /api/internships/{id}
req : { "status": "approved" }
   yoki
req : { "status": "rejected", "staff_comment": "Kompaniya bilan aloqa yo'q" }
resp: { "id": "int_...", "status": "approved", "reviewed_at": "..." }   // → talabaga xabar ketadi
```

---

## 4. Qotirilgan qarorlar

- Bir vaqtda **bitta faol** (`pending`) ariza; DB-darajasidagi partial unique constraint bilan.
- Tasdiqlansa/rad etilsa — **yangi ariza berish mumkin**.
- Kompaniya: **reestrdan tanlash yoki erkin matn** — ikkalasi ham qo'llab-quvvatlanadi.
- Natija talabaga **avtomatik bot xabari** orqali yetadi (follow-up transporti bilan bir xil mexanizm).
- Modul mustaqil (faqat yangi jadval) — 🟢 xavfsiz faza, eski datага tegmaydi.
