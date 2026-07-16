from django.urls import path
from .views import send_otp, verify_otp, register_worker, register_contractor, check_worker, check_contractor, get_worker_profile, get_profile, save_fcm_token

urlpatterns = [
    path("send-otp/", send_otp),
    path("verify-otp/", verify_otp),
    path("register-worker/", register_worker),
    path("register-contractor/", register_contractor),
    path("check-worker/", check_worker),
    path("check-contractor/", check_contractor),
    path("get-worker-profile/", get_worker_profile),
    path("profile/", get_profile),
    path("save-fcm-token/", save_fcm_token),
]