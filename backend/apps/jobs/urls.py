from django.urls import path
from . import views

urlpatterns = [
    path("", views.create_job, name="create_job"),
    path("my/", views.my_jobs, name="my_jobs"),
    path("<int:job_id>/", views.job_detail, name="job_detail"),
]
