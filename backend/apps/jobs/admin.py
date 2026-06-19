from django.contrib import admin
from .models import Job

@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("id", "job_type", "location", "daily_salary", "workers_needed", "status", "created_at")
    list_filter = ("status", "job_type", "urgent_hiring", "created_at")
    search_fields = ("job_type", "location", "contractor__name", "phone_number")
    readonly_fields = ("created_at", "updated_at")
    fieldsets = (
        ("Job Details", {
            "fields": ("contractor", "job_type", "location", "daily_salary")
        }),
        ("Requirements", {
            "fields": ("workers_needed", "days_of_work", "shift_timing", "urgent_hiring")
        }),
        ("Contact", {
            "fields": ("phone_number",)
        }),
        ("Status", {
            "fields": ("status", "created_at", "updated_at")
        }),
    )
