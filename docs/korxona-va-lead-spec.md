# Korxona va Lead/CRM modullari — spec

> Bandlik Markazi platformasining korxona (Employer) va lead/CRM qismi.
> Mavjud `bot2.*` (Student, Document) ga FK qiladi. Barcha modellar `BaseModel` (UUID pk, timestamps).

---

## 1. Maqsad

Korxonalar shartnoma asosida ishlaydi. Markaz xodimi nomzodlarni **lead** (talabalar to'plami)
holatida yig'ib, korxonaga **maxsus link** orqali yuboradi va natijani **follow-up** orqali kuzatadi.
Korxona login qilmaydi va harakat qilishga majbur emas — jarayonni xodim boshqaradi.

---

## 2. Modellar

### 2.1. Employer (korxona)

```python
# employers/models.py
class Employer(BaseModel):
    class MOU(models.TextChoices):
        NEGOTIATING = "negotiating"
        SIGNED      = "signed"
        EXPIRED     = "expired"
    name          = models.CharField(max_length=255)
    industry      = models.ForeignKey("catalog.CatalogItem", null=True, blank=True,
                                       on_delete=models.SET_NULL, related_name="+")  # type="industry"
    location      = models.CharField(max_length=255, blank=True)
    logo          = models.ImageField(upload_to="employers/", null=True, blank=True)
    description   = models.TextField(blank=True)
    contact_name  = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)
    mou_status    = models.CharField(max_length=12, choices=MOU.choices, default=MOU.NEGOTIATING)
```

### 2.2. Lead (CRM yadrosi)

```python
# crm/models.py
class Lead(BaseModel):
    class Status(models.TextChoices):
        CREATED  = "created"
        SENT     = "sent"
        VIEWING  = "viewing"
        SELECTED = "selected"   # ixtiyoriy bosqich
        CLOSED   = "closed"
    employer   = models.ForeignKey(Employer, on_delete=models.CASCADE, related_name="leads")
    vacancy    = models.ForeignKey("vacancies.Vacancy", null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name="leads")  # ixtiyoriy
    title      = models.CharField(max_length=255)
    status     = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED)
    students   = models.ManyToManyField("bot2.Bot2Student", through="LeadStudent", related_name="leads")
    created_by = models.ForeignKey("authn.User", null=True, on_delete=models.SET_NULL, related_name="+")
    notes      = models.TextField(blank=True)   # aloqa tarixi
    closed_result = models.CharField(max_length=12, blank=True)  # "placed" | "rejected"
```

`vacancy` — ixtiyoriy: vakansiya bo'lsa undan kelib chiqib mos nomzodlar taklif qilinadi; bo'lmasa bo'sh leaddan boshlanadi.

### 2.3. LeadStudent (M2M oraliq)

```python
class LeadStudent(BaseModel):
    lead     = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="lead_students")
    student  = models.ForeignKey("bot2.Bot2Student", on_delete=models.CASCADE, related_name="+")
    employer_interested = models.BooleanField(default=False)   # korxona belgilasa (ixtiyoriy)
    forwarded           = models.BooleanField(default=False)   # xodim rasman uzatdi
    class Meta:
        constraints = [models.UniqueConstraint(fields=["lead", "student"], name="uq_lead_student")]
```

### 2.4. AccessLink (maxsus link)

```python
class AccessLink(BaseModel):
    lead       = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name="access_link")
    token      = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    revoked    = models.BooleanField(default=False)
    def is_valid(self):
        return (not self.revoked) and timezone.now() < self.expires_at
```

### 2.5. AccessLog (kirish jurnali)

```python
class AccessLog(BaseModel):
    access_link = models.ForeignKey(AccessLink, on_delete=models.CASCADE, related_name="logs")
    accessed_at = models.DateTimeField(auto_now_add=True)
    ip          = models.GenericIPAddressField(null=True)
    user_agent  = models.CharField(max_length=512, blank=True)
```

### 2.6. FollowUp (kuzatuv)

```python
class FollowUp(BaseModel):
    class Stage(models.TextChoices):
        CONTACTED   = "contacted"     # 1-savol: aloqaga chiqdimi?
        INTERVIEWED = "interviewed"   # 2-savol: suhbat bo'ldimi?
        DONE        = "done"
    class Outcome(models.TextChoices):
        PENDING      = "pending"
        INTERVIEWED  = "interviewed"
        PLACED       = "placed"
        NO_CONTACT   = "no_contact"
        NO_INTERVIEW = "no_interview"
    lead_student = models.OneToOneField(LeadStudent, on_delete=models.CASCADE, related_name="follow_up")
    stage        = models.CharField(max_length=12, choices=Stage.choices, default=Stage.CONTACTED)
    attempt      = models.PositiveSmallIntegerField(default=0)   # 0..3 → oraliq [2,5,7] kun
    next_send_at = models.DateTimeField()
    last_answer  = models.BooleanField(null=True)
    outcome      = models.CharField(max_length=12, choices=Outcome.choices, default=Outcome.PENDING)
    flagged_for_staff = models.BooleanField(default=False)
```

---

## 3. Logika

### 3.1. Lead jarayoni (pipeline)

| Bosqich | Kim | Nima bo'ladi |
|---|---|---|
| **created** | xodim | Korxona + nom + ~10 talaba tanlanadi. Har `LeadStudent` uchun `FollowUp` yaratiladi va talabaga "Ma'lumotlaringiz {korxona}ga yuborildi" xabari ketadi. |
| **sent** | xodim | "Yuborish" → `AccessLink` (token, muddat) hosil bo'ladi; xodim linkni korxonaga beradi. |
| **viewing** | korxona | Link ochilganda avtomatik (`AccessLog` yoziladi). |
| **selected** | korxona | *Ixtiyoriy* — korxona qiziqqan nomzodni belgilasa. Majburiy emas. |
| **closed** | xodim | Natija: `placed` (joylashtirildi) yoki `rejected`. `placed` bo'lsa avtomatik bandlik snapshot (`source="lead"`). |

> **Eslatma:** korxona harakat qilishga majbur emas — jarayonni xodim boshqaradi. `selected` ixtiyoriy.

### 3.2. Talaba tanlash qoidalari

- Filtr: yo'nalish/ko'nikma bo'yicha; afzal — **ish izlovchi** (`is_job_seeking=true`) va **tasdiqlangan hujjatli**.
- Bitta talaba bir nechta leadda bo'lishi mumkin (turli korxonalar). Tizim kim qayerga taklif qilinganini biladi.
- `vacancy` biriktirilsa — uning talablariga mos talabalar avtomatik taklif qilinadi.

### 3.3. Korxona ko'rinishi (telefon = talaba roziligi)

Korxona link orqali lead'dagi **barcha** talabani ko'radi (variant **a**), faqat `Document.status="verified"` hujjat ko'rinadi. Telefon va to'liq ma'lumot esa talaba roziligiga bog'liq:

- `Bot2Student.share_with_employers = true` → korxona **telefon + barcha ma'lumotni** ko'radi.
- `false` → talaba baribir ko'rinadi (ism, yo'nalish, kurs, tasdiqlangan hujjat), lekin **telefon yashirin** (`phone=null`) va "markaz orqali bog'laning" belgisi; aloqani xodim qiladi.

