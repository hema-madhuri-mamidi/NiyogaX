from django.contrib import admin

# Register your models here.
from .models import Profile, WorkerProfile, ContractorProfile

admin.site.register(Profile)
admin.site.register(WorkerProfile)
admin.site.register(ContractorProfile)