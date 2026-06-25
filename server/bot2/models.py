from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from catalog.models import CatalogItem
from common.models import BaseModel


class StudentRoster(BaseModel):
    student_external_id = models.CharField(max_length=100, unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    roster_campaign = models.CharField(max_length=64, default="default")
    program = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="roster_programs",
        null=True,
        blank=True,
    )
    course_year = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        null=True,
        blank=True,
        help_text="1-4 for active students, 5 for graduated; null if not yet known"
    )
    is_active = models.BooleanField(default=True)
    birth_date = models.DateField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("student_external_id",)
        indexes = [
            models.Index(fields=["program"]),
            models.Index(fields=["course_year"]),
            models.Index(fields=["is_active"]),
            models.Index(fields=["roster_campaign"]),
        ]

    def __str__(self) -> str:
        full = f"{self.first_name} {self.last_name}".strip()
        return f"{self.student_external_id}" + (f" — {full}" if full else "")

    def clean(self):
        allowed = (CatalogItem.ItemType.PROGRAM, CatalogItem.ItemType.DIRECTION)
        if self.program and self.program.type not in allowed:
            raise ValidationError(
                "program must reference a catalog item with type=program or direction."
            )

    def save(self, *args, **kwargs):
        # Enforce clean() on every write path (admin CRUD + bot auto-create),
        # not only the roster-import path which called full_clean() explicitly.
        self.full_clean()
        return super().save(*args, **kwargs)


