from django.contrib import admin

from bot2.models import Bot2Student, Bot2SurveyResponse, StudentRoster, ProgramEnrollment


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


@admin.register(Bot2Student)
class Bot2StudentAdmin(ReadOnlyAdmin):
    list_display = (
        "student_external_id",
        "roster",
        "telegram_user_id",
        "username",
        "gender",
        "region",
        "created_at",
    )
    list_filter = ("gender", "region")
    search_fields = ("student_external_id", "username", "first_name", "last_name", "phone")
    autocomplete_fields = ("roster", "region")


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
    search_fields = ("student__student_external_id", "student__username")
    autocomplete_fields = ("student", "roster", "program")


@admin.register(ProgramEnrollment)
class ProgramEnrollmentAdmin(admin.ModelAdmin):
    list_display = ("program", "course_year", "student_count", "academic_year", "campaign", "is_active", "updated_at")
    list_filter = ("academic_year", "campaign", "course_year", "is_active", "program")
    search_fields = ("program__name", "notes")
    autocomplete_fields = ("program",)
