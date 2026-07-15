from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.accounts.models import ContractorProfile, Profile
from .models import Job


class JobLocationFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.worker_user = User.objects.create_user(username="worker-filter", password="pass123")
        self.worker_profile = Profile.objects.create(
            user=self.worker_user,
            role="worker",
            phone="9999999999",
            language="te",
        )
        self.worker_token = Token.objects.create(user=self.worker_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.worker_token.key}")

        self.contractor_user = User.objects.create_user(username="contractor-filter", password="pass123")
        self.contractor_profile = Profile.objects.create(
            user=self.contractor_user,
            role="contractor",
            phone="8888888888",
            language="te",
        )
        self.contractor_token = Token.objects.create(user=self.contractor_user)
        self.contractor = ContractorProfile.objects.create(
            profile=self.contractor_profile,
            name="Test Contractor",
            company_name="Test Co",
            daily_wage=500,
            work_type="painting",
            workers_needed=2,
            location="Madhapur",
            state="Telangana",
            district="Hyderabad",
            area="Madhapur",
            gst_number="",
        )

        self.other_contractor_user = User.objects.create_user(username="contractor-filter-2", password="pass123")
        self.other_contractor_profile = Profile.objects.create(
            user=self.other_contractor_user,
            role="contractor",
            phone="7777777777",
            language="te",
        )
        self.other_contractor = ContractorProfile.objects.create(
            profile=self.other_contractor_profile,
            name="Other Contractor",
            company_name="Other Co",
            daily_wage=450,
            work_type="painting",
            workers_needed=3,
            location="Gachibowli",
            state="Telangana",
            district="Ranga Reddy",
            area="Gachibowli",
            gst_number="",
        )

        self.job_1 = Job.objects.create(
            contractor=self.contractor,
            job_type="Painting",
            location="Madhapur",
            daily_salary=500,
            workers_needed=2,
            days_of_work=3,
            shift_timing="Day",
            phone_number="1111111111",
        )
        self.job_2 = Job.objects.create(
            contractor=self.other_contractor,
            job_type="Painting",
            location="Gachibowli",
            daily_salary=450,
            workers_needed=3,
            days_of_work=2,
            shift_timing="Day",
            phone_number="2222222222",
        )

    def test_list_jobs_filters_by_district_from_contractor_profile(self):
        response = self.client.get("/api/jobs/", {"district": "Hyderabad"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["id"], self.job_1.id)

    def test_list_jobs_filters_by_area_from_contractor_profile(self):
        response = self.client.get("/api/jobs/", {"area": "Madhapur"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["id"], self.job_1.id)

    def test_job_list_returns_job_level_location_fields(self):
        self.job_1.state = "Tamil Nadu"
        self.job_1.district = "Chennai"
        self.job_1.area = "Anna Nagar"
        self.job_1.location = "Near Metro Station"
        self.job_1.save(update_fields=["state", "district", "area", "location"])

        response = self.client.get("/api/jobs/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload[0]["state"], "Tamil Nadu")
        self.assertEqual(payload[0]["district"], "Chennai")
        self.assertEqual(payload[0]["area"], "Anna Nagar")
        self.assertEqual(payload[0]["location"], "Near Metro Station")

    def test_contractor_can_create_job_with_structured_location_fields(self):
        contractor_client = APIClient()
        contractor_client.credentials(HTTP_AUTHORIZATION=f"Token {self.contractor_token.key}")

        response = contractor_client.post(
            "/api/jobs/",
            {
                "job_type": "Painting",
                "location": "Near Bus Stand",
                "state": "Karnataka",
                "district": "Bengaluru",
                "area": "Whitefield",
                "daily_salary": 600,
                "workers_needed": 3,
                "days_of_work": 4,
                "shift_timing": "Day",
                "phone_number": "1234567890",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["state"], "Karnataka")
        self.assertEqual(response.json()["district"], "Bengaluru")
        self.assertEqual(response.json()["area"], "Whitefield")
        self.assertEqual(response.json()["location"], "Near Bus Stand")
