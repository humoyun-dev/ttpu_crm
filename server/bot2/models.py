from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from catalog.models import CatalogItem
from common.models import BaseModel


class StudentRoster(BaseModel):
    student_external_id = models.CharField(max_length=100, unique=True)
    roster_campaign = models.CharField(max_length=64, default="default")
    program = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="roster_programs",
    )
    course_year = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(4)]
    )
    is_active = models.BooleanField(default=True)
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
        return f"Roster {self.student_external_id}"

    def clean(self):
        if self.program and self.program.type != CatalogItem.ItemType.PROGRAM:
            raise ValidationError("program must reference a catalog item with type=program.")


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
    telegram_user_id = models.BigIntegerField(null=True, blank=True, unique=True)
    username = models.CharField(max_length=150, blank=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    gender = models.CharField(
        max_length=32, choices=Gender.choices, default=Gender.UNSPECIFIED
    )
    phone = models.CharField(max_length=50, blank=True)
    region = models.ForeignKey(
        CatalogItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bot2_students",
    )

    class Meta:
        ordering = ("student_external_id",)
        indexes = [
            models.Index(fields=["student_external_id"]),
            models.Index(fields=["telegram_user_id"]),
        ]

    def clean(self):
        # Region validation
        if self.region and self.region.type != CatalogItem.ItemType.REGION:
            raise ValidationError("region must reference a catalog item with type=region.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Bot2 Student {self.student_external_id}"


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
    )
    course_year = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(4)]
    )
    survey_campaign = models.CharField(max_length=64, default="default")
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
                check=Q(course_year__gte=1) & Q(course_year__lte=4),
                name="survey_course_year_between_1_and_4",
            ),
        ]
        indexes = [
            models.Index(fields=["survey_campaign"]),
            models.Index(fields=["submitted_at"]),
            models.Index(fields=["roster", "survey_campaign"]),
        ]

    def clean(self):
        if self.roster and self.student and self.student.roster_id != self.roster_id:
            raise ValidationError("Survey roster must match student's roster.")
        if self.roster and self.program_id and self.roster.program_id != self.program_id:
            raise ValidationError("Survey program must match roster program.")
        if self.roster and self.course_year and self.roster.course_year != self.course_year:
            raise ValidationError("Survey course_year must match roster course_year.")

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"Survey {self.survey_campaign} for {self.student}"


class ProgramEnrollment(BaseModel):
    """Stores total student count per program and course year."""
    
    program = models.ForeignKey(
        CatalogItem,
        on_delete=models.PROTECT,
        related_name="enrollments",
    )
    course_year = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(4)],
        help_text="1, 2, 3, or 4"
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
