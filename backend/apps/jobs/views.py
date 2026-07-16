import logging
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, messaging
from django.db import DatabaseError, IntegrityError
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import Profile, ContractorProfile, WorkerProfile
from .models import Job, JobApplication
from .serializers import JobSerializer, JobApplicationSerializer

logger = logging.getLogger(__name__)

FIREBASE_CREDENTIALS_PATH = Path(__file__).resolve().parents[2] / "firebase_key.json"

if not firebase_admin._apps:
    try:
        cred = credentials.Certificate(str(FIREBASE_CREDENTIALS_PATH))
        firebase_admin.initialize_app(cred)
    except Exception as exc:
        logger.exception("Failed to initialize Firebase Admin SDK: %s", exc)


def send_fcm_notification(worker_profile, job_id, language):
    if not worker_profile or not getattr(worker_profile, "fcm_token", None):
        return False

    body = "🎉 మీ పని ఆమోదించబడింది!" if language == "te" else "🎉 Your job has been accepted!"
    payload = {
        "type": "job_accepted",
        "job_id": str(job_id),
        "language": language,
    }

    try:
        message = messaging.Message(
            token=worker_profile.fcm_token,
            notification=messaging.Notification(
                title="NiyogaX",
                body=body,
            ),
            data={key: str(value) for key, value in payload.items()},
        )
        messaging.send(message)
        return True
    except Exception as exc:
        error_str = str(exc).lower()
        # Check if token is invalid or expired
        if any(keyword in error_str for keyword in ["invalid", "unregistered", "registration token"]):
            logger.warning("FCM token invalid/expired for worker_profile_id=%s, clearing token", worker_profile.id)
            worker_profile.fcm_token = None
            worker_profile.save(update_fields=["fcm_token"])
            # Return True to not fail the acceptance workflow
            return True
        else:
            logger.exception("FCM notification failed for worker_profile_id=%s job_id=%s: %s", worker_profile.id, job_id, exc)
            return False


