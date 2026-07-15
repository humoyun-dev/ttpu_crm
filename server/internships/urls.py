from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    InternshipRequestViewSet,
    bot_employers,
    bot_internship_create,
    bot_internship_status,
)

router = DefaultRouter()
router.register("internships", InternshipRequestViewSet, basename="internship")

urlpatterns = router.urls + [
    # Bot (service token)
    path("bot/internship", bot_internship_create, name="bot-internship-create"),
    path("bot/internship/status", bot_internship_status, name="bot-internship-status"),
    path("bot/employers", bot_employers, name="bot-employers"),
]
