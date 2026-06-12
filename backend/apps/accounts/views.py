from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import OTP
import random
from django.utils import timezone
from datetime import timedelta
from twilio.rest import Client
from django.contrib.auth.models import User
from .models import Profile, WorkerProfile, ContractorProfile
from django.conf import settings

client = Client(
    settings.TWILIO_ACCOUNT_SID,
    settings.TWILIO_AUTH_TOKEN
)

VERIFY_SERVICE_SID = settings.TWILIO_VERIFY_SERVICE_SID

@api_view(['POST'])

def send_otp(request):
    phone = request.data.get("phone")

    # if settings.USE_TEST_OTP:
    #     print("TEST OTP: 123456")
    #     return Response({"message": "OTP sent (test mode)"})

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
    phone = request.data.get("phone")
    otp = request.data.get("otp")
    # if settings.USE_TEST_OTP:
    #     if otp == "123456":
    #         return Response({"verified": True})
    #     return Response({"verified": False})
    
    verification_check = client.verify.v2.services(
        VERIFY_SERVICE_SID
    ).verification_checks.create(
        to=f"+91{phone}",
        code=otp
    )
    return Response({
        "verified": verification_check.status == "approved"
    })

@api_view(["POST"])
def register_worker(request):
    data = request.data

    phone = data.get("phone")
    
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

    WorkerProfile.objects.create(
        profile=profile,
        name=data.get("name"),
        age=data.get("age"),
        work=data.get("workType"),
        location=data.get("location"),
        work_experience=data.get("exp"),
        wage=data.get("wage"),
        gender=data.get("gender"),
        emergency_contact=data.get("emergencyPhone", "")
    )

    return Response({"success": True})


@api_view(["POST"])
def register_contractor(request):
    data = request.data
    print("CONTRACTOR DATA:", request.data)
    phone = data.get("phone")
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

    ContractorProfile.objects.create(
    profile=profile,
    name=data.get("name"),
    company_name=data.get("company"),
    work_type=data.get("workType"),
    location=data.get("location"),
    daily_wage=data.get("budget"),
    workers_needed=data.get("workers"),
    gst_number=data.get("gst"),
    )
    return Response({"message": "Contractor registered"})

@api_view(["POST"])
def check_worker(request):
    phone = request.data.get("phone")

    return Response({
        "exists": User.objects.filter(username=phone).exists()
    })

@api_view(["POST"])
def check_contractor(request):
    phone = request.data.get("phone")

    # 1. find Profile using phone
    profile = Profile.objects.filter(phone=phone).first()

    if not profile:
        return Response({"exists": False})

    # 2. check contractor linked to that profile
    exists = ContractorProfile.objects.filter(profile=profile).exists()

    return Response({"exists": exists})