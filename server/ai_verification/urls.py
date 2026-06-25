from django.urls import path

from . import views

urlpatterns = [
    path("submit", views.submit_document, name="ai-verify-submit"),
    path("<uuid:pk>", views.verification_detail, name="ai-verify-detail"),
    path("<uuid:pk>/review", views.review_verification, name="ai-verify-review"),
    path("student/<uuid:student_id>", views.student_verifications, name="ai-verify-student"),
]
