from django.db import models

from common.models import BaseModel


class InternshipRequest(BaseModel):
    """Talabaning amaliyot arizasi.

    Talaba botda kompaniyani reestrdan (`employer`) tanlaydi yoki qo'lda yozadi
    (`company_name` har doim to'ladi — reestrdan tanlanganda snapshot sifatida).
    Xodim ko'rib chiqadi: tasdiqlaydi yoki rad etadi; natija talabaga bot xabari
    orqali yetkaziladi. Mustaqil modul — eski jadvallarga tegmaydi.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Ko'rib chiqilmoqda"
        APPROVED = "approved", "Tasdiqlandi"
        REJECTED = "rejected", "Rad etildi"

    student = models.ForeignKey(
        "bot2.Bot2Student",
        on_delete=models.CASCADE,
        related_name="internship_requests",
    )
    # Reestrdan tanlansa to'ladi; erkin matn kiritilsa null.
    employer = models.ForeignKey(
        "employers.Employer",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    # Har doim to'ladi (reestrdan → employer.name snapshot, yoki qo'lda yozilgan matn).
    company_name = models.CharField(max_length=255)
    note = models.TextField(blank=True)  # talabaning ixtiyoriy izohi
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    staff_comment = models.TextField(blank=True)  # rad/tasdiq sababi
    reviewed_by = models.ForeignKey(
        "authn.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            # Bir vaqtda faqat bitta faol (pending) ariza — DB darajasida qat'iy.
            models.UniqueConstraint(
                fields=["student"],
                condition=models.Q(status="pending"),
                name="uq_one_pending_internship_per_student",
            )
        ]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["student", "status"]),
        ]

    def __str__(self) -> str:
        return f"{self.company_name} — {self.get_status_display()}"
