from django.contrib import admin

from .models import InternshipRequest


@admin.register(InternshipRequest)
class InternshipRequestAdmin(admin.ModelAdmin):
    list_display = ("company_name", "student", "status", "reviewed_by", "reviewed_at", "created_at")
    list_filter = ("status",)
    search_fields = (
        "company_name",
        "student__first_name",
        "student__last_name",
        "student__student_external_id",
    )
    raw_id_fields = ("student", "employer", "reviewed_by")
    readonly_fields = ("created_at", "updated_at")