`share_with_employers` onboarding'da bir marta so'raladi ("Ma'lumotlaringizni ish beruvchilarga ulashishni istaysizmi?") va "Akkaunt" menyusidan o'zgartiriladi.

### 3.4. Follow-up sikli

- **Lead yaratilganda** boshlanadi (forwarded'da emas). Har `LeadStudent` uchun alohida `FollowUp`.
- Kadens: 1-savol +2 kun; "Yo'q" bo'lsa qayta — oraliq **2 → 5 → 7 kun**.
- `contacted` (aloqaga chiqdimi?) = Ha → `interviewed` (suhbat bo'ldimi?), `attempt=0`, +2 kun.
- `interviewed` = Ha → `done`, `outcome=interviewed`, talabaga yopuvchi xabar.
- 3× "Yo'q" → `done`, `flagged_for_staff=true`, `outcome` = `no_contact` (1-savol) yoki `no_interview` (2-savol).
- Bir talaba bir nechta leadda — har biri mustaqil, korxona nomi bilan.
- **Yetkazish:** backend cron Telegram Bot API orqali yuboradi (`process_followups` management command, Celery'siz).

---

## 4. Endpointlar

### Xodim (dashboard, JWT)

```
CRUD   /api/employers

POST   /api/leads
req :  { "employer_id": "...", "title": "Backend dasturchilar",
         "vacancy_id": null, "student_ids": ["stu_1","stu_2", ...] }
resp:  { "lead_id": "lead_...", "status": "created" }   // + follow-up'lar yaratiladi

POST   /api/leads/{id}/send
resp:  { "access_url": "https://.../l/3f9c...", "expires_at": "2026-07-18", "status": "sent" }

PATCH  /api/leads/{id}            { "status": "closed", "closed_result": "placed" }
PATCH  /api/leads/{id}/students/{sid}   { "forwarded": true }
POST   /api/leads/{id}/access/revoke    // linkni bekor qilish
```

### Korxona (public, token — auth yo'q, throttled)

```
GET    /l/{token}
resp:  { "lead_title": "Backend dasturchilar", "employer": "EPAM",
         "students": [
           { "name": "Jasur T.", "program": "IT", "course": 3,
             "documents": [ {"type":"cv","status":"verified"},
                            {"type":"ielts","status":"verified"} ],
             "phone": "+998...", "shared": true },
           { "name": "Aziz K.", "program": "Mexatronika", "course": 4,
             "documents": [ {"type":"cv","status":"verified"} ],
             "phone": null, "shared": false }     // rozilik yo'q → telefon yashirin
         ] }

POST   /l/{token}/interest         // ixtiyoriy
req :  { "student_ids": ["stu_1"] }
resp:  { "ok": true, "lead_status": "selected" }
```

### Bot (service token)

```
POST   /api/bot/followup/answer
req :  { "follow_up_id": "fu_...", "answer": true }
resp:  { "stage": "interviewed", "next_question": "Suhbat bo'ldimi?" }
       // yakun: { "stage":"done", "outcome":"interviewed", "message":"..." }
       // 3x yo'q: { "stage":"done", "outcome":"no_contact", "flagged_for_staff": true }
```

---

## 5. Qotirilgan qarorlar

- Telefon — `share_with_employers` roziligi bilan; rozilik yo'q bo'lsa ham talaba ko'rinadi (variant **a**), faqat telefon yashirin.
- Korxona aksiyasi (`interest`/`selected`) ixtiyoriy; jarayonni xodim boshqaradi.
- Follow-up **lead yaratilganda** boshlanadi.
- Har lead uchun alohida, muddatli, bekor qilinadigan `AccessLink`; public view throttled (token UUIDv4).
- Korxonaga faqat `verified` hujjat ko'rinadi.
- `lead`+`student` unique; bir talaba bir nechta leadda bo'lishi mumkin.
- `vacancy` — ixtiyoriy bog'lanish.
