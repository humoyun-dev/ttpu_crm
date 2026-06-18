from django.db import models

from common.models import BaseModel


class Document(BaseModel):
    class Type(models.TextChoices):
        CV = "cv", "CV"
        IELTS = "ielts", "IELTS"
        CERT = "cert", "Certificate"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        FLAGGED = "flagged", "Flagged"

    student = models.ForeignKey(
        "bot2.Bot2Student", on_delete=models.CASCADE, related_name="documents"
    )
    type = models.CharField(max_length=10, choices=Type.choices)
    file = models.FileField(upload_to="documents/")
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    ai_result = models.JSONField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        "authn.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["type"]),
        ]

    def __str__(self) -> str:
        return f"Document({self.type}, student={self.student_id})"
