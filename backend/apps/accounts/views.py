from django.shortcuts import render

# Create your views here.

import logging

from django.conf import settings
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from rest_framework.authentication import TokenAuthentication
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated


def normalize_phone(phone):
    if not phone:
        return ""
    digits = "".join([c for c in str(phone) if c.isdigit()])
    return digits[-10:]
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from twilio.rest import Client

from .models import ContractorProfile, OTP, Profile, WorkerProfile

logger = logging.getLogger(__name__)

logger.info("Twilio config loaded account_sid=%s verify_service_sid=%s", settings.TWILIO_ACCOUNT_SID, settings.TWILIO_VERIFY_SERVICE_SID)
client = Client(
    settings.TWILIO_ACCOUNT_SID,
    settings.TWILIO_AUTH_TOKEN
)

VERIFY_SERVICE_SID = settings.TWILIO_VERIFY_SERVICE_SID

@api_view(['POST'])

def send_otp(request):
    raw_phone = request.data.get("phone")
    phone = normalize_phone(raw_phone)
    logger.info("send_otp request phone=%s normalized=%s", raw_phone, phone)

    client.verify.v2.services(
        VERIFY_SERVICE_SID
    ).verifications.create(
        to=f"+91{phone}",
        channel="sms"
    )
    return Response({
        "message": "OTP sent successfully"
    })


@api_view(['POST'])
def verify_otp(request):
    raw_phone = request.data.get("phone")
    phone = normalize_phone(raw_phone)
    otp = request.data.get("otp")
    logger.info("verify_otp request phone=%s normalized=%s otp=%s", raw_phone, phone, otp)

    logger.info("Twilio verify request service_sid=%s phone=%s otp=%s", VERIFY_SERVICE_SID, phone, otp)
    verification_check = client.verify.v2.services(
        VERIFY_SERVICE_SID
    ).verification_checks.create(
        to=f"+91{phone}",
        code=otp
    )
    verified = verification_check.status == "approved"
    logger.info("Twilio verification for %s status=%s", phone, verification_check.status)

    latest_otp = OTP.objects.filter(phone=phone).order_by("-created_at").first()
    if latest_otp:
        logger.info("Stored OTP record for %s: otp=%s verified=%s expires_at=%s", phone, latest_otp.otp, latest_otp.verified, latest_otp.expires_at)
    else:
        logger.info("No stored OTP record found for %s", phone)

    OTP.objects.create(
        phone=phone,
        otp=otp or "",
        verified=verified,
        expires_at=timezone.now() + timedelta(minutes=10)
    )

    token_key = None
    user_exists = False
    role = None
    user_id = None
    if verified:
        user = User.objects.filter(username=phone).first()
        user_exists = bool(user)
        if user:
            token, _ = Token.objects.get_or_create(user=user)
            token_key = token.key
            user_id = user.id
            profile = Profile.objects.filter(user=user).first()
            role = profile.role if profile else None
            logger.info("Token issued for user=%s phone=%s token=%s role=%s", user.id, phone, token_key, role)
        else:
            logger.info("OTP verified for phone=%s but no user exists yet", phone)

    return Response({
        "verified": verified,
        "user_exists": user_exists,
        "token": token_key,
        "role": role,
        "user_id": user_id,
        "phone": phone,
    })

@api_view(["POST"])
def register_worker(request):
    data = request.data
    raw_phone = data.get("phone")
    phone = normalize_phone(raw_phone)
    
    if User.objects.filter(username=phone).exists():
        return Response(
        {"error": "User already registered"},
        status=400
        )
    user = User.objects.create_user(
        username=phone,
        password="temp123"  # change later
    )

    profile = Profile.objects.create(
        user=user,
        role="worker",
        phone=phone,
        language=data.get("language", "te")
    )

    worker_profile = WorkerProfile.objects.create(
        profile=profile,
        name=data.get("name"),
        age=data.get("age"),
        work=data.get("workType"),
        location=data.get("location"),
        state=data.get("state"),
        district=data.get("district"),
        area=data.get("area"),
        work_experience=data.get("exp"),
        wage=data.get("wage"),
        gender=data.get("gender"),
        emergency_contact=data.get("emergencyPhone", "")
    )

    token, _ = Token.objects.get_or_create(user=user)
    logger.info("Worker registered: user=%s profile=%s worker=%s token=%s", user.id, profile.id, worker_profile.id, token.key)

    return Response({
        "message": "Worker registered",
        "token": token.key,
        "profile": {
            "id": profile.id,
            "user_id": user.id,
            "role": profile.role,
            "phone": profile.phone,
            "language": profile.language,
            "name": worker_profile.name,
            "age": worker_profile.age,
            "workType": worker_profile.work,
            "location": worker_profile.location,
            "state": worker_profile.state,
            "district": worker_profile.district,
            "area": worker_profile.area,
            "exp": worker_profile.work_experience,
            "wage": str(worker_profile.wage),
            "gender": worker_profile.gender,
            "emergencyPhone": worker_profile.emergency_contact,
        }
    })


