# Gemini AI Integratsiya — Texnik Spetsifikatsiya
## `ai_verification` Django App — Hujjat Tekshiruvi

**Versiya:** 1.0  
**Sana:** 2026-06-25  
**Loyiha:** TTPU Bandlik Markazi (CRM)  
**Maqsad:** Hujjat tekshiruvi (CV, IELTS, sertifikat) uchun Gemini 2.5 Flash ni to'g'ridan-to'g'ri Django serverga integratsiya qilish

---

## 1. Model Tanlovi: Gemini 2.5 Flash

### Nima uchun Gemini 2.5 Flash?

| Mezon | Gemini 2.5 Flash | Gemini 2.5 Pro |
|-------|-----------------|----------------|
| Narx (input/output) | $0.15 / $0.60 per 1M token | $1.25 / $10.00 per 1M token |
| Tezlik | Tez (~2–4 sek) | Sekinroq |
| Hujjat tahlili | ✅ Yetarli | ✅ Kuchli |
| Multimodal (rasm/PDF) | ✅ | ✅ |
| Production GA status | ✅ Stable | ✅ Stable |
| **Tavsiya** | **Bizning holat uchun optimal** | Murakkab reasoning kerak bo'lganda |

> ⚠️ **Muhim:** Gemini 2.0 Flash June 1, 2026 da o'chirilgan. Faqat `gemini-2.5-flash` ishlating.

### Python paketi

```bash
pip install google-generativeai>=0.8.0
```

Model string: **`gemini-2.5-flash`**

---

## 2. Umumiy Arxitektura

```
Dashboard (Next.js)
    │  POST /api/v1/ai-verification/submit
    │  GET  /api/v1/ai-verification/{id}
    │  PATCH /api/v1/ai-verification/{id}/review
    ▼
Django server/
    ├── ai_verification/          ← Yangi app (BU SPEC)
    │   ├── models.py             ← DocumentVerification
    │   ├── views.py              ← Upload, detail, review
    │   ├── services.py           ← GeminiVerificationService
    │   ├── serializers.py
    │   ├── urls.py
    │   └── prompts.py            ← Prompt templates
    │
    └── [mavjud app'lar qoladi]
         ├── common/
         ├── authn/
         ├── bot2/
         └── ...
    │
    ▼ (HTTP, base64 bytes)
Google Gemini API
    └── gemini-2.5-flash
```

**Asosiy tamoyillar:**
- AI hech qachon avtomatik rad etmaydi — faqat `green/yellow/red` signal beradi
- Xodim (staff) yakuniy qarorni qabul qiladi
- Hujjat fayllari shaxsiy (private) saqlanadi — tashqaridan URL yo'q
- Gemini ga faqat base64 bytes yuboriladi, URL emas

---

## 3. Yangi App Yaratish

### 3.1 App strukturasi

```
server/
└── ai_verification/
    ├── __init__.py
    ├── apps.py
    ├── models.py
    ├── serializers.py
    ├── views.py
    ├── services.py
    ├── prompts.py
    ├── urls.py
    ├── admin.py
    └── migrations/
        └── 0001_initial.py
```

### 3.2 `server/crm_server/settings.py` ga qo'shish

```python
INSTALLED_APPS = [
    # ...
    "ai_verification",   # ← QO'SHISH
]

# Gemini API key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Media fayllari (hujjatlar) uchun
MEDIA_ROOT = os.path.join(BASE_DIR, "media")
MEDIA_URL = "/media/"   # faqat internal — tashqaridan ishlamaydi
```

### 3.3 `server/crm_server/urls.py` ga qo'shish

```python
urlpatterns = [
    # ...
    path("api/v1/ai-verification/", include("ai_verification.urls")),
]
```

---

## 4. Model: `DocumentVerification`

**Fayl:** `server/ai_verification/models.py`

