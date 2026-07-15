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
    state = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    district = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    area = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    class Meta:
        model = Job
        fields = [
            "id",
            "job_type",
            "location",
            "state",
            "district",
            "area",
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
        return (value or "").strip()

    def validate_state(self, value):
        return (value or "").strip()

    def validate_district(self, value):
        return (value or "").strip()

    def validate_area(self, value):
        return (value or "").strip()

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
    contractor_name = serializers.SerializerMethodField()
    contractor_phone = serializers.SerializerMethodField()
    job_type = serializers.SerializerMethodField()
    job_location = serializers.SerializerMethodField()
    daily_salary = serializers.SerializerMethodField()
    job_status = serializers.SerializerMethodField()

    class Meta:
        model = JobApplication
        fields = [
            "id",
            "job",
            "worker",
            "worker_name",
            "worker_phone",
            "contractor_name",
            "contractor_phone",
            "status",
            "applied_at",
            "job_type",
            "job_location",
            "daily_salary",
            "job_status",
        ]
        read_only_fields = ["id", "status", "applied_at", "job_type", "job_location", "daily_salary", "job_status", "contractor_name", "contractor_phone"]

    def get_worker_name(self, obj):
        worker_profile = getattr(obj.worker, 'workerprofile', None)
        return getattr(worker_profile, 'name', None) or ""

    def get_worker_phone(self, obj):
        return getattr(obj.worker, 'phone', "")

    def get_job_type(self, obj):
        return getattr(obj.job, 'job_type', "")

    def get_job_location(self, obj):
        return getattr(obj.job, 'location', "")

    def get_daily_salary(self, obj):
        return str(getattr(obj.job, 'daily_salary', ""))

    def get_contractor_name(self, obj):
        contractor = getattr(obj.job, 'contractor', None)
        if not contractor:
            return ""
        return getattr(contractor, 'name', None) or getattr(contractor, 'company_name', "")

    def get_contractor_phone(self, obj):
        if obj.status != "confirmed":
            return None
        contractor = getattr(obj.job, 'contractor', None)
        if not contractor:
            return None
        profile = getattr(contractor, 'profile', None)
        return getattr(profile, 'phone', None)

    def get_job_status(self, obj):
        return getattr(obj.job, 'status', "")
