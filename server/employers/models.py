from django.db import models

from common.models import BaseModel


class Employer(BaseModel):
    class Mou(models.TextChoices):
        NEGOTIATING = "negotiating", "Negotiating"
        SIGNED = "signed", "Signed"
        EXPIRED = "expired", "Expired"

    name = models.CharField(max_length=255)
    # Soha — erkin matn (IT, Moliya, ...). Avval CatalogItem FK edi, lekin
    # industry katalogi ishlatilmagani uchun erkin matnga o'tkazildi.
    industry = models.CharField(max_length=255, blank=True, default="")
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
        ]

    def __str__(self) -> str:
        return self.name
