from django.db import models
from django.db.models import Q, Value
from django.db.models.functions import Coalesce

from common.models import BaseModel


class CatalogItem(BaseModel):
    class ItemType(models.TextChoices):
        PROGRAM = "program", "Program"
        DIRECTION = "direction", "Direction"
        SUBJECT = "subject", "Subject"
        TRACK = "track", "Track"
        REGION = "region", "Region"
        OTHER = "other", "Other"

    type = models.CharField(max_length=50, choices=ItemType.choices)
    code = models.CharField(max_length=100, null=True, blank=True)
    name = models.CharField(max_length=255)
    name_uz = models.CharField(max_length=255, blank=True, default="")
    name_ru = models.CharField(max_length=255, blank=True, default="")
    name_en = models.CharField(max_length=255, blank=True, default="")
    parent = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        related_name="children",
        on_delete=models.SET_NULL,
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("type", "sort_order", "name")
        indexes = [
            models.Index(fields=["type", "code"]),
            models.Index(fields=["type", "is_active"]),
        ]
        constraints = [
            # unique when code is provided
            models.UniqueConstraint(
                fields=["type", "code"],
                condition=~Q(code__isnull=True),
                name="catalog_item_type_code_unique_nonnull",
            ),
            # treat NULL/blank codes as empty string to avoid accidental duplicates
            models.UniqueConstraint(
                "type",
                Coalesce("code", models.Value("")),
                name="catalog_item_type_code_unique_with_nulls",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.type}: {self.name}"


class CatalogRelation(BaseModel):
    class RelationType(models.TextChoices):
        PROGRAM_DIRECTION = "program_direction", "Program -> Direction"
        PROGRAM_TRACK = "program_track", "Program -> Track"
        SUBJECT_PREREQ = "subject_prereq", "Subject prerequisite"
        CUSTOM = "custom", "Custom"

    from_item = models.ForeignKey(
        CatalogItem, on_delete=models.CASCADE, related_name="outgoing_relations"
    )
    to_item = models.ForeignKey(
        CatalogItem, on_delete=models.CASCADE, related_name="incoming_relations"
    )
    relation_type = models.CharField(
        max_length=100, choices=RelationType.choices, default=RelationType.CUSTOM
    )

    class Meta:
        verbose_name = "Catalog Relation"
        verbose_name_plural = "Catalog Relations"
        constraints = [
            models.UniqueConstraint(
                fields=["from_item", "to_item", "relation_type"],
                name="unique_catalog_relation",
            )
        ]

    def __str__(self) -> str:
        return f"{self.from_item} -> {self.to_item} ({self.relation_type})"
