from django.db import models

# Create your models here.

from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta


class Profile(models.Model):
    ROLE_CHOICES = [
        ("worker", "Worker"),
        ("contractor", "Contractor"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE)

    role = models.CharField(max_length=20, choices=ROLE_CHOICES)

    phone = models.CharField(max_length=15, unique=True)

    language = models.CharField(max_length=50)

    created_at = models.DateTimeField(auto_now_add=True)

class WorkerProfile(models.Model):
    profile = models.OneToOneField(Profile, on_delete=models.CASCADE)

    name = models.CharField(max_length=100)
    age = models.IntegerField()

    work = models.CharField(max_length=100)

    location = models.CharField(max_length=255)
    state = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    area = models.CharField(max_length=100, blank=True, null=True)

    work_experience = models.IntegerField(default=0)

    wage = models.DecimalField(max_digits=10, decimal_places=2)

    gender = models.CharField(max_length=10)

    emergency_contact = models.CharField(max_length=15)
    fcm_token = models.CharField(max_length=255, blank=True, null=True)
    
class ContractorProfile(models.Model):
    profile = models.OneToOneField(Profile, on_delete=models.CASCADE)

    name = models.CharField(max_length=100)

    company_name = models.CharField(max_length=200)

    daily_wage = models.DecimalField(max_digits=10, decimal_places=2)

    work_type = models.CharField(max_length=100)

    workers_needed = models.IntegerField()

    location = models.CharField(max_length=255)
    state = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    area = models.CharField(max_length=100, blank=True, null=True)

    gst_number = models.CharField(
        max_length=20,
        blank=True,
        null=True
    )

class OTP(models.Model):
    phone = models.CharField(max_length=15)
    otp = models.CharField(max_length=6)
    verified = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def is_expired(self):
        return timezone.now() > self.expires_at