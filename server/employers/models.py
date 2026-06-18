from django.db import models

from catalog.models import CatalogItem
from common.models import BaseModel


class Employer(BaseModel):
    class Mou(models.TextChoices):
        NEGOTIATING = "negotiating", "Negotiating"
        SIGNED = "signed", "Signed"
        EXPIRED = "expired", "Expired"

    name = models.CharField(max_length=255)
    industry = models.ForeignKey(
        CatalogItem,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    location = models.CharField(max_length=255, blank=True)
    logo = models.ImageField(upload_to="employers/", null=True, blank=True)
    description = models.TextField(blank=True)
    contact_name = models.CharField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)
    mou_status = models.CharField(
        max_length=12, choices=Mou.choices, default=Mou.NEGOTIATING
    )

    class Meta:
        ordering = ("name",)
        indexes = [
            models.Index(fields=["mou_status"]),
            models.Index(fields=["industry"]),
        ]

    def __str__(self) -> str:
        return self.name
