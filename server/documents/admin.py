from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("student", "type", "status", "reviewed_by", "created_at")
    list_filter = ("status", "type")
    raw_id_fields = ("student", "reviewed_by")
    readonly_fields = ("ai_result", "created_at", "updated_at")
