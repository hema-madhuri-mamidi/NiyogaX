from rest_framework import serializers
from .models import Job, JobApplication

class JobSerializer(serializers.ModelSerializer):
    contractor_name = serializers.CharField(
        source="contractor.name",
        read_only=True
    )
    company_name = serializers.CharField(
        source="contractor.company_name",
        read_only=True
    )
    
    class Meta:
        model = Job
        fields = [
            "id",
            "job_type",
            "location",
            "daily_salary",
            "workers_needed",
            "days_of_work",
            "shift_timing",
            "urgent_hiring",
            "phone_number",
            "status",
            "created_at",
            "updated_at",
            "contractor_name",
            "company_name",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at", "contractor_name", "company_name"]
    
    def validate_job_type(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Job type is required.")
        return value
    
    def validate_location(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Location is required.")
        return value
    
    def validate_daily_salary(self, value):
        if value <= 0:
            raise serializers.ValidationError("Daily salary must be greater than 0.")
        return value
    
    def validate_workers_needed(self, value):
        if value <= 0:
            raise serializers.ValidationError("Workers needed must be at least 1.")
        return value
    
    def validate_days_of_work(self, value):
        if value <= 0:
            raise serializers.ValidationError("Days of work must be at least 1.")
        return value
    
    def validate_shift_timing(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Shift timing is required.")
        return value
    
    def validate_phone_number(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Phone number is required.")
        return value


class JobApplicationSerializer(serializers.ModelSerializer):
    worker_name = serializers.SerializerMethodField()
    worker_phone = serializers.SerializerMethodField()

    class Meta:
        model = JobApplication
        fields = [
            "id",
            "job",
            "worker",
            "worker_name",
            "worker_phone",
            "status",
            "applied_at",
        ]
        read_only_fields = ["id", "status", "applied_at"]

    def get_worker_name(self, obj):
        worker_profile = getattr(obj.worker, 'workerprofile', None)
        return getattr(worker_profile, 'name', None) or ""

    def get_worker_phone(self, obj):
        return getattr(obj.worker, 'phone', "")
