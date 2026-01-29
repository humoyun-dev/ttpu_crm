from django.contrib import admin

from catalog.models import CatalogItem, CatalogRelation


@admin.register(CatalogItem)
class CatalogItemAdmin(admin.ModelAdmin):
    list_display = ("name", "type", "code", "is_active", "sort_order", "parent")
    list_filter = ("type", "is_active")
    search_fields = ("name", "code")
    ordering = ("type", "sort_order", "name")
    autocomplete_fields = ("parent",)
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(CatalogRelation)
class CatalogRelationAdmin(admin.ModelAdmin):
    list_display = ("from_item", "to_item", "relation_type", "created_at")
    search_fields = ("from_item__name", "to_item__name", "relation_type")
    autocomplete_fields = ("from_item", "to_item")
    readonly_fields = ("id", "created_at", "updated_at")