```python
import uuid
from django.db import models
from common.models import BaseModel


class DocumentVerification(BaseModel):
    """
    Bitta hujjat (CV, IELTS, sertifikat) uchun yagona verification yozuvi.
    Append-only: yangi hujjat = yangi yozuv.
    """

    class DocumentType(models.TextChoices):
        CV           = "cv",          "CV / Rezume"
        IELTS        = "ielts",       "IELTS Sertifikati"
        CERTIFICATE  = "certificate", "Boshqa Sertifikat"
        DIPLOMA      = "diploma",     "Diplom"
        OTHER        = "other",       "Boshqa"

    class Status(models.TextChoices):
        PENDING    = "pending",    "Navbatda"
        PROCESSING = "processing", "Tahlil qilinmoqda"
        DONE       = "done",       "Tayyor"
        FAILED     = "failed",     "Xatolik"

    class ConfidenceLevel(models.TextChoices):
        GREEN  = "green",  "Yashil (ishonchli)"
        YELLOW = "yellow", "Sariq (shubhali)"
        RED    = "red",    "Qizil (past ishonch)"

    class FinalDecision(models.TextChoices):
        PENDING  = "pending",  "Ko'rib chiqilmagan"
        ACCEPTED = "accepted", "Qabul qilindi"
        REJECTED = "rejected", "Rad etildi"

    # --- Bog'liqliklar ---
    student = models.ForeignKey(
        "bot2.Bot2Student",
        on_delete=models.CASCADE,
        related_name="document_verifications",
    )
    uploaded_by = models.ForeignKey(
        "authn.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_verifications",
    )

    # --- Hujjat ---
    document_type = models.CharField(
        max_length=20, choices=DocumentType.choices, default=DocumentType.OTHER
    )
    file = models.FileField(upload_to="verifications/%Y/%m/")
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)  # image/jpeg, application/pdf

    # --- Gemini natijasi ---
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    confidence_level = models.CharField(
        max_length=10, choices=ConfidenceLevel.choices, null=True, blank=True
    )
    confidence_score = models.FloatField(null=True, blank=True)  # 0.0 — 1.0
    extracted_data   = models.JSONField(default=dict)    # AI ajratgan ma'lumotlar
    flags            = models.JSONField(default=list)    # ["blurry_image", "date_mismatch", ...]
    ai_summary       = models.TextField(blank=True)      # AI xulosasi (o'zbek tilida)
    processed_at     = models.DateTimeField(null=True, blank=True)
    error_message    = models.TextField(blank=True)      # Status=failed bo'lganda

    # --- Xodim sharhi ---
    reviewed_by     = models.ForeignKey(
        "authn.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reviewed_verifications",
    )
    reviewed_at      = models.DateTimeField(null=True, blank=True)
    review_note      = models.TextField(blank=True)
    final_decision   = models.CharField(
        max_length=10, choices=FinalDecision.choices, default=FinalDecision.PENDING
    )

    class Meta:
        db_table = "ai_verification_document"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["student", "document_type"]),
            models.Index(fields=["status"]),
            models.Index(fields=["confidence_level"]),
            models.Index(fields=["final_decision"]),
        ]

    def __str__(self):
        return f"{self.student} | {self.document_type} | {self.status}"

    @property
    def confidence_color(self):
        """Dashboard uchun rang kodi."""
        return {
            "green":  "#16a34a",
            "yellow": "#ca8a04",
            "red":    "#dc2626",
        }.get(self.confidence_level, "#6b7280")
```

---

## 5. Prompt Shablonlari

**Fayl:** `server/ai_verification/prompts.py`

