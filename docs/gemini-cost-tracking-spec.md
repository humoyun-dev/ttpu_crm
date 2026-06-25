# Gemini Xarajat Kuzatuvi — Texnik Spetsifikatsiya
## Token va Pul Sarfini Yozib Borish

**Versiya:** 1.0  
**Sana:** 2026-06-25  
**Loyiha:** TTPU Bandlik Markazi (CRM)  
**Maqsad:** Har bir Gemini chaqiruvida ishlatilgan token va xarajatni ($ da) yozib borish  
**Bog'liq:** `gemini-ai-verification-spec.md` ga qo'shimcha

---

## 1. Umumiy G'oya

Har Gemini API javobida `usage_metadata` keladi — unda input, output va thinking token soni bor. Biz buni:
1. Har chaqiruvda **alohida yozuv** sifatida saqlaymiz (`AIUsageLog`)
2. Token sonini **rasmiy narxga** ko'paytirib, USD da xarajatni hisoblaymiz
3. Dashboard'da **jami xarajat, kunlik/oylik trend, model bo'yicha** ko'rsatamiz

```
Gemini API javobi
    │
    ├── usage_metadata.prompt_token_count      (input)
    ├── usage_metadata.candidates_token_count  (output)
    └── usage_metadata.thoughts_token_count    (thinking, agar bo'lsa)
    │
    ▼
AIUsageLog yozuvi yaratiladi
    ├── input_tokens
    ├── output_tokens
    ├── thinking_tokens
    ├── cost_usd  ← hisoblanadi
    └── verification (FK)
    │
    ▼
Dashboard analytics
    ├── Jami: $X.XX
    ├── Bu oy: $X.XX
    ├── Bugun: $X.XX
    └── Grafik: kunlik trend
```

---

## 2. Gemini 2.5 Flash Rasmiy Narxlari

> Manba: Google rasmiy hujjati (ai.google.dev/gemini-api/docs/pricing), 2026-06-24 da yangilangan. **Standard tier, Paid.**

| Tur | Narx (1M token uchun) |
|-----|----------------------|
| **Input** (text / image / video) | **$0.30** |
| Input (audio) | $1.00 |
| **Output** (thinking tokenlar bilan) | **$2.50** |

**Muhim eslatma:** PDF hujjat tokenlari **image token narxida** hisoblanadi ($0.30/1M). API javobida `DOCUMENT` modality ostida `promptTokensDetails` da ko'rinadi.

**Misol hisob:** Bitta CV tahlili odatda:
- ~1,500 input token (rasm + prompt) × $0.30/1M = $0.00045
- ~400 output token × $2.50/1M = $0.001
- **Jami: ~$0.0015 (taxminan 0.15 sent)**

1000 ta hujjat ≈ $1.5. Juda arzon.

---

## 3. Yangi Model: `AIUsageLog`

