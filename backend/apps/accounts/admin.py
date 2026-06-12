from django.contrib import admin
from .models import Profile, WorkerProfile, ContractorProfile

admin.site.register(Profile)
admin.site.register(WorkerProfile)
admin.site.register(ContractorProfile)