```python
"""
Gemini uchun prompt shablonlari.
Barcha promptlar o'zbek tilida javob so'raydi.
Javob faqat JSON bo'lishi kerak — markdown yoki boshqa matn yo'q.
"""

CV_PROMPT = """
Quyidagi rasm CV (rezume) hujjati. Uni diqqat bilan tahlil qil.

Faqat JSON formatida javob ber (markdown yoki izoh yo'q):

{
  "confidence_score": 0.0-1.0,  // Hujjatning haqiqiylik darajasi
  "confidence_level": "green|yellow|red",  // 0.75+ green, 0.45-0.75 yellow, <0.45 red
  "extracted_data": {
    "full_name": "...",
    "email": "...",
    "phone": "...",
    "skills": ["...", "..."],
    "work_experience": [
      {"company": "...", "role": "...", "start": "...", "end": "..."}
    ],
    "education": [
      {"university": "...", "degree": "...", "year": "..."}
    ],
    "languages": [
      {"language": "...", "level": "..."}
    ]
  },
  "flags": [],  // ["no_photo", "incomplete_info", "suspicious_format", "blurry", "not_cv"]
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}

Qoidalar:
- Agar rasm CV emas bo'lsa: confidence_score = 0.1, flags = ["not_cv"]
- Agar rasm xiralashgan (blurry) bo'lsa: flags ga "blurry" qo'sh
- Hech qachon o'zing ma'lumot to'ldirma — faqat hujjatda ko'ringanini yoz
- Telefon/email ko'rinmasa: null qo'y
"""

IELTS_PROMPT = """
Quyidagi rasm IELTS sertifikati. Uni diqqat bilan tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "candidate_name": "...",
    "test_date": "...",       // YYYY-MM-DD formatida
    "overall_band": "...",    // Masalan: "7.5"
    "listening": "...",
    "reading": "...",
    "writing": "...",
    "speaking": "...",
    "certificate_number": "...",  // Agar ko'rinsa
    "test_type": "Academic|General Training|unknown"
  },
  "flags": [],  // ["low_score", "expired", "blurry", "not_ielts", "possibly_edited", "score_mismatch"]
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}

Qoidalar:
- Band scores 0-9 oralig'ida bo'lishi kerak — boshqacha bo'lsa: flags = ["score_mismatch"]
- Sertifikat 2 yildan eski bo'lsa: flags ga "expired" qo'sh
- Pixel darajasidagi tahrir belgilari bo'lsa: flags ga "possibly_edited" qo'sh
- Agar rasm IELTS sertifikati emas bo'lsa: confidence_score = 0.1, flags = ["not_ielts"]
"""

CERTIFICATE_PROMPT = """
Quyidagi rasm sertifikat hujjati. Uni tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "recipient_name": "...",
    "issuing_organization": "...",
    "certificate_title": "...",
    "issue_date": "...",       // YYYY-MM-DD yoki "unknown"
    "expiry_date": "...",      // null agar muddatsiz
    "certificate_number": "..." // null agar ko'rinmasa
  },
  "flags": [],  // ["blurry", "not_certificate", "possibly_edited", "expired", "missing_signature"]
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}
"""

DIPLOMA_PROMPT = """
Quyidagi rasm diplom hujjati. Uni tahlil qil.

Faqat JSON formatida javob ber:

{
  "confidence_score": 0.0-1.0,
  "confidence_level": "green|yellow|red",
  "extracted_data": {
    "graduate_name": "...",
    "university_name": "...",
    "degree": "...",          // Bakalavr, Magistr va h.k.
    "major": "...",
    "graduation_year": "...",
    "diploma_number": "..."   // null agar ko'rinmasa
  },
  "flags": [],  // ["blurry", "not_diploma", "possibly_edited", "missing_seal"]
  "summary": "O'zbek tilida 2-3 jumlada xulosa."
}
"""

# Prompt tanlash funksiyasi
PROMPT_MAP = {
    "cv":          CV_PROMPT,
    "ielts":       IELTS_PROMPT,
    "certificate": CERTIFICATE_PROMPT,
    "diploma":     DIPLOMA_PROMPT,
    "other":       CERTIFICATE_PROMPT,  # Fallback
}

def get_prompt(document_type: str) -> str:
    return PROMPT_MAP.get(document_type, CERTIFICATE_PROMPT)
```

---

## 6. Xizmat Qatlami (Service Layer)

**Fayl:** `server/ai_verification/services.py`

