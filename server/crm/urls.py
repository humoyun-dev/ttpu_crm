from rest_framework.routers import DefaultRouter

from .views import FollowUpViewSet, LeadViewSet

router = DefaultRouter()
router.register("leads", LeadViewSet, basename="lead")
router.register("followups", FollowUpViewSet, basename="followup")

urlpatterns = router.urls
