from django.contrib.auth.models import User
from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import ContractorProfile, Profile, WorkerProfile


class LocationFieldsTests(TestCase):
    def test_worker_profile_has_optional_location_fields(self):
        for field_name in ["state", "district", "area"]:
            with self.subTest(field=field_name):
                field = WorkerProfile._meta.get_field(field_name)
                self.assertTrue(field.blank)
                self.assertTrue(field.null)
                self.assertEqual(field.max_length, 100)

    def test_contractor_profile_has_optional_location_fields(self):
        for field_name in ["state", "district", "area"]:
            with self.subTest(field=field_name):
                field = ContractorProfile._meta.get_field(field_name)
                self.assertTrue(field.blank)
                self.assertTrue(field.null)
                self.assertEqual(field.max_length, 100)


class SaveFcmTokenTests(TestCase):
    def test_worker_can_save_fcm_token(self):
        user = User.objects.create_user(username="9999999999", password="test123")
        profile = Profile.objects.create(
            user=user,
            role="worker",
            phone="9999999999",
            language="te",
        )
        worker_profile = WorkerProfile.objects.create(
            profile=profile,
            name="Test Worker",
            age=25,
            work="Driver",
            location="Hyderabad",
            wage=100,
            gender="male",
            emergency_contact="9999999999",
        )
        token = Token.objects.create(user=user)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = client.post("/api/accounts/save-fcm-token/", {"token": "abc123"}, format="json")

        self.assertEqual(response.status_code, 200)
        worker_profile.refresh_from_db()
        self.assertEqual(worker_profile.fcm_token, "abc123")
