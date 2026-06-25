from django.urls import path

from . import views

urlpatterns = [
    path("submit", views.submit_document, name="ai-verify-submit"),
    # Xarajat kuzatuvi (uuid yo'llaridan OLDIN — "usage" UUID emas)
    path("usage/summary", views.usage_summary, name="ai-usage-summary"),
    path("usage/daily", views.usage_daily, name="ai-usage-daily"),
    path("usage/estimate", views.usage_estimate, name="ai-usage-estimate"),
    path("<uuid:pk>", views.verification_detail, name="ai-verify-detail"),
    path("<uuid:pk>/review", views.review_verification, name="ai-verify-review"),
    path("student/<uuid:student_id>", views.student_verifications, name="ai-verify-student"),
]
