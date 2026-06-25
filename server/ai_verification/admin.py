from django.contrib import admin

from .models import DocumentVerification


@admin.register(DocumentVerification)
class DocumentVerificationAdmin(admin.ModelAdmin):
    list_display = [
        "student", "document_type", "status",
        "confidence_level", "confidence_score",
        "final_decision", "created_at",
    ]
    list_filter = ["status", "document_type", "confidence_level", "final_decision"]
    search_fields = ["student__first_name", "student__last_name", "student__student_external_id"]
    readonly_fields = [
        "extracted_data", "flags", "ai_summary",
        "confidence_score", "confidence_level", "processed_at",
        "created_at", "updated_at",
    ]
