from django.contrib import admin

from .models import Employer


@admin.register(Employer)
class EmployerAdmin(admin.ModelAdmin):
    list_display = ("name", "industry", "mou_status", "location", "contact_email")
    list_filter = ("mou_status",)
    search_fields = ("name", "contact_email", "contact_name", "industry")
