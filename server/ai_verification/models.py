from django.db import models

from common.models import BaseModel


class DocumentVerification(BaseModel):
    """
    Bitta hujjat (CV, IELTS, sertifikat) uchun yagona verification yozuvi.
    Append-only: yangi hujjat = yangi yozuv.

    BaseModel UUID `id` + `created_at`/`updated_at` ni ta'minlaydi.
    """

    class DocumentType(models.TextChoices):
        CV = "cv", "CV / Rezume"
        IELTS = "ielts", "IELTS Sertifikati"
        CERTIFICATE = "certificate", "Boshqa Sertifikat"
        DIPLOMA = "diploma", "Diplom"
        OTHER = "other", "Boshqa"

    class Status(models.TextChoices):
        PENDING = "pending", "Navbatda"
        PROCESSING = "processing", "Tahlil qilinmoqda"
        DONE = "done", "Tayyor"
        FAILED = "failed", "Xatolik"

    class ConfidenceLevel(models.TextChoices):
        GREEN = "green", "Yashil (ishonchli)"
        YELLOW = "yellow", "Sariq (shubhali)"
        RED = "red", "Qizil (past ishonch)"

    class FinalDecision(models.TextChoices):
        PENDING = "pending", "Ko'rib chiqilmagan"
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
    extracted_data = models.JSONField(default=dict)    # AI ajratgan ma'lumotlar
    flags = models.JSONField(default=list)             # ["blurry_image", "date_mismatch", ...]
    ai_summary = models.TextField(blank=True)          # AI xulosasi (o'zbek tilida)
    processed_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)       # Status=failed bo'lganda

    # --- Xodim sharhi ---
    reviewed_by = models.ForeignKey(
        "authn.User",
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="reviewed_verifications",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)
    final_decision = models.CharField(
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
            "green": "#16a34a",
            "yellow": "#ca8a04",
            "red": "#dc2626",
        }.get(self.confidence_level, "#6b7280")
