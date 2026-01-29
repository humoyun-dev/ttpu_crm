from django.db import models
from django.utils import timezone

from catalog.models import CatalogItem
from common.models import BaseModel


class SubmittableModel(BaseModel):
    class Meta:
        abstract = True

    def sync_submitted_at(self):
        status = getattr(self, "status", None)
        if status is None or not hasattr(self, "submitted_at"):
            return
        if status == ApplicationStatus.NEW:
            self.submitted_at = None
        elif not self.submitted_at:
            self.submitted_at = timezone.now()

    def save(self, *args, **kwargs):
        self.sync_submitted_at()
        return super().save(*args, **kwargs)


class Bot1Applicant(BaseModel):
    telegram_user_id = models.BigIntegerField(unique=True)
    telegram_chat_id = models.BigIntegerField(null=True, blank=True)
    username = models.CharField(max_length=150, blank=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    region = models.ForeignKey(
        CatalogItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="bot1_applicants",
    )

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["telegram_user_id"]),
            models.Index(fields=["telegram_chat_id"]),
        ]

    def __str__(self) -> str:
        name = self.username or self.first_name or str(self.telegram_user_id)
        return f"Applicant {name}"


class ApplicationStatus(models.TextChoices):
    NEW = "new", "New"
    SUBMITTED = "submitted", "Submitted"
    IN_PROGRESS = "in_progress", "In Progress"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class Admissions2026Application(SubmittableModel):
    applicant = models.ForeignKey(
        Bot1Applicant, on_delete=models.CASCADE, related_name="admissions_2026_applications"
    )
    direction = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="admissions_direction_applications",
    )
    track = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="admissions_track_applications",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=32, choices=ApplicationStatus.choices, default=ApplicationStatus.NEW
    )
    answers = models.JSONField(default=dict, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-submitted_at", "-created_at")
        verbose_name = "Admissions 2026 Application"

    def __str__(self) -> str:
        return f"Admissions application for {self.applicant}"


class CampusTourRequest(SubmittableModel):
    applicant = models.ForeignKey(
        Bot1Applicant, on_delete=models.CASCADE, related_name="campus_tour_requests"
    )
    preferred_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=32, choices=ApplicationStatus.choices, default=ApplicationStatus.NEW
    )
    answers = models.JSONField(default=dict, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-submitted_at", "-created_at")

    def __str__(self) -> str:
        return f"Campus tour request for {self.applicant}"


class FoundationRequest(SubmittableModel):
    applicant = models.ForeignKey(
        Bot1Applicant, on_delete=models.CASCADE, related_name="foundation_requests"
    )
    status = models.CharField(
        max_length=32, choices=ApplicationStatus.choices, default=ApplicationStatus.NEW
    )
    answers = models.JSONField(default=dict, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-submitted_at", "-created_at")

    def __str__(self) -> str:
        return f"Foundation request for {self.applicant}"


class PolitoAcademyRequest(SubmittableModel):
    applicant = models.ForeignKey(
        Bot1Applicant, on_delete=models.CASCADE, related_name="polito_academy_requests"
    )
    subject = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="polito_academy_subjects",
        null=True,
        blank=True,
    )
    status = models.CharField(
        max_length=32, choices=ApplicationStatus.choices, default=ApplicationStatus.NEW
    )
    answers = models.JSONField(default=dict, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-submitted_at", "-created_at")

    def __str__(self) -> str:
        return f"Polito academy request for {self.applicant}"
