from django.core.exceptions import FieldDoesNotExist
from django.test import TestCase

from .models import ContractorProfile, WorkerProfile


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
