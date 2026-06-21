import logging
from django.db import DatabaseError, IntegrityError
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import Profile, ContractorProfile
from .models import Job, JobApplication
from .serializers import JobSerializer, JobApplicationSerializer

logger = logging.getLogger(__name__)


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
