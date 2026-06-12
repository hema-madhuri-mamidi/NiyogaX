from django.urls import path
from . import views

urlpatterns = [
    path('test-gemini/', views.test_gemini, name='test_gemini'),
    path('list-models/', views.list_models, name='list_models'),
    path('niyo/chat/', views.niyo_chat, name='niyo_chat'),
]