```python
import json
import logging
import base64
from datetime import datetime
from typing import Optional

import google.generativeai as genai
from django.conf import settings
from django.utils import timezone

from .prompts import get_prompt

logger = logging.getLogger(__name__)


class GeminiVerificationService:
    """
    Gemini 2.5 Flash orqali hujjatlarni tekshirish xizmati.
    
    Ishlatish:
        service = GeminiVerificationService()
        result = service.verify(file_bytes, mime_type, "cv")
    """

    MODEL_NAME = "gemini-2.5-flash"

    # MIME turlari Gemini qabul qiladi
    SUPPORTED_MIME_TYPES = {
        "image/jpeg", "image/jpg", "image/png", "image/webp",
        "image/gif", "application/pdf",
    }

    def __init__(self):
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY settings da sozlanmagan")
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel(self.MODEL_NAME)

    def verify(
        self,
        file_bytes: bytes,
        mime_type: str,
        document_type: str,
    ) -> dict:
        """
        Hujjatni Gemini orqali tekshiradi.

        Returns:
            {
                "confidence_score": float,
                "confidence_level": "green"|"yellow"|"red",
                "extracted_data": dict,
                "flags": list,
                "summary": str,
            }
        """
        # MIME type tekshirish
        normalized_mime = mime_type.lower().replace("image/jpg", "image/jpeg")
        if normalized_mime not in self.SUPPORTED_MIME_TYPES:
            return self._error_result(f"Qo'llab-quvvatlanmaydigan fayl turi: {mime_type}")

        prompt = get_prompt(document_type)

        # Gemini ga yuborish
        try:
            image_part = {
                "mime_type": normalized_mime,
                "data": base64.b64encode(file_bytes).decode("utf-8"),
            }
            response = self.model.generate_content(
                [prompt, image_part],
                generation_config={
                    "temperature": 0.1,      # Past temperature = barqaror javob
                    "max_output_tokens": 1024,
                    "response_mime_type": "application/json",  # Gemini JSON rejimi
                },
            )
        except Exception as exc:
            logger.error("Gemini API xatolik: %s", exc, exc_info=True)
            return self._error_result(f"Gemini API xatoligi: {exc}")

        # Javobni parse qilish
        return self._parse_response(response.text)

    def _parse_response(self, raw_text: str) -> dict:
        """Gemini javobini JSON ga aylantiradi va validatsiya qiladi."""
        try:
            # Markdown kod bloklari bo'lsa tozalash
            text = raw_text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])  # birinchi va oxirgi qatorni olib tashlash

            data = json.loads(text)

            # Confidence level hisoblash (agar berilmagan bo'lsa)
            score = float(data.get("confidence_score", 0.5))
            if "confidence_level" not in data:
                data["confidence_level"] = self._score_to_level(score)

            # Majburiy maydonlar
            data.setdefault("extracted_data", {})
            data.setdefault("flags", [])
            data.setdefault("summary", "")
            data["confidence_score"] = round(score, 2)

            return data

        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            logger.warning("Gemini javobini parse qilib bo'lmadi: %s | Raw: %s", exc, raw_text[:200])
            return self._error_result("Javobni o'qib bo'lmadi — qayta urinib ko'ring")

    @staticmethod
    def _score_to_level(score: float) -> str:
        if score >= 0.75:
            return "green"
        elif score >= 0.45:
            return "yellow"
        else:
            return "red"

    @staticmethod
    def _error_result(message: str) -> dict:
        return {
            "confidence_score": 0.0,
            "confidence_level": "red",
            "extracted_data": {},
            "flags": ["processing_error"],
            "summary": f"Xatolik: {message}",
            "_error": True,
        }
```

---

## 7. View'lar

**Fayl:** `server/ai_verification/views.py`

