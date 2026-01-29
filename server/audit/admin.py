from django.contrib import admin

from audit.models import AuditLog


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


@admin.register(AuditLog)
class AuditLogAdmin(ReadOnlyAdmin):
    list_display = ("action", "actor_type", "actor_user", "actor_service", "entity_table", "created_at")
    list_filter = ("action", "actor_type", "entity_table")
    search_fields = ("actor_service", "actor_user__email", "entity_table", "entity_id")
