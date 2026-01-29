from django.contrib import admin

from bot1.models import (
    Admissions2026Application,
    Bot1Applicant,
    CampusTourRequest,
    FoundationRequest,
    PolitoAcademyRequest,
)


class ReadOnlyAdmin(admin.ModelAdmin):
    """Make models read-only in Django admin."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        field_names = [field.name for field in self.model._meta.fields]
        return tuple(set(field_names + list(super().get_readonly_fields(request, obj))))


@admin.register(Bot1Applicant)
class Bot1ApplicantAdmin(ReadOnlyAdmin):
    list_display = (
        "telegram_user_id",
        "telegram_chat_id",
        "username",
        "first_name",
        "last_name",
        "phone",
        "email",
        "region",
        "created_at",
    )
    search_fields = ("telegram_user_id", "username", "first_name", "last_name", "email")
    list_filter = ("region",)


@admin.register(Admissions2026Application)
class Admissions2026ApplicationAdmin(ReadOnlyAdmin):
    list_display = ("applicant", "direction", "track", "status", "submitted_at", "created_at")
    list_filter = ("status", "direction", "track")
    search_fields = ("applicant__username", "applicant__first_name", "applicant__last_name")


@admin.register(CampusTourRequest)
class CampusTourRequestAdmin(ReadOnlyAdmin):
    list_display = ("applicant", "preferred_date", "status", "submitted_at", "created_at")
    list_filter = ("status",)
    search_fields = ("applicant__username", "applicant__first_name", "applicant__last_name")


@admin.register(FoundationRequest)
class FoundationRequestAdmin(ReadOnlyAdmin):
    list_display = ("applicant", "status", "submitted_at", "created_at")
    list_filter = ("status",)
    search_fields = ("applicant__username", "applicant__first_name", "applicant__last_name")


@admin.register(PolitoAcademyRequest)
class PolitoAcademyRequestAdmin(ReadOnlyAdmin):
    list_display = ("applicant", "subject", "status", "submitted_at", "created_at")
    list_filter = ("status", "subject")
    search_fields = ("applicant__username", "applicant__first_name", "applicant__last_name")
