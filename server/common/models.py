import uuid

from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ("-created_at",)


class UUIDModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class BaseModel(UUIDModel, TimeStampedModel):
    class Meta:
        abstract = True


class ServiceToken(BaseModel):
    class Service(models.TextChoices):
        BOT1 = "bot1", "Bot1"
        BOT2 = "bot2", "Bot2"
        DASHBOARD = "dashboard", "Dashboard"
        OTHER = "other", "Other"

    service_name = models.CharField(max_length=50, choices=Service.choices)
    token_hash = models.CharField(max_length=64, unique=True)
    scope = models.CharField(max_length=100, default="default")
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ("service_name", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["service_name", "scope"],
                condition=models.Q(is_active=True),
                name="active_service_scope_unique",
            )
        ]

    def __str__(self) -> str:  # pragma: no cover - convenience
        return f"ServiceToken({self.service_name}, scope={self.scope})"
