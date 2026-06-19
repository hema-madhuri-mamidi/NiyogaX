from django.db import models
from django.utils import timezone
from apps.accounts.models import ContractorProfile

class Job(models.Model):
    STATUS_CHOICES = [
        ("active", "Active"),
        ("filled", "Filled"),
        ("closed", "Closed"),
    ]

    contractor = models.ForeignKey(
        ContractorProfile,
        on_delete=models.CASCADE,
        related_name="jobs"
    )
    
    job_type = models.CharField(max_length=100)
    location = models.CharField(max_length=255)
    daily_salary = models.DecimalField(max_digits=10, decimal_places=2)
    workers_needed = models.IntegerField()
    days_of_work = models.IntegerField()
    shift_timing = models.CharField(max_length=100)
    urgent_hiring = models.BooleanField(default=False)
    phone_number = models.CharField(max_length=15)
    
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="active"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ["-created_at"]
    
    def __str__(self):
        return f"{self.job_type} - {self.location} ({self.get_status_display()})"
