from django.urls import path
from . import views

urlpatterns = [
    path("", views.create_job, name="create_job"),
    path("my/", views.my_jobs, name="my_jobs"),
]
