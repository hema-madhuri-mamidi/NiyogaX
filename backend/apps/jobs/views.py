import logging
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.authentication import TokenAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from apps.accounts.models import Profile, ContractorProfile
from .models import Job
from .serializers import JobSerializer

logger = logging.getLogger(__name__)


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