**Fayl:** `server/ai_verification/models.py` (mavjud faylga qo'shiladi)

```python
from decimal import Decimal


class AIUsageLog(BaseModel):
    """
    Har bir Gemini API chaqiruvi uchun alohida xarajat yozuvi.
    Append-only — hech qachon o'chirilmaydi yoki o'zgartirilmaydi.
    """

    class Model(models.TextChoices):
        GEMINI_25_FLASH      = "gemini-2.5-flash",      "Gemini 2.5 Flash"
        GEMINI_25_FLASH_LITE = "gemini-2.5-flash-lite", "Gemini 2.5 Flash-Lite"
        GEMINI_25_PRO        = "gemini-2.5-pro",        "Gemini 2.5 Pro"

    class Status(models.TextChoices):
        SUCCESS = "success", "Muvaffaqiyatli"
        ERROR   = "error",   "Xatolik"

    # Qaysi verification uchun (ixtiyoriy — kelajakda boshqa AI ishlar ham bo'lishi mumkin)
    verification = models.ForeignKey(
        "ai_verification.DocumentVerification",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="usage_logs",
    )

    # Operatsiya turi (verification, future: chatbot, summary, ...)
    operation = models.CharField(max_length=50, default="document_verification")

    # Model
    model_name = models.CharField(
        max_length=50, choices=Model.choices, default=Model.GEMINI_25_FLASH
    )

    # Token sonlari (Gemini usage_metadata dan)
    input_tokens    = models.PositiveIntegerField(default=0)
    output_tokens   = models.PositiveIntegerField(default=0)
    thinking_tokens = models.PositiveIntegerField(default=0)
    total_tokens    = models.PositiveIntegerField(default=0)

    # Hisoblangan xarajat (USD) — yuqori aniqlik uchun Decimal
    cost_usd = models.DecimalField(
        max_digits=12, decimal_places=8, default=Decimal("0")
    )

    # Holat
    status        = models.CharField(
        max_length=10, choices=Status.choices, default=Status.SUCCESS
    )
    error_message = models.TextField(blank=True)

    # Tezlik (millisekund) — ixtiyoriy monitoring
    latency_ms = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        db_table = "ai_usage_log"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["model_name"]),
            models.Index(fields=["operation"]),
            models.Index(fields=["created_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.model_name} | {self.total_tokens} tok | ${self.cost_usd}"
```

---

## 4. Narx Hisoblovchi (Pricing Module)

**Fayl:** `server/ai_verification/pricing.py` (yangi fayl)

```python
"""
Gemini narxlarini markazlashtirilgan joyda saqlash.
Narx o'zgarsa — faqat shu faylni yangilash kifoya.

Manba: https://ai.google.dev/gemini-api/docs/pricing
Yangilangan: 2026-06-24
"""
from decimal import Decimal


# Narxlar: 1 token uchun USD (1M token narxini 1_000_000 ga bo'lib)
# Standard tier, Paid
PRICING = {
    "gemini-2.5-flash": {
        "input":  Decimal("0.30") / Decimal("1000000"),   # $0.30 / 1M
        "output": Decimal("2.50") / Decimal("1000000"),   # $2.50 / 1M (thinking ham shu narxda)
    },
    "gemini-2.5-flash-lite": {
        "input":  Decimal("0.10") / Decimal("1000000"),   # $0.10 / 1M
        "output": Decimal("0.40") / Decimal("1000000"),   # $0.40 / 1M
    },
    "gemini-2.5-pro": {
        # Pro <= 200k token uchun
        "input":  Decimal("1.25") / Decimal("1000000"),   # $1.25 / 1M
        "output": Decimal("10.00") / Decimal("1000000"),  # $10.00 / 1M
    },
}


def calculate_cost(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    thinking_tokens: int = 0,
) -> Decimal:
    """
    Token sonlaridan USD xarajatni hisoblaydi.

    Eslatma: Gemini'da thinking tokenlar OUTPUT narxida hisoblanadi.
    Shuning uchun output_tokens + thinking_tokens birga olinadi.
    
    Aslida Gemini usage_metadata.candidates_token_count odatda
    thinking ni ham o'z ichiga oladi — lekin xavfsizlik uchun
    bu yerda alohida qo'shamiz va service qatlamida to'g'ri uzatamiz.
    """
    rates = PRICING.get(model_name)
    if rates is None:
        # Noma'lum model — 2.5 Flash narxini ishlatamiz (fallback)
        rates = PRICING["gemini-2.5-flash"]

    input_cost  = Decimal(input_tokens) * rates["input"]
    output_cost = Decimal(output_tokens + thinking_tokens) * rates["output"]

    return (input_cost + output_cost).quantize(Decimal("0.00000001"))


def estimate_monthly_cost(
    docs_per_day: int,
    model_name: str = "gemini-2.5-flash",
    avg_input_tokens: int = 1500,
    avg_output_tokens: int = 400,
) -> Decimal:
    """
    Oylik xarajatni taxminiy hisoblash (rejalashtirish uchun).
    """
    per_doc = calculate_cost(model_name, avg_input_tokens, avg_output_tokens)
    return (per_doc * docs_per_day * 30).quantize(Decimal("0.01"))
```

---

## 5. Service Qatlamini Yangilash

**Fayl:** `server/ai_verification/services.py` (mavjud `GeminiVerificationService` yangilanadi)

Asosiy o'zgarish: `verify()` endi token ma'lumotini ham qaytaradi.

```python
import time
from .pricing import calculate_cost


class GeminiVerificationService:

    MODEL_NAME = "gemini-2.5-flash"
    # ... (oldingi kod o'zgarishsiz)

    def verify(
        self,
        file_bytes: bytes,
        mime_type: str,
        document_type: str,
    ) -> dict:
        """
        Hujjatni tekshiradi VA token/xarajat ma'lumotini qaytaradi.

        Returns:
            {
                "confidence_score": float,
                "confidence_level": str,
                "extracted_data": dict,
                "flags": list,
                "summary": str,
                "_usage": {                    # ← YANGI
                    "input_tokens": int,
                    "output_tokens": int,
                    "thinking_tokens": int,
                    "total_tokens": int,
                    "cost_usd": Decimal,
                    "latency_ms": int,
                    "model_name": str,
                    "status": "success"|"error",
                    "error_message": str,
                }
            }
        """
        normalized_mime = mime_type.lower().replace("image/jpg", "image/jpeg")
        if normalized_mime not in self.SUPPORTED_MIME_TYPES:
            return self._error_result_with_usage(
                f"Qo'llab-quvvatlanmaydigan fayl turi: {mime_type}"
            )

        prompt = get_prompt(document_type)
        start = time.monotonic()

        try:
            image_part = {
                "mime_type": normalized_mime,
                "data": base64.b64encode(file_bytes).decode("utf-8"),
            }
            response = self.model.generate_content(
                [prompt, image_part],
                generation_config={
                    "temperature": 0.1,
                    "max_output_tokens": 1024,
                    "response_mime_type": "application/json",
                },
            )
            latency_ms = int((time.monotonic() - start) * 1000)

        except Exception as exc:
            latency_ms = int((time.monotonic() - start) * 1000)
            logger.error("Gemini API xatolik: %s", exc, exc_info=True)
            result = self._error_result(f"Gemini API xatoligi: {exc}")
            result["_usage"] = self._build_usage(
                None, latency_ms, status="error", error_message=str(exc)
            )
            return result

        # Natija parse
        result = self._parse_response(response.text)

        # Token ma'lumotini olish
        result["_usage"] = self._build_usage(
            response, latency_ms, status="success"
        )
        return result

    def _build_usage(
        self,
        response,
        latency_ms: int,
        status: str = "success",
        error_message: str = "",
    ) -> dict:
        """Gemini javobidan token va xarajat ma'lumotini ajratadi."""
        input_tokens = output_tokens = thinking_tokens = 0

        if response is not None and hasattr(response, "usage_metadata"):
            meta = response.usage_metadata
            # Gemini SDK maydon nomlari
            input_tokens    = getattr(meta, "prompt_token_count", 0) or 0
            output_tokens   = getattr(meta, "candidates_token_count", 0) or 0
            thinking_tokens = getattr(meta, "thoughts_token_count", 0) or 0

            # Muhim: candidates_token_count odatda thinking ni
            # o'z ichiga OLADI. Ikki marta hisoblamaslik uchun
            # output_tokens dan thinking ni ayirib, alohida saqlaymiz.
            if thinking_tokens and output_tokens >= thinking_tokens:
                output_tokens = output_tokens - thinking_tokens

        total_tokens = input_tokens + output_tokens + thinking_tokens

        cost = calculate_cost(
            self.MODEL_NAME, input_tokens, output_tokens, thinking_tokens
        )

        return {
            "input_tokens":    input_tokens,
            "output_tokens":   output_tokens,
            "thinking_tokens": thinking_tokens,
            "total_tokens":    total_tokens,
            "cost_usd":        cost,
            "latency_ms":      latency_ms,
            "model_name":      self.MODEL_NAME,
            "status":          status,
            "error_message":   error_message,
        }

    def _error_result_with_usage(self, message: str) -> dict:
        result = self._error_result(message)
        result["_usage"] = self._build_usage(
            None, 0, status="error", error_message=message
        )
        return result
```

---

## 6. View'ni Yangilash — Usage Log Yaratish

**Fayl:** `server/ai_verification/views.py` (mavjud `submit_document` yangilanadi)

`verify()` chaqirilgandan keyin `AIUsageLog` yoziladi:

```python
from .models import DocumentVerification, AIUsageLog


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def submit_document(request):
    # ... (oldingi kod: serializer, verification yaratish)

    try:
        verification.file.seek(0)
        file_bytes = verification.file.read()

        service = GeminiVerificationService()
        result = service.verify(
            file_bytes=file_bytes,
            mime_type=verification.mime_type,
            document_type=verification.document_type,
        )

        # --- Natijani saqlash ---
        verification.confidence_score = result.get("confidence_score")
        verification.confidence_level = result.get("confidence_level")
        verification.extracted_data   = result.get("extracted_data", {})
        verification.flags            = result.get("flags", [])
        verification.ai_summary       = result.get("summary", "")
        verification.processed_at     = timezone.now()

        if result.get("_error"):
            verification.status        = DocumentVerification.Status.FAILED
            verification.error_message = result.get("summary", "")
        else:
            verification.status = DocumentVerification.Status.DONE

        verification.save()

        # --- YANGI: Usage log yozish ---
        usage = result.get("_usage", {})
        AIUsageLog.objects.create(
            verification=verification,
            operation="document_verification",
            model_name=usage.get("model_name", "gemini-2.5-flash"),
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            thinking_tokens=usage.get("thinking_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            cost_usd=usage.get("cost_usd", 0),
            status=usage.get("status", "success"),
            error_message=usage.get("error_message", ""),
            latency_ms=usage.get("latency_ms"),
        )

    except Exception as exc:
        logger.exception("Verification xatolik (id=%s): %s", verification.pk, exc)
        verification.status        = DocumentVerification.Status.FAILED
        verification.error_message = str(exc)
        verification.save()

        # Xatolik bo'lsa ham usage log yozamiz (monitoring uchun)
        AIUsageLog.objects.create(
            verification=verification,
            operation="document_verification",
            status="error",
            error_message=str(exc),
        )

    return Response(
        DocumentVerificationSerializer(verification).data,
        status=status.HTTP_201_CREATED,
    )
```

---

## 7. Xarajat Analitika Endpointlari

**Fayl:** `server/ai_verification/views.py` (yangi view'lar qo'shiladi)

```python
from django.db.models import Sum, Count, Avg
from django.db.models.functions import TruncDate
from datetime import timedelta
from decimal import Decimal


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def usage_summary(request):
    """
    Umumiy xarajat xulosasi.

    GET /api/v1/ai-verification/usage/summary

    Response:
    {
        "total_cost_usd": "1.45230000",
        "total_tokens": 1234567,
        "total_requests": 850,
        "this_month_cost_usd": "0.32100000",
        "today_cost_usd": "0.01200000",
        "avg_cost_per_request": "0.00170800",
        "by_model": [...]
    }
    """
    now = timezone.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    qs = AIUsageLog.objects.filter(status="success")

    # Jami
    totals = qs.aggregate(
        total_cost=Sum("cost_usd"),
        total_tokens=Sum("total_tokens"),
        total_requests=Count("id"),
        avg_cost=Avg("cost_usd"),
    )

    # Bu oy
    month_cost = qs.filter(created_at__gte=month_start).aggregate(
        c=Sum("cost_usd")
    )["c"] or Decimal("0")

    # Bugun
    today_cost = qs.filter(created_at__gte=today_start).aggregate(
        c=Sum("cost_usd")
    )["c"] or Decimal("0")

    # Model bo'yicha
    by_model = list(
        qs.values("model_name")
        .annotate(
            cost=Sum("cost_usd"),
            tokens=Sum("total_tokens"),
            requests=Count("id"),
        )
        .order_by("-cost")
    )

    return Response({
        "total_cost_usd":       str(totals["total_cost"] or Decimal("0")),
        "total_tokens":         totals["total_tokens"] or 0,
        "total_requests":       totals["total_requests"] or 0,
        "this_month_cost_usd":  str(month_cost),
        "today_cost_usd":       str(today_cost),
        "avg_cost_per_request": str(totals["avg_cost"] or Decimal("0")),
        "by_model":             by_model,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def usage_daily(request):
    """
    Kunlik xarajat trendi (grafik uchun).

    GET /api/v1/ai-verification/usage/daily?days=30

    Response:
    {
        "days": [
            {"date": "2026-06-01", "cost_usd": "0.012", "requests": 8, "tokens": 12000},
            ...
        ]
    }
    """
    try:
        days = int(request.query_params.get("days", 30))
    except ValueError:
        days = 30
    days = min(max(days, 1), 365)  # 1-365 oralig'ida

    since = timezone.now() - timedelta(days=days)

    rows = (
        AIUsageLog.objects.filter(status="success", created_at__gte=since)
        .annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(
            cost=Sum("cost_usd"),
            requests=Count("id"),
            tokens=Sum("total_tokens"),
        )
        .order_by("date")
    )

    return Response({
        "days": [
            {
                "date":     str(r["date"]),
                "cost_usd": str(r["cost"] or Decimal("0")),
                "requests": r["requests"],
                "tokens":   r["tokens"] or 0,
            }
            for r in rows
        ]
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def usage_estimate(request):
    """
    Oylik xarajat taxmini (rejalashtirish uchun).

    GET /api/v1/ai-verification/usage/estimate?docs_per_day=50

    Response:
    {
        "docs_per_day": 50,
        "estimated_monthly_cost_usd": "2.25",
        "model": "gemini-2.5-flash"
    }
    """
    from .pricing import estimate_monthly_cost

    try:
        docs_per_day = int(request.query_params.get("docs_per_day", 50))
    except ValueError:
        docs_per_day = 50

    estimate = estimate_monthly_cost(docs_per_day)

    return Response({
        "docs_per_day":               docs_per_day,
        "estimated_monthly_cost_usd": str(estimate),
        "model":                      "gemini-2.5-flash",
    })
```

---

## 8. URL'larni Yangilash

**Fayl:** `server/ai_verification/urls.py`

```python
from django.urls import path
from . import views

urlpatterns = [
    # Hujjat tekshiruvi (oldingi spec)
    path("submit",                   views.submit_document,       name="ai-verify-submit"),
    path("<uuid:pk>",                 views.verification_detail,   name="ai-verify-detail"),
    path("<uuid:pk>/review",          views.review_verification,   name="ai-verify-review"),
    path("student/<uuid:student_id>", views.student_verifications, name="ai-verify-student"),

    # --- YANGI: Xarajat kuzatuvi ---
    path("usage/summary",  views.usage_summary,  name="ai-usage-summary"),
    path("usage/daily",    views.usage_daily,    name="ai-usage-daily"),
    path("usage/estimate", views.usage_estimate, name="ai-usage-estimate"),
]
```

---

## 9. Django Admin'ga Qo'shish

**Fayl:** `server/ai_verification/admin.py`

```python
from django.contrib import admin
from .models import DocumentVerification, AIUsageLog


@admin.register(AIUsageLog)
class AIUsageLogAdmin(admin.ModelAdmin):
    list_display = [
        "created_at", "model_name", "operation",
        "input_tokens", "output_tokens", "thinking_tokens",
        "total_tokens", "cost_usd", "status",
    ]
    list_filter   = ["model_name", "operation", "status", "created_at"]
    readonly_fields = [
        "verification", "model_name", "operation",
        "input_tokens", "output_tokens", "thinking_tokens",
        "total_tokens", "cost_usd", "status", "error_message",
        "latency_ms", "created_at",
    ]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False  # Faqat avtomatik yaratiladi

    def has_change_permission(self, request, obj=None):
        return False  # O'zgartirib bo'lmaydi (append-only)
```

---

## 10. Migration

```bash
docker-compose exec server python manage.py makemigrations ai_verification
docker-compose exec server python manage.py migrate
```

---

## 11. Dashboard Integratsiya (Next.js)

### 11.1 Yangi sahifa: AI Xarajatlar

```
/dashboard/ai-costs   ← yangi sahifa

┌─────────────────────────────────────────────────┐
│  AI Xarajatlari                                  │
├─────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Jami     │ │ Bu oy    │ │ Bugun    │         │
│  │ $1.45    │ │ $0.32    │ │ $0.012   │         │
│  └──────────┘ └──────────┘ └──────────┘         │
│                                                  │
│  ┌──────────┐ ┌──────────┐                      │
│  │ So'rovlar│ │ O'rtacha │                      │
│  │ 850      │ │ $0.0017  │                      │
│  └──────────┘ └──────────┘                      │
│                                                  │
│  📈 Kunlik trend (30 kun)                        │
│  ▁▂▃▅▂▁▃▅▇▅▃▂▁▂▃ ...                            │
│                                                  │
│  Model bo'yicha:                                 │
│  • Gemini 2.5 Flash: $1.45 (850 so'rov)         │
└─────────────────────────────────────────────────┘
```

### 11.2 API chaqiruvlari (frontend)

```typescript
// dashboard/lib/api.ts ga qo'shish

export async function getUsageSummary() {
  return apiGet("/ai-verification/usage/summary");
}

export async function getUsageDaily(days = 30) {
  return apiGet(`/ai-verification/usage/daily?days=${days}`);
}

export async function getUsageEstimate(docsPerDay = 50) {
  return apiGet(`/ai-verification/usage/estimate?docs_per_day=${docsPerDay}`);
}
```

### 11.3 Grafik komponenti (recharts)

```typescript
// dashboard/app/dashboard/ai-costs/cost-chart.tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function CostChart({ data }: { data: DailyUsage[] }) {
  const chartData = data.map(d => ({
    date: d.date.slice(5),        // "06-01" formatida
    cost: parseFloat(d.cost_usd),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <XAxis dataKey="date" />
        <YAxis tickFormatter={(v) => `$${v.toFixed(3)}`} />
        <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, "Xarajat"]} />
        <Line type="monotone" dataKey="cost" stroke="#2563eb" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

---

## 12. Konvertatsiya: USD → UZS (Ixtiyoriy)

Agar boshqaruvga so'mda ko'rsatish kerak bo'lsa:

```python
# settings.py
USD_TO_UZS_RATE = float(os.getenv("USD_TO_UZS_RATE", "12650"))

# usage_summary view ichida qo'shimcha maydon:
"total_cost_uzs": str(
    (totals["total_cost"] or Decimal("0")) * Decimal(str(settings.USD_TO_UZS_RATE))
),
```

> Eslatma: Real-time kurs uchun CBU (Markaziy Bank) API'sini ishlatish mumkin, lekin oddiy holatda `.env` dagi qat'iy kurs yetarli.

---

## 13. Test Namunalari

```python
# server/tests/test_ai_pricing.py
from decimal import Decimal
from ai_verification.pricing import calculate_cost, estimate_monthly_cost


def test_calculate_cost_basic():
    # 1500 input + 400 output, gemini-2.5-flash
    cost = calculate_cost("gemini-2.5-flash", 1500, 400)
    # Input: 1500 * 0.30/1M = 0.00045
    # Output: 400 * 2.50/1M = 0.001
    # Jami: 0.00145
    assert cost == Decimal("0.00145000")


def test_thinking_tokens_priced_as_output():
    # thinking output narxida hisoblanishi kerak
    cost = calculate_cost("gemini-2.5-flash", 1000, 200, thinking_tokens=300)
    # Input: 1000 * 0.30/1M = 0.0003
    # Output+thinking: 500 * 2.50/1M = 0.00125
    # Jami: 0.00155
    assert cost == Decimal("0.00155000")


def test_unknown_model_falls_back_to_flash():
    cost1 = calculate_cost("unknown-model", 1000, 100)
    cost2 = calculate_cost("gemini-2.5-flash", 1000, 100)
    assert cost1 == cost2


def test_monthly_estimate():
    # 50 hujjat/kun
    est = estimate_monthly_cost(50)
    assert est > Decimal("0")
    assert est < Decimal("10")  # Mantiqiy chegara
```

---

## 14. Bosqichma-Bosqich Amalga Oshirish

1. **`pricing.py` yaratish** — narxlar va hisoblovchi funksiyalar
2. **`AIUsageLog` modeli** — `models.py` ga qo'shish
3. **`services.py` yangilash** — `_build_usage()` metodi, `verify()` token qaytarishi
4. **`views.py` yangilash** — usage log yozish + 3 ta analytics endpoint
5. **`urls.py` yangilash** — yangi URL'lar
6. **`admin.py` yangilash** — `AIUsageLog` ro'yxatga olish
7. **Migration** — `makemigrations` + `migrate`
8. **Test** — `test_ai_pricing.py`
9. **Dashboard** — `/ai-costs` sahifasi (alohida frontend ish)

---

## 15. Muhim Eslatmalar

| Tamoyil | Izoh |
|---------|------|
| **Append-only** | `AIUsageLog` hech qachon o'chirilmaydi/o'zgartirilmaydi — audit uchun |
| **Xatolik ham yoziladi** | Status=error bo'lsa ham log yoziladi (xarajat 0, lekin so'rov hisobga olinadi) |
| **Thinking = output narx** | Gemini'da thinking tokenlar output narxida hisoblanadi — ikki marta hisoblamaslik kerak |
| **Narx markazlashtirilgan** | Faqat `pricing.py` da — narx o'zgarsa bir joyni yangilash kifoya |
| **Decimal ishlatish** | Float emas — pul hisobida aniqlik muhim |
| **PDF = image narx** | Hujjat tokenlari image token narxida ($0.30/1M) |

---

## 16. Real Hisob Misoli

**Stsenariy:** Universitet kuniga 100 ta hujjat tekshiradi.

```
Bir hujjat:
  Input:  ~1,500 token × $0.30/1M = $0.00045
  Output: ~400 token  × $2.50/1M = $0.001
  Jami:   $0.00145

Kuniga 100 hujjat:  $0.145
Oyiga (30 kun):     $4.35
Yiliga:             ~$52

→ Juda arzon. Gemini 2.5 Flash bilan yillik xarajat $52 atrofida.
```

Agar Flash-Lite ($0.10/$0.40) ga o'tilsa, yana 2-3 barobar arzon bo'ladi, lekin sifat biroz pasayadi.

---

*Spec tayyor — bu hujjat `gemini-ai-verification-spec.md` ga qo'shimcha. Ikkalasi birga to'liq AI hujjat tekshiruvi + xarajat kuzatuvi tizimini tashkil qiladi.*