```python
import logging
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from common.auth import IsAdminUser   # Mavjud permission class
from common.exceptions import APIError
from .models import DocumentVerification
from .serializers import (
    DocumentVerificationSerializer,
    SubmitDocumentSerializer,
    ReviewSerializer,
)
from .services import GeminiVerificationService

logger = logging.getLogger(__name__)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def submit_document(request):
    """
    Hujjat yuklash va Gemini tekshiruvini boshlash.
    
    POST /api/v1/ai-verification/submit
    Content-Type: multipart/form-data
    
    Fields:
        student_id: UUID
        document_type: cv|ielts|certificate|diploma|other
        file: <fayl>
    """
    serializer = SubmitDocumentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # Yozuv yaratish
    verification = DocumentVerification.objects.create(
        student_id=data["student_id"],
        uploaded_by=request.user,
        document_type=data["document_type"],
        file=data["file"],
        original_filename=data["file"].name,
        mime_type=data["file"].content_type or "application/octet-stream",
        status=DocumentVerification.Status.PROCESSING,
    )

    # Gemini tekshiruvi (sinxron — ~2-4 sek)
    try:
        verification.file.seek(0)
        file_bytes = verification.file.read()

        service = GeminiVerificationService()
        result = service.verify(
            file_bytes=file_bytes,
            mime_type=verification.mime_type,
            document_type=verification.document_type,
        )

        # Natijani saqlash
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

    except Exception as exc:
        logger.exception("Verification xatolik (id=%s): %s", verification.pk, exc)
        verification.status        = DocumentVerification.Status.FAILED
        verification.error_message = str(exc)

    verification.save()

    return Response(
        DocumentVerificationSerializer(verification).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def verification_detail(request, pk):
    """
    GET /api/v1/ai-verification/{id}
    """
    try:
        verification = DocumentVerification.objects.select_related(
            "student", "uploaded_by", "reviewed_by"
        ).get(pk=pk)
    except DocumentVerification.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", 404)

    return Response(DocumentVerificationSerializer(verification).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def student_verifications(request, student_id):
    """
    Talabaning barcha hujjat tekshiruvlari.
    
    GET /api/v1/ai-verification/student/{student_id}
    """
    verifications = DocumentVerification.objects.filter(
        student_id=student_id
    ).select_related("uploaded_by", "reviewed_by")

    return Response(DocumentVerificationSerializer(verifications, many=True).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated, IsAdminUser])
def review_verification(request, pk):
    """
    Xodim tomonidan yakuniy qaror.
    
    PATCH /api/v1/ai-verification/{id}/review
    Body: { "final_decision": "accepted|rejected", "review_note": "..." }
    
    AI hech qachon qaror qabul qilmaydi — xodim tasdiqlaydi.
    """
    try:
        verification = DocumentVerification.objects.get(pk=pk)
    except DocumentVerification.DoesNotExist:
        raise APIError("NOT_FOUND", "Topilmadi", 404)

    if verification.status != DocumentVerification.Status.DONE:
        raise APIError("NOT_READY", "Hujjat hali tahlil qilinmagan", 400)

    serializer = ReviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data

    verification.final_decision = d["final_decision"]
    verification.review_note    = d.get("review_note", "")
    verification.reviewed_by    = request.user
    verification.reviewed_at    = timezone.now()
    verification.save()

    return Response(DocumentVerificationSerializer(verification).data)
```

---

## 8. Serializerlar

**Fayl:** `server/ai_verification/serializers.py`

```python
import uuid
from rest_framework import serializers
from .models import DocumentVerification


class DocumentVerificationSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(
        source="student.full_name", read_only=True, default=""
    )
    uploaded_by_name = serializers.CharField(
        source="uploaded_by.get_full_name", read_only=True, default=""
    )
    reviewed_by_name = serializers.CharField(
        source="reviewed_by.get_full_name", read_only=True, default=""
    )
    # Fayl URL ni chiqarmaymiz (xavfsizlik) — faqat metadata
    file_name = serializers.CharField(source="original_filename", read_only=True)

    class Meta:
        model  = DocumentVerification
        fields = [
            "id", "student", "student_name",
            "document_type", "file_name", "mime_type",
            "status", "confidence_level", "confidence_score",
            "extracted_data", "flags", "ai_summary",
            "processed_at", "error_message",
            "uploaded_by", "uploaded_by_name",
            "reviewed_by", "reviewed_by_name",
            "reviewed_at", "review_note", "final_decision",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


class SubmitDocumentSerializer(serializers.Serializer):
    student_id    = serializers.UUIDField()
    document_type = serializers.ChoiceField(
        choices=DocumentVerification.DocumentType.values
    )
    file = serializers.FileField()

    def validate_file(self, value):
        max_size = 10 * 1024 * 1024  # 10 MB
        if value.size > max_size:
            raise serializers.ValidationError("Fayl hajmi 10 MB dan oshmasligi kerak.")
        allowed = {
            "image/jpeg", "image/jpg", "image/png",
            "image/webp", "application/pdf",
        }
        if value.content_type and value.content_type.lower() not in allowed:
            raise serializers.ValidationError(
                f"Ruxsat etilmagan fayl turi: {value.content_type}. "
                "JPG, PNG, WEBP yoki PDF yuboring."
            )
        return value


class ReviewSerializer(serializers.Serializer):
    final_decision = serializers.ChoiceField(
        choices=["accepted", "rejected"]
    )
    review_note = serializers.CharField(required=False, allow_blank=True, default="")
```