class Bot2Student(BaseModel):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"
        UNSPECIFIED = "unspecified", "Unspecified"

    student_external_id = models.CharField(max_length=100, unique=True)
    roster = models.ForeignKey(
        StudentRoster, on_delete=models.CASCADE, related_name="students"
    )
    # Denormalized "primary / most-recently-active" Telegram link for convenience and
    # analytics. NOT unique — a student may have several linked accounts (see
    # Bot2StudentAccount, the source of truth). Null only when no account is active.
    telegram_user_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    username = models.CharField(max_length=150, blank=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    gender = models.CharField(
        max_length=32, choices=Gender.choices, default=Gender.UNSPECIFIED
    )
    phone = models.CharField(max_length=50, blank=True)
    language = models.CharField(
        max_length=2,
        choices=[("uz", "Uzbek"), ("ru", "Russian")],
        default="uz",
    )
    state = models.CharField(
        max_length=64,
        default="registered",
        help_text="FSM state persisted to DB; bot resume on restart",
    )
    consent = models.BooleanField(default=False)
    is_job_seeking = models.BooleanField(default=False)
    region = models.ForeignKey(
        CatalogItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bot2_students",
    )

    class Meta:
        ordering = ("student_external_id",)
        # No explicit single-field indexes: student_external_id and telegram_user_id
        # are unique=True, which already creates an index for each.

    def clean(self):
        # Region validation
        if self.region and self.region.type != CatalogItem.ItemType.REGION:
            raise ValidationError("region must reference a catalog item with type=region.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Bot2 Student {self.student_external_id}"


class Bot2StudentAccount(BaseModel):
    """One Telegram account that has logged in as a given student.

    A student may log in from several Telegram accounts (different phones/devices)
    using the same student_external_id; every one is kept and linked here instead of
    overwriting a single field. `telegram_user_id` is globally unique — one Telegram
    account maps to at most one student at a time (re-using it for another student_id
    moves the link). `/logout` flips `is_active` to False but keeps the row.
    """
    student = models.ForeignKey(
        Bot2Student, on_delete=models.CASCADE, related_name="accounts"
    )
    telegram_user_id = models.BigIntegerField(unique=True)
    username = models.CharField(max_length=150, blank=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-last_seen_at", "-created_at")
        indexes = [
            models.Index(fields=["student", "is_active"]),
        ]

    def __str__(self) -> str:
        flag = "" if self.is_active else " (inactive)"
        return f"Account tg={self.telegram_user_id} → {self.student.student_external_id}{flag}"


class Bot2SurveyResponse(BaseModel):
    student = models.ForeignKey(
        Bot2Student, on_delete=models.CASCADE, related_name="survey_responses"
    )
    roster = models.ForeignKey(
        StudentRoster, on_delete=models.CASCADE, related_name="survey_responses"
    )
    program = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="bot2_program_surveys",
        null=True,
        blank=True,
    )
    course_year = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        null=True,
        blank=True,
        help_text="1-4 for active students, 5 for graduated; null if not collected"
    )
    survey_campaign = models.CharField(max_length=64, default="default")
    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        help_text="Bot-supplied dedup key (UUIDv4); prevents double-submit after constraint removal",
    )
    source = models.CharField(
        max_length=10,
        choices=[("survey", "Survey"), ("lead", "Lead Placement")],
        default="survey",
    )
    employment_status = models.CharField(max_length=100, blank=True)
    employment_company = models.CharField(max_length=255, blank=True)
    employment_role = models.CharField(max_length=255, blank=True)
    suggestions = models.TextField(blank=True)
    consents = models.JSONField(default=dict, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-submitted_at", "-created_at")
        constraints = [
            models.CheckConstraint(
                condition=Q(course_year__isnull=True) | (Q(course_year__gte=1) & Q(course_year__lte=5)),
                name="survey_course_year_between_1_and_5",
            ),
            # uq_survey_student_campaign removed (migration 0013) → append-only
        ]
        indexes = [
            models.Index(fields=["survey_campaign"]),
            models.Index(fields=["submitted_at"]),
            models.Index(fields=["roster", "survey_campaign"]),
        ]

    def clean(self):
        if self.roster and self.student and self.student.roster_id != self.roster_id:
            raise ValidationError("Survey roster must match student's roster.")
        # Only validate program/course_year consistency when both sides are set
        if self.roster and self.program_id and self.roster.program_id and self.roster.program_id != self.program_id:
            raise ValidationError("Survey program must match roster program.")
        if self.roster and self.course_year and self.roster.course_year and self.roster.course_year != self.course_year:
            raise ValidationError("Survey course_year must match roster course_year.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Survey {self.survey_campaign} for {self.student}"


class Bot2Document(BaseModel):
    class DocType(models.TextChoices):
        CV = "cv", "CV"
        CERTIFICATE = "certificate", "Certificate"

    student = models.ForeignKey(
        Bot2Student, on_delete=models.CASCADE, related_name="bot2_documents"
    )
    survey = models.ForeignKey(
        Bot2SurveyResponse,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bot2_documents",
    )
    doc_type = models.CharField(max_length=20, choices=DocType.choices)
    file = models.FileField(upload_to="bot2/docs/%Y/%m/")
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"{self.doc_type} — {self.student.student_external_id}"


class ProgramEnrollment(BaseModel):
    """Stores total student count per program and course year."""
    
    program = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="enrollments",
    )
    course_year = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="1-4 for active students, 5 for graduated"
    )
    student_count = models.PositiveIntegerField(
        default=0,
        help_text="Total number of students"
    )
    academic_year = models.CharField(
        max_length=20,
        default="2025-2026",
        help_text="Academic year, e.g. 2025-2026"
    )
    campaign = models.CharField(
        max_length=64,
        default="default",
        help_text="Campaign identifier"
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("program", "course_year")
        indexes = [
            models.Index(fields=["program", "course_year"]),
            models.Index(fields=["academic_year"]),
            models.Index(fields=["campaign"]),
            models.Index(fields=["is_active"]),
        ]
        unique_together = [["program", "course_year", "academic_year", "campaign"]]

    def __str__(self) -> str:
        return f"{self.program.name} - {self.course_year}-kurs: {self.student_count}"


class BotFsmState(models.Model):
    """Persistent FSM storage for aiogram — survives bot restarts."""

    telegram_user_id = models.BigIntegerField(unique=True, db_index=True)
    state = models.CharField(max_length=128, null=True, blank=True)
    data = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("telegram_user_id",)

    def __str__(self) -> str:
        return f"FsmState(user={self.telegram_user_id}, state={self.state})"
