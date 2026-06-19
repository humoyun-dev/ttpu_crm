from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BotDocumentUploadView, DocumentViewSet

router = DefaultRouter()
router.register("documents", DocumentViewSet, basename="document")

urlpatterns = router.urls + [
    path("bot/document", BotDocumentUploadView.as_view(), name="bot-document-upload"),
]