---

## 9. URL Patterns

**Fayl:** `server/ai_verification/urls.py`

```python
from django.urls import path
from . import views

urlpatterns = [
    path("submit",                     views.submit_document,       name="ai-verify-submit"),
    path("<uuid:pk>",                   views.verification_detail,   name="ai-verify-detail"),
    path("<uuid:pk>/review",            views.review_verification,   name="ai-verify-review"),
    path("student/<uuid:student_id>",   views.student_verifications, name="ai-verify-student"),
]
```

---

## 10. Migration

**Fayl:** `server/ai_verification/migrations/0001_initial.py`

```bash
# Generatsiya qilish:
docker-compose exec server python manage.py makemigrations ai_verification
docker-compose exec server python manage.py migrate
```

---

## 11. Environment Variables

**`.env` fayliga qo'shish:**

```env
# Gemini API
GEMINI_API_KEY=your-google-ai-studio-api-key-here

# Media fayllar (hujjatlar saqlash joyi)
MEDIA_ROOT=/app/media
```

**Google AI Studio da API key olish:**
1. https://aistudio.google.com/app/apikey
2. "Create API key" → loyiha tanlash
3. API key ni `.env` ga qo'shish

---

## 12. Django Admin

**Fayl:** `server/ai_verification/admin.py`

```python
from django.contrib import admin
from .models import DocumentVerification


@admin.register(DocumentVerification)
class DocumentVerificationAdmin(admin.ModelAdmin):
    list_display = [
        "student", "document_type", "status",
        "confidence_level", "confidence_score",
        "final_decision", "created_at",
    ]
    list_filter  = ["status", "document_type", "confidence_level", "final_decision"]
    search_fields = ["student__first_name", "student__last_name"]
    readonly_fields = [
        "extracted_data", "flags", "ai_summary",
        "confidence_score", "processed_at",
    ]
```

---

## 13. Dashboard Integratsiya Nuqtalari

**Next.js dashboard (`dashboard/`) uchun yangi sahifalar:**

### 13.1 Talaba profiliga qo'shimcha sektsiya
```
/dashboard/students/{id}  →  yangi tab: "Hujjatlar"
    ├── Hujjat yuklash tugmasi (POST /ai-verification/submit)
    ├── Yuklangan hujjatlar ro'yxati
    │   ├── 🟢 CV (0.92) — Qabul qilindi
    │   ├── 🟡 IELTS (0.61) — Ko'rib chiqilmoqda
    │   └── 🔴 Sertifikat (0.31) — Rad etildi
    └── Har bir yozuvni bosish → detail modal
```

### 13.2 Confidence Badge komponenti
```typescript
// dashboard/components/confidence-badge.tsx
const CONFIDENCE_CONFIG = {
  green:  { label: "Ishonchli",  color: "bg-green-100 text-green-800",  icon: "✅" },
  yellow: { label: "Shubhali",   color: "bg-yellow-100 text-yellow-800", icon: "⚠️" },
  red:    { label: "Past ishonch", color: "bg-red-100 text-red-800",    icon: "❌" },
}
```

### 13.3 API endpointlari (frontend uchun)
```
POST   /api/v1/ai-verification/submit              → Hujjat yuklash
GET    /api/v1/ai-verification/{id}                → Natijani ko'rish
PATCH  /api/v1/ai-verification/{id}/review         → Qaror qabul qilish
GET    /api/v1/ai-verification/student/{student_id} → Talabaning barcha hujjatlari
```

