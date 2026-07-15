from django.contrib import admin

from .models import DocumentVerification, AIUsageLog


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


@admin.register(AIUsageLog)
class AIUsageLogAdmin(admin.ModelAdmin):
    list_display = [
        "created_at", "model_name", "operation",
        "input_tokens", "output_tokens", "thinking_tokens",
        "total_tokens", "cost_usd", "status",
    ]
    list_filter = ["model_name", "operation", "status", "created_at"]
    readonly_fields = [
        "verification", "model_name", "operation",
        "input_tokens", "output_tokens", "thinking_tokens",
        "total_tokens", "cost_usd", "status", "error_message",
        "latency_ms", "created_at",
    ]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False  # Faqat avtomatik yaratiladi

    def has_change_permission(self, request, obj=None):
        return False  # Append-only
