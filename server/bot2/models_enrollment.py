from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from catalog.models import CatalogItem
from common.models import BaseModel


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
