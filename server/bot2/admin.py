from django.contrib import admin
from django.db.models import Count

from bot2.models import (
    Bot2Student,
    Bot2StudentAccount,
    Bot2SurveyResponse,
    StudentRoster,
    ProgramEnrollment,
    Bot2Document,
)


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_readonly_fields(self, request, obj=None):
        field_names = [field.name for field in self.model._meta.fields]
        return tuple(set(field_names + list(super().get_readonly_fields(request, obj))))


@admin.register(StudentRoster)
class StudentRosterAdmin(ReadOnlyAdmin):
    list_display = ("student_external_id", "program", "course_year", "is_active", "created_at")
    list_filter = ("program", "course_year", "is_active")
    search_fields = ("student_external_id",)
    autocomplete_fields = ("program",)


class Bot2StudentAccountInline(admin.TabularInline):
    model = Bot2StudentAccount
    extra = 0
    can_delete = False
    fields = ("telegram_user_id", "username", "first_name", "last_name", "phone", "is_active", "last_seen_at")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Bot2Student)
class Bot2StudentAdmin(ReadOnlyAdmin):
    list_display = (
        "student_external_id",
        "roster",
        "telegram_user_id",
        "account_count",
        "username",
        "gender",
        "region",
        "created_at",
    )
    list_filter = ("gender", "region")
    list_select_related = ("roster", "region")
    search_fields = (
        "student_external_id", "username", "first_name", "last_name", "phone",
        "accounts__phone", "accounts__telegram_user_id",
    )
    autocomplete_fields = ("roster", "region")
    inlines = (Bot2StudentAccountInline,)

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_account_count=Count("accounts"))

    @admin.display(description="Accounts")
    def account_count(self, obj):
        return obj._account_count


@admin.register(Bot2StudentAccount)
class Bot2StudentAccountAdmin(ReadOnlyAdmin):
    list_display = ("telegram_user_id", "student", "phone", "username", "is_active", "last_seen_at", "created_at")
    list_filter = ("is_active",)
    search_fields = ("telegram_user_id", "phone", "username", "student__student_external_id")


@admin.register(Bot2SurveyResponse)
class Bot2SurveyResponseAdmin(ReadOnlyAdmin):
    list_display = (
        "student",
        "roster",
        "program",
        "course_year",
        "survey_campaign",
        "submitted_at",
        "created_at",
    )
    list_filter = ("survey_campaign", "program", "course_year")
    list_select_related = ("student", "roster", "program")
    search_fields = ("student__student_external_id", "student__username")
    autocomplete_fields = ("student", "roster", "program")


@admin.register(ProgramEnrollment)
class ProgramEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("program", "course_year", "student_count", "academic_year", "campaign", "is_active", "updated_at")
    list_filter = ("academic_year", "campaign", "course_year", "is_active", "program")
    search_fields = ("program__name", "notes")
    autocomplete_fields = ("program",)


@admin.register(Bot2Document)
class Bot2DocumentAdmin(admin.ModelAdmin):
    list_display = ["student", "doc_type", "original_filename", "file_size", "created_at"]
    list_filter = ["doc_type"]
    list_select_related = ("student",)
    search_fields = ["student__student_external_id"]
    readonly_fields = ["file_size", "mime_type", "created_at", "updated_at"]
