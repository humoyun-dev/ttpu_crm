from django.contrib import admin

from .models import AccessLink, AccessLog, FollowUp, Lead, LeadStudent


class LeadStudentInline(admin.TabularInline):
    model = LeadStudent
    extra = 0
    raw_id_fields = ("student",)


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("title", "employer", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("title",)
    raw_id_fields = ("employer", "created_by")
    inlines = [LeadStudentInline]


@admin.register(AccessLink)
class AccessLinkAdmin(admin.ModelAdmin):
    list_display = ("token", "lead", "expires_at", "revoked")
    list_filter = ("revoked",)
    raw_id_fields = ("lead",)
    readonly_fields = ("token",)


@admin.register(AccessLog)
class AccessLogAdmin(admin.ModelAdmin):
    list_display = ("access_link", "accessed_at", "ip")
    raw_id_fields = ("access_link",)


@admin.register(FollowUp)
class FollowUpAdmin(admin.ModelAdmin):
    list_display = ("lead_student", "stage", "outcome", "attempts", "flagged_for_staff")
    list_filter = ("stage", "flagged_for_staff")
    raw_id_fields = ("lead_student",)
