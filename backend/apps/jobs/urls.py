from django.urls import path
from . import views

urlpatterns = [
    path("", views.list_create_jobs, name="list_create_jobs"),
    path("my/", views.my_jobs, name="my_jobs"),
    path("applications/my/", views.my_applications, name="my_applications"),
    path("<int:job_id>/apply/", views.apply_job, name="job_apply"),
    path("<int:job_id>/applications/", views.job_applications, name="job_applications"),
    path("<int:job_id>/", views.job_detail, name="job_detail"),
]
