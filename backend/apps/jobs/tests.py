from django.contrib.auth.models import User
from django.test import TestCase
from unittest.mock import patch
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.accounts.models import ContractorProfile, Profile, WorkerProfile
from .models import Job, JobApplication


class ContractorDashboardTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.contractor_user = User.objects.create_user(username="contractor-dashboard", password="pass123")
        self.contractor_profile = Profile.objects.create(
            user=self.contractor_user,
            role="contractor",
            phone="1111111111",
            language="te",
        )
        self.contractor_token = Token.objects.create(user=self.contractor_user)
        self.contractor = ContractorProfile.objects.create(
            profile=self.contractor_profile,
            name="Dashboard Contractor",
            company_name="Dash Co",
            daily_wage=500,
            work_type="painting",
            workers_needed=2,
            location="Madhapur",
            state="Telangana",
            district="Hyderabad",
            area="Madhapur",
            gst_number="",
        )

        self.job_1 = Job.objects.create(
            contractor=self.contractor,
            job_type="Painting",
            location="Madhapur",
            state="Telangana",
            district="Hyderabad",
            area="Madhapur",
            daily_salary=500,
            workers_needed=2,
            days_of_work=3,
            shift_timing="Day",
            phone_number="1111111111",
        )
        self.job_2 = Job.objects.create(
            contractor=self.contractor,
            job_type="Electrician",
            location="Gachibowli",
            state="Telangana",
            district="Hyderabad",
            area="Gachibowli",
            daily_salary=600,
            workers_needed=3,
            days_of_work=2,
            shift_timing="Night",
            phone_number="2222222222",
        )
        self.job_2.status = "filled"
        self.job_2.save(update_fields=["status"])

        self.worker_user_1 = User.objects.create_user(username="worker-area", password="pass123")
        self.worker_profile_1 = Profile.objects.create(
            user=self.worker_user_1,
            role="worker",
            phone="2222222222",
            language="te",
        )
        WorkerProfile.objects.create(
            profile=self.worker_profile_1,
            name="Same Area Worker",
            age=28,
            work="Painter",
            location="Madhapur",
            state="Telangana",
            district="Hyderabad",
            area="Madhapur",
            work_experience=3,
            wage=450,
            gender="male",
            emergency_contact="3333333333",
        )

        self.worker_user_2 = User.objects.create_user(username="worker-district", password="pass123")
        self.worker_profile_2 = Profile.objects.create(
            user=self.worker_user_2,
            role="worker",
            phone="3333333333",
            language="te",
        )
        WorkerProfile.objects.create(
            profile=self.worker_profile_2,
            name="Same District Worker",
            age=32,
            work="Electrician",
            location="Banjara Hills",
            state="Telangana",
            district="Hyderabad",
            area="Banjara Hills",
            work_experience=7,
            wage=550,
            gender="male",
            emergency_contact="4444444444",
        )

        self.worker_user_3 = User.objects.create_user(username="worker-state", password="pass123")
        self.worker_profile_3 = Profile.objects.create(
            user=self.worker_user_3,
            role="worker",
            phone="4444444444",
            language="te",
        )
        WorkerProfile.objects.create(
            profile=self.worker_profile_3,
            name="Same State Worker",
            age=36,
            work="Driver",
            location="Warangal",
            state="Telangana",
            district="Warangal",
            area="Hanamkonda",
            work_experience=10,
            wage=600,
            gender="male",
            emergency_contact="5555555555",
        )

        self.worker_user_4 = User.objects.create_user(username="worker-other", password="pass123")
        self.worker_profile_4 = Profile.objects.create(
            user=self.worker_user_4,
            role="worker",
            phone="5555555555",
            language="te",
        )
        WorkerProfile.objects.create(
            profile=self.worker_profile_4,
            name="Other State Worker",
            age=25,
            work="Mechanic",
            location="Chennai",
            state="Tamil Nadu",
            district="Chennai",
            area="Anna Nagar",
            work_experience=2,
            wage=400,
            gender="male",
            emergency_contact="6666666666",
        )

        JobApplication.objects.create(job=self.job_1, worker=self.worker_profile_1, status="applied")
        JobApplication.objects.create(job=self.job_1, worker=self.worker_profile_2, status="confirmed")
        JobApplication.objects.create(job=self.job_2, worker=self.worker_profile_3, status="hired")

        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.contractor_token.key}")

    def test_contractors_dashboard_returns_stats_and_ordered_workers(self):
        response = self.client.get("/api/jobs/dashboard/")

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(payload["stats"]["active_jobs"], 1)
        self.assertEqual(payload["stats"]["total_jobs_posted"], 2)
        self.assertEqual(payload["stats"]["total_applications_received"], 3)
        self.assertEqual(payload["stats"]["total_workers_hired"], 2)

        workers = payload["nearby_workers"]
        self.assertEqual([w["name"] for w in workers[:4]], [
            "Same Area Worker",
            "Same District Worker",
            "Same State Worker",
            "Other State Worker",
        ])
        self.assertEqual(workers[0]["area"], "Madhapur")
        self.assertEqual(workers[0]["contact_number"], "2222222222")


class AcceptApplicationNotificationTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.contractor_user = User.objects.create_user(username="contractor-notify", password="pass123")
        self.contractor_profile = Profile.objects.create(
            user=self.contractor_user,
            role="contractor",
            phone="1212121212",
            language="te",
        )
        self.contractor_token = Token.objects.create(user=self.contractor_user)
        self.contractor = ContractorProfile.objects.create(
            profile=self.contractor_profile,
            name="Notify Contractor",
            company_name="Notify Co",
            daily_wage=500,
            work_type="painting",
            workers_needed=1,
            location="Madhapur",
            state="Telangana",
            district="Hyderabad",
            area="Madhapur",
            gst_number="",
        )

        self.job = Job.objects.create(
            contractor=self.contractor,
            job_type="Painting",
            location="Madhapur",
            daily_salary=500,
            workers_needed=1,
            days_of_work=2,
            shift_timing="Day",
            phone_number="1212121212",
        )

        self.worker_user = User.objects.create_user(username="worker-notify", password="pass123")
        self.worker_profile = Profile.objects.create(
            user=self.worker_user,
            role="worker",
            phone="1313131313",
            language="en",
        )
        self.worker_details = WorkerProfile.objects.create(
            profile=self.worker_profile,
            name="Notify Worker",
            age=29,
            work="Painter",
            location="Madhapur",
            state="Telangana",
            district="Hyderabad",
            area="Madhapur",
            work_experience=3,
            wage=450,
            gender="male",
            emergency_contact="1414141414",
        )
        self.application = JobApplication.objects.create(job=self.job, worker=self.worker_profile, status="applied")

    @patch("apps.jobs.views.send_fcm_notification")
    def test_accept_application_still_succeeds_when_notification_fails(self, mock_send):
        mock_send.side_effect = Exception("boom")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.contractor_token.key}")

        response = self.client.post(f"/api/jobs/applications/{self.application.id}/accept/")

        self.assertEqual(response.status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, "accepted")
        mock_send.assert_called_once()


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