---

## 14. Xavfsizlik Qoidalari

| Qoida | Izohi |
|-------|-------|
| **Media fayllar URL'si ochiq emas** | Django `MEDIA_URL` tashqaridan ishlamaydi — faqat ichki xizmat o'qiydi |
| **Faqat admin/staff yuklay oladi** | `IsAdminUser` permission barcha endpointlarda |
| **AI auto-reject qilmaydi** | `final_decision` faqat xodim tomonidan o'rnatiladi |
| **Gemini ga URL berilmaydi** | Faqat base64 bytes — fayl URL hech qachon tashqariga chiqmaydi |
| **Fayl hajmi chegarasi** | 10 MB maksimum |
| **MIME type tekshiruvi** | Faqat: JPEG, PNG, WEBP, PDF |

---

## 15. Bosqichma-Bosqich Amalga Oshirish

### Birinchi qadam — Package o'rnatish
```bash
cd server
pip install google-generativeai>=0.8.0   # yoki poetry add google-generativeai
```

### Ikkinchi qadam — App yaratish
```bash
docker-compose exec server python manage.py startapp ai_verification
```

### Uchinchi qadam — Fayllarni yozish
Yuqoridagi spec bo'yicha tartib bilan:
1. `models.py`
2. `prompts.py`
3. `services.py`
4. `serializers.py`
5. `views.py`
6. `urls.py`
7. `admin.py`
8. `apps.py` — `name = "ai_verification"` ni tekshiring

### To'rtinchi qadam — Sozlamalar
```python
# settings.py ga qo'shish
INSTALLED_APPS = [..., "ai_verification"]
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
```

### Beshinchi qadam — Migration
```bash
docker-compose exec server python manage.py makemigrations ai_verification
docker-compose exec server python manage.py migrate
```

### Oltinchi qadam — Test
```bash
# API test
curl -X POST http://localhost:8000/api/v1/ai-verification/submit \
  -H "Authorization: Bearer <jwt-token>" \
  -F "student_id=<uuid>" \
  -F "document_type=cv" \
  -F "file=@cv.pdf"
```

---

## 16. Kutilgan Natija Namunalari

### CV natijasi (yashil)
```json
{
  "confidence_score": 0.88,
  "confidence_level": "green",
  "extracted_data": {
    "full_name": "Aziz Karimov",
    "email": "aziz@gmail.com",
    "skills": ["Python", "Django", "React"],
    "work_experience": [{"company": "TechCo", "role": "Developer", "start": "2022", "end": "2024"}],
    "education": [{"university": "TTPU", "degree": "Bakalavr", "year": "2022"}]
  },
  "flags": [],
  "summary": "CV to'liq va profesional tarzda tuzilgan. Asosiy ma'lumotlar aniq ko'rinadi."
}
```

### IELTS natijasi (sariq — shubhali)
```json
{
  "confidence_score": 0.55,
  "confidence_level": "yellow",
  "extracted_data": {
    "candidate_name": "Nilufar Rashidova",
    "overall_band": "7.0",
    "test_date": "2023-09-15"
  },
  "flags": ["possibly_edited"],
  "summary": "Sertifikat umumiy jihatdan to'g'ri ko'rinadi, lekin font bilan bog'liq anomaliya aniqlandi. Qo'shimcha tekshiruv tavsiya etiladi."
}
```

---

## Havola: Mavjud Arxitektura bilan Bog'liqlik

```
bot2_service/  →  (kelajakda) Bot orqali hujjat yuborish
     ↓
server/bot2/    →  Bot2Student model (student ForeignKey)
     ↓
server/ai_verification/  ←  BU APP
     ↓
Google Gemini 2.5 Flash API
```

Hozircha: faqat dashboard orqali xodimlar hujjat yuklaydi.
Kelajakda: talabalar bot orqali hujjat yubora oladi (alohida spec kerak).

---

*Spec tayyor — AI coding agent yoki dasturchi bu hujjat bo'yicha to'liq implementatsiya qila oladi.*