@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def list_create_jobs(request):
    """
    GET: List all active jobs
    POST: Create a new job (contractors only)
    """
    if request.method == 'GET':
        jobs = Job.objects.filter(status='active').order_by('-created_at')

        state = request.query_params.get('state', '').strip()
        district = request.query_params.get('district', '').strip()
        area = request.query_params.get('area', '').strip()

        if state:
            jobs = jobs.filter(state__iexact=state)
        if district:
            jobs = jobs.filter(district__iexact=district)
        if area:
            jobs = jobs.filter(area__iexact=area)

        serializer = JobSerializer(jobs, many=True)
        return Response(serializer.data)
    
    # POST - Create job (contractors only)
    user = request.user
    
    # Get contractor profile from authenticated user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response(
                {"error": "Only contractors can create jobs."},
                status=status.HTTP_403_FORBIDDEN
            )
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response(
            {"error": "User profile not found."},
            status=status.HTTP_404_NOT_FOUND
        )
    except ContractorProfile.DoesNotExist:
        return Response(
            {"error": "Contractor profile not found."},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Create job with contractor linked to authenticated user
    job_data = request.data.copy()
    job_data['contractor'] = contractor.id
    
    serializer = JobSerializer(data=job_data)
    if serializer.is_valid():
        serializer.save(contractor=contractor)
        logger.info(
            "Job created: id=%s contractor=%s job_type=%s location=%s",
            serializer.instance.id,
            contractor.id,
            serializer.instance.job_type,
            serializer.instance.location
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    else:
        logger.warning("Job creation validation failed: errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def create_job(request):
    """
    Create a new job posting.
    Only authenticated contractors can create jobs.
    Contractor is determined from the authenticated user, not from frontend input.
    """
    user = request.user
    
    # Get contractor profile from authenticated user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response(
                {"error": "Only contractors can create jobs."},
                status=status.HTTP_403_FORBIDDEN
            )
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response(
            {"error": "User profile not found."},
            status=status.HTTP_404_NOT_FOUND
        )
    except ContractorProfile.DoesNotExist:
        return Response(
            {"error": "Contractor profile not found."},
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Create job with contractor linked to authenticated user
    job_data = request.data.copy()
    job_data['contractor'] = contractor.id
    
    serializer = JobSerializer(data=job_data)
    if serializer.is_valid():
        serializer.save(contractor=contractor)
        logger.info(
            "Job created: id=%s contractor=%s job_type=%s location=%s",
            serializer.instance.id,
            contractor.id,
            serializer.instance.job_type,
            serializer.instance.location
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    else:
        logger.warning("Job creation validation failed: errors=%s", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def contractor_dashboard(request):
    """
    Return contractor dashboard stats and nearby workers.
    """
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response({"error": "Only contractors can view dashboard data."}, status=status.HTTP_403_FORBIDDEN)
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)
    except ContractorProfile.DoesNotExist:
        return Response({"error": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    contractor_jobs = Job.objects.filter(contractor=contractor)
    active_jobs = contractor_jobs.filter(status="active").count()
    total_jobs_posted = contractor_jobs.count()
    total_applications_received = JobApplication.objects.filter(job__contractor=contractor).count()
    total_workers_hired = JobApplication.objects.filter(job__contractor=contractor, status__in=["accepted", "confirmed", "hired"]).count()

    worker_profiles = WorkerProfile.objects.select_related("profile").all()

    def worker_sort_key(worker):
        contractor_state = (contractor.state or "").strip().lower()
        contractor_district = (contractor.district or "").strip().lower()
        contractor_area = (contractor.area or "").strip().lower()
        worker_state = (worker.state or "").strip().lower()
        worker_district = (worker.district or "").strip().lower()
        worker_area = (worker.area or "").strip().lower()

        if worker_area and worker_area == contractor_area:
            return (0, 0, 0, 0)
        if worker_district and worker_district == contractor_district:
            return (1, 0, 0, 0)
        if worker_state and worker_state == contractor_state:
            return (2, 0, 0, 0)
        return (3, 0, 0, 0)

    ordered_workers = sorted(worker_profiles, key=worker_sort_key)
    nearby_workers = []
    for worker in ordered_workers:
        nearby_workers.append({
            "id": worker.profile_id,
            "name": worker.name,
            "work_type": worker.work,
            "area": worker.area or "",
            "experience": worker.work_experience,
            "wage": str(worker.wage),
            "contact_number": worker.profile.phone,
        })

    return Response({
        "stats": {
            "active_jobs": active_jobs,
            "total_jobs_posted": total_jobs_posted,
            "total_applications_received": total_applications_received,
            "total_workers_hired": total_workers_hired,
        },
        "nearby_workers": nearby_workers,
    })


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def my_jobs(request):
    """
    Return jobs created by the authenticated contractor.
    """
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response({"error": "Only contractors can view their jobs."}, status=status.HTTP_403_FORBIDDEN)
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)
    except ContractorProfile.DoesNotExist:
        return Response({"error": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    qs = Job.objects.filter(contractor=contractor).order_by('-created_at')
    serializer = JobSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def job_detail(request, job_id):
    """
    Update or delete a job owned by the authenticated contractor.
    """
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response({"error": "Only contractors can modify jobs."}, status=status.HTTP_403_FORBIDDEN)
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)
    except ContractorProfile.DoesNotExist:
        return Response({"error": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        job = Job.objects.get(id=job_id)
    except Job.DoesNotExist:
        return Response({"error": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

    if job.contractor_id != contractor.id:
        return Response({"error": "You do not have permission to modify this job."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'PATCH':
        serializer = JobSerializer(job, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # DELETE
    job.delete()
    return Response({"message": "Job deleted successfully."}, status=status.HTTP_200_OK)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def apply_job(request, job_id):
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "worker":
            return Response({"error": "Only workers can apply for jobs."}, status=status.HTTP_403_FORBIDDEN)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        job = Job.objects.get(id=job_id)
    except Job.DoesNotExist:
        return Response({"error": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        if JobApplication.objects.filter(job=job, worker=profile).exists():
            return Response({"error": "You have already applied to this job."}, status=status.HTTP_400_BAD_REQUEST)
    except DatabaseError:
        logger.exception("Failed to check existing job application for job_id=%s worker_id=%s", job_id, profile.id)
        return Response({"error": "Unable to verify application status."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        application = JobApplication.objects.create(job=job, worker=profile)
    except IntegrityError:
        return Response({"error": "You have already applied to this job."}, status=status.HTTP_400_BAD_REQUEST)
    except DatabaseError:
        logger.exception("Failed to create job application for job_id=%s worker_id=%s", job_id, profile.id)
        return Response({"error": "Unable to apply to this job."}, status=status.HTTP_400_BAD_REQUEST)

    serializer = JobApplicationSerializer(application)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def my_applications(request):
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "worker":
            return Response({"error": "Only workers can view their applications."}, status=status.HTTP_403_FORBIDDEN)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)

    qs = JobApplication.objects.filter(worker=profile).order_by('-applied_at')
    serializer = JobApplicationSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def job_applications(request, job_id):
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response({"error": "Only contractors can view job applications."}, status=status.HTTP_403_FORBIDDEN)
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)
    except ContractorProfile.DoesNotExist:
        return Response({"error": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        job = Job.objects.get(id=job_id)
    except Job.DoesNotExist:
        return Response({"error": "Job not found."}, status=status.HTTP_404_NOT_FOUND)

    if job.contractor_id != contractor.id:
        return Response({"error": "You do not have permission to view applications for this job."}, status=status.HTTP_403_FORBIDDEN)

    qs = JobApplication.objects.filter(job=job).order_by('-applied_at')
    serializer = JobApplicationSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def accept_application(request, application_id):
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response({"error": "Only contractors can accept applications."}, status=status.HTTP_403_FORBIDDEN)
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)
    except ContractorProfile.DoesNotExist:
        return Response({"error": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        application = JobApplication.objects.select_related('job').get(id=application_id)
    except JobApplication.DoesNotExist:
        return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

    if application.job.contractor_id != contractor.id:
        return Response({"error": "You do not have permission to manage this application."}, status=status.HTTP_403_FORBIDDEN)

    if application.status == "accepted":
        return Response({"error": "Application is already accepted."}, status=status.HTTP_400_BAD_REQUEST)
    if application.status == "rejected":
        return Response({"error": "Cannot accept a rejected application."}, status=status.HTTP_400_BAD_REQUEST)
    if application.status == "hired":
        return Response({"error": "Cannot modify a hired application."}, status=status.HTTP_400_BAD_REQUEST)

    application.status = "accepted"
    application.save(update_fields=["status"])

    worker_profile = None
    worker_language = "en"
    try:
        worker_profile = WorkerProfile.objects.select_related("profile").get(profile=application.worker)
        worker_language = worker_profile.profile.language or "en"
    except WorkerProfile.DoesNotExist:
        logger.warning("WorkerProfile not found for application_id=%s", application.id)

    try:
        send_fcm_notification(worker_profile, application.job_id, worker_language)
    except Exception as exc:
        logger.exception("Notification dispatch failed for application_id=%s: %s", application.id, exc)

    serializer = JobApplicationSerializer(application)
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def reject_application(request, application_id):
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "contractor":
            return Response({"error": "Only contractors can reject applications."}, status=status.HTTP_403_FORBIDDEN)
        contractor = ContractorProfile.objects.get(profile=profile)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)
    except ContractorProfile.DoesNotExist:
        return Response({"error": "Contractor profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        application = JobApplication.objects.select_related('job').get(id=application_id)
    except JobApplication.DoesNotExist:
        return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

    if application.job.contractor_id != contractor.id:
        return Response({"error": "You do not have permission to manage this application."}, status=status.HTTP_403_FORBIDDEN)

    if application.status == "rejected":
        return Response({"error": "Application is already rejected."}, status=status.HTTP_400_BAD_REQUEST)
    if application.status == "hired":
        return Response({"error": "Cannot modify a hired application."}, status=status.HTTP_400_BAD_REQUEST)

    application.status = "rejected"
    application.save(update_fields=["status"])
    serializer = JobApplicationSerializer(application)
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def confirm_application(request, application_id):
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "worker":
            return Response({"error": "Only workers can confirm applications."}, status=status.HTTP_403_FORBIDDEN)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        application = JobApplication.objects.select_related('job').get(id=application_id)
    except JobApplication.DoesNotExist:
        return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

    if application.worker_id != profile.id:
        return Response({"error": "You do not have permission to manage this application."}, status=status.HTTP_403_FORBIDDEN)

    if application.status == "confirmed":
        return Response({"error": "Application is already confirmed."}, status=status.HTTP_400_BAD_REQUEST)
    if application.status == "unavailable":
        return Response({"error": "Cannot confirm an unavailable application."}, status=status.HTTP_400_BAD_REQUEST)
    if application.status != "accepted":
        return Response({"error": "Only accepted applications can be confirmed."}, status=status.HTTP_400_BAD_REQUEST)

    application.status = "confirmed"
    application.save(update_fields=["status"])
    serializer = JobApplicationSerializer(application)
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def mark_unavailable(request, application_id):
    user = request.user
    try:
        profile = Profile.objects.get(user=user)
        if profile.role != "worker":
            return Response({"error": "Only workers can update application availability."}, status=status.HTTP_403_FORBIDDEN)
    except Profile.DoesNotExist:
        return Response({"error": "User profile not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        application = JobApplication.objects.select_related('job').get(id=application_id)
    except JobApplication.DoesNotExist:
        return Response({"error": "Application not found."}, status=status.HTTP_404_NOT_FOUND)

    if application.worker_id != profile.id:
        return Response({"error": "You do not have permission to manage this application."}, status=status.HTTP_403_FORBIDDEN)

    if application.status == "unavailable":
        return Response({"error": "Application is already marked unavailable."}, status=status.HTTP_400_BAD_REQUEST)
    if application.status == "confirmed":
        return Response({"error": "Cannot mark a confirmed application unavailable."}, status=status.HTTP_400_BAD_REQUEST)
    if application.status != "accepted":
        return Response({"error": "Only accepted applications can be marked unavailable."}, status=status.HTTP_400_BAD_REQUEST)

    application.status = "unavailable"
    application.save(update_fields=["status"])
    serializer = JobApplicationSerializer(application)
    return Response(serializer.data)
