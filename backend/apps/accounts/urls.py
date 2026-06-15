from django.urls import path
from .views import send_otp, verify_otp,register_worker, register_contractor,check_worker, check_contractor

urlpatterns = [
    path("send-otp/", send_otp),
    path("verify-otp/", verify_otp),
    path("register-worker/", register_worker),
    path("register-contractor/", register_contractor),
    path("check-worker/", check_worker),
    path("check-contractor/", check_contractor),
]