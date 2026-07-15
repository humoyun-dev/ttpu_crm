from django.contrib import admin
from .models import Vacancy, VacancyChannelPost


@admin.register(Vacancy)
class VacancyAdmin(admin.ModelAdmin):
    list_display  = ["title", "company_name", "employment_type", "status", "published_at"]
    list_filter   = ["status", "employment_type", "region"]
    search_fields = ["title", "company_name"]


@admin.register(VacancyChannelPost)
class VacancyChannelPostAdmin(admin.ModelAdmin):
    list_display  = ["vacancy", "action", "status", "attempts", "sent_at"]
    list_filter   = ["status", "action"]
    readonly_fields = ["idempotency_key", "telegram_message_id", "last_error"]

    def has_change_permission(self, request, obj=None):
        return False  # append-only
