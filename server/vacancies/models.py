import uuid
from django.db import models
from common.models import BaseModel


class Vacancy(BaseModel):
    class EmploymentType(models.TextChoices):
        FULL_TIME  = "full_time",  "To'liq stavka"
        PART_TIME  = "part_time",  "Yarim stavka"
        INTERNSHIP = "internship", "Amaliyot / Internship"
        CONTRACT   = "contract",   "Shartnoma"
        REMOTE     = "remote",     "Masofaviy"

    class WorkFormat(models.TextChoices):
        ONSITE = "onsite", "Ofisda"
        REMOTE = "remote", "Masofaviy"
        HYBRID = "hybrid", "Aralash"

    class Status(models.TextChoices):
        DRAFT     = "draft",     "Qoralama"
        PUBLISHED = "published", "E'lon qilingan"
        CLOSED    = "closed",    "Yopilgan"
        ARCHIVED  = "archived",  "Arxivlangan"

    title           = models.CharField(max_length=255)
    company_name    = models.CharField(max_length=255)
    description     = models.TextField()
    requirements    = models.TextField(blank=True)
    employment_type = models.CharField(
        max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME
    )
    work_format = models.CharField(
        max_length=10, choices=WorkFormat.choices, blank=True,
        help_text="Ish joyi formati: ofisda/masofaviy/aralash",
    )
    schedule   = models.CharField(max_length=100, blank=True, help_text="5/2, 9:00-18:00")
    experience = models.CharField(max_length=100, blank=True, help_text="3-5 yil")
    tags       = models.CharField(max_length=255, blank=True, help_text="#python #backend")
    address    = models.CharField(max_length=255, blank=True, help_text="Ko'cha/bino manzili")
    image      = models.ImageField(upload_to="vacancies/", null=True, blank=True)

    region = models.ForeignKey(
        "catalog.CatalogItem",
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="vacancies_region",
        help_text="type=region bo'lishi kerak",
    )
    direction = models.ForeignKey(
        "catalog.CatalogItem",
        on_delete=models.SET_NULL, null=True, blank=True,
        related_name="vacancies_direction",
        help_text="Qaysi yo'nalish talabalariga mos (type=direction/program)",
    )

    salary_min      = models.PositiveIntegerField(null=True, blank=True)
    salary_max      = models.PositiveIntegerField(null=True, blank=True)
    salary_currency = models.CharField(max_length=10, default="UZS")

    apply_url     = models.URLField(blank=True)
    apply_contact = models.CharField(max_length=255, blank=True)
    deadline      = models.DateField(null=True, blank=True)

    status       = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    created_by   = models.ForeignKey(
        "authn.User", on_delete=models.SET_NULL, null=True,
        related_name="created_vacancies",
    )
    published_at = models.DateTimeField(null=True, blank=True)
    view_count   = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "vacancies_vacancy"
        ordering = ["-published_at", "-created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["employment_type"]),
            models.Index(fields=["region"]),
            models.Index(fields=["direction"]),
            models.Index(fields=["published_at"]),
        ]

    def __str__(self):
        return f"{self.title} @ {self.company_name} ({self.status})"


class VacancyChannelPost(BaseModel):
    class Action(models.TextChoices):
        CREATE = "create", "Yangi post"
        EDIT   = "edit",   "Tahrirlash"
        DELETE = "delete", "O'chirish"

    class Status(models.TextChoices):
        PENDING = "pending", "Navbatda"
        SENT    = "sent",    "Yuborildi"
        FAILED  = "failed",  "Xatolik"
        SKIPPED = "skipped", "O'tkazib yuborildi"

    class MediaType(models.TextChoices):
        TEXT  = "text",  "Matn"
        PHOTO = "photo", "Rasm"

    vacancy = models.ForeignKey(
        Vacancy, on_delete=models.CASCADE, related_name="channel_posts"
    )
    action = models.CharField(
        max_length=10, choices=Action.choices, default=Action.CREATE
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING
    )
    media_type = models.CharField(
        max_length=10, choices=MediaType.choices, default=MediaType.TEXT,
        help_text="CREATE da yuborilgan xabar turi (text/photo) — edit/delete uchun kerak",
    )

    idempotency_key     = models.CharField(max_length=128, unique=True)
    channel_id          = models.CharField(max_length=100)
    telegram_message_id = models.BigIntegerField(null=True, blank=True)

    attempts   = models.PositiveSmallIntegerField(default=0)
    last_error = models.TextField(blank=True)
    sent_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "vacancies_channel_post"
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["vacancy"]),
        ]

    def __str__(self):
        return f"{self.action} vacancy={self.vacancy_id} [{self.status}]"
