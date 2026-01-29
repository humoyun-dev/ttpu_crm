from django.conf import settings
from django.db import models

from common.models import BaseModel


class AuditLog(BaseModel):
    class ActorType(models.TextChoices):
        USER = "user", "User"
        SERVICE = "service", "Service"

    class Action(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"
        LOGIN = "login", "Login"
        LOGOUT = "logout", "Logout"
        OTHER = "other", "Other"

    actor_type = models.CharField(max_length=20, choices=ActorType.choices)
    actor_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    actor_service = models.CharField(max_length=100, blank=True)
    action = models.CharField(max_length=20, choices=Action.choices, default=Action.OTHER)
    entity_table = models.CharField(max_length=255)
    entity_id = models.UUIDField(null=True, blank=True)
    before_data = models.JSONField(default=dict, blank=True)
    after_data = models.JSONField(default=dict, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["actor_type"]),
            models.Index(fields=["action"]),
            models.Index(fields=["entity_table"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        actor = self.actor_service or (self.actor_user.email if self.actor_user else "unknown")
        return f"{self.action} by {actor} on {self.entity_table}"