@api_view(["POST"])
def register_contractor(request):
    data = request.data
    raw_phone = data.get("phone")
    phone = normalize_phone(raw_phone)
    logger.info("CONTRACTOR DATA: %s", request.data)
    logger.info("CONTRACTOR PHONE raw=%s normalized=%s", raw_phone, phone)
    print("CONTRACTOR PHONE:", phone)
    if User.objects.filter(username=phone).exists():
        return Response(
            {"error": "User already exists"},
            status=400
        )

    user = User.objects.create_user(
        username=phone,
        password=phone
    )

    profile = Profile.objects.create(
        user=user,
        role="contractor",
        phone=phone,
        language=data.get("language")
    )

    contractor_profile = ContractorProfile.objects.create(
        profile=profile,
        name=data.get("name"),
        company_name=data.get("company"),
        work_type=data.get("workType"),
        location=data.get("location"),
        state=data.get("state"),
        district=data.get("district"),
        area=data.get("area"),
        daily_wage=data.get("budget"),
        workers_needed=data.get("workers"),
        gst_number=data.get("gst"),
    )

    token, _ = Token.objects.get_or_create(user=user)

    logger.info("Contractor registered: user=%s profile=%s contractor=%s token=%s", user.id, profile.id, contractor_profile.id, token.key)

    return Response({
        "message": "Contractor registered",
        "token": token.key,
        "profile": {
            "id": profile.id,
            "user_id": user.id,
            "role": profile.role,
            "phone": profile.phone,
            "language": profile.language,
            "name": contractor_profile.name,
            "company": contractor_profile.company_name,
            "workType": contractor_profile.work_type,
            "location": contractor_profile.location,
            "state": contractor_profile.state,
            "district": contractor_profile.district,
            "area": contractor_profile.area,
            "budget": str(contractor_profile.daily_wage),
            "workers": contractor_profile.workers_needed,
            "gst": contractor_profile.gst_number,
        }
    })

@api_view(["POST"])
def check_worker(request):
    raw_phone = request.data.get("phone")
    phone = normalize_phone(raw_phone)

    return Response({
        "exists": User.objects.filter(username=phone).exists()
    })

@api_view(["POST"])
def check_contractor(request):
    raw_phone = request.data.get("phone")
    phone = normalize_phone(raw_phone)

    # 1. find Profile using phone
    profile = Profile.objects.filter(phone=phone).first()

    if not profile:
        return Response({"exists": False})

    # 2. check contractor linked to that profile
    exists = ContractorProfile.objects.filter(profile=profile).exists()

    return Response({"exists": exists})

@api_view(["POST"])
def get_worker_profile(request):
    raw_phone = request.data.get("phone")
    phone = normalize_phone(raw_phone)
    
    # Validate phone is provided
    if not phone:
        return Response({
            "success": False,
            "error": "Phone number is required"
        }, status=400)
    
    # Find the Profile where phone matches and role = "worker"
    profile = Profile.objects.filter(phone=phone, role="worker").first()
    
    if not profile:
        return Response({
            "success": False,
            "error": "Worker profile not found"
        }, status=404)
    
    # Retrieve the linked WorkerProfile using OneToOne relationship
    try:
        worker_profile = profile.workerprofile
    except WorkerProfile.DoesNotExist:
        return Response({
            "success": False,
            "error": "Worker profile not found"
        }, status=404)
    
    # Return profile data with correct field mappings
    return Response({
        "success": True,
        "profile": {
            "name": worker_profile.name,
            "age": worker_profile.age,
            "workType": worker_profile.work,
            "location": worker_profile.location,
            "exp": worker_profile.work_experience,
            "wage": str(worker_profile.wage),
            "gender": worker_profile.gender,
            "emergencyPhone": worker_profile.emergency_contact
        }
    })


@api_view(["GET"])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def get_profile(request):
    auth_header = request.META.get('HTTP_AUTHORIZATION')
    logger.info("get_profile called auth=%s user=%s", auth_header, request.user)

    if not request.user or not request.user.is_authenticated:
        return Response({
            "success": False,
            "error": "Authentication credentials were not provided."
        }, status=401)

    profile = Profile.objects.filter(user=request.user).first()
    if not profile:
        logger.info("get_profile no Profile found for user=%s", request.user.id)
        return Response({
            "success": False,
            "error": "Profile not found"
        }, status=404)

    response_data = {
        "id": profile.id,
        "user_id": profile.user.id,
        "role": profile.role,
        "phone": profile.phone,
        "language": profile.language,
    }

    try:
        if profile.role == "worker":
            worker_profile = profile.workerprofile
            response_data.update({
                "name": worker_profile.name,
                "age": worker_profile.age,
                "workType": worker_profile.work,
                "location": worker_profile.location,
                "exp": worker_profile.work_experience,
                "wage": str(worker_profile.wage),
                "gender": worker_profile.gender,
                "emergencyPhone": worker_profile.emergency_contact,
            })
        else:
            contractor_profile = profile.contractorprofile
            response_data.update({
                "name": contractor_profile.name,
                "company": contractor_profile.company_name,
                "workType": contractor_profile.work_type,
                "location": contractor_profile.location,
                "budget": str(contractor_profile.daily_wage),
                "workers": contractor_profile.workers_needed,
                "gst": contractor_profile.gst_number,
            })
    except (WorkerProfile.DoesNotExist, ContractorProfile.DoesNotExist):
        return Response({
            "success": False,
            "error": "Detailed profile not found"
        }, status=404)

    # Log the response payload for debugging contractor profile load issues
    logger.info("get_profile returning profile: %s", response_data)
    return Response({
        "success": True,
        "profile": response_data
    })
    