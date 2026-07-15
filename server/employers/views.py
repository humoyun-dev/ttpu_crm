from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.permissions import IsAuthenticated

from common.permissions import IsViewerOrAdminReadOnly
from .models import Employer
from .serializers import EmployerSerializer


class EmployerViewSet(viewsets.ModelViewSet):
    queryset = Employer.objects.order_by("name")
    serializer_class = EmployerSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    # Global DEFAULT_FILTER_BACKENDS only has DjangoFilterBackend; declare the full
    # set here so ?search= actually takes effect on this viewset.
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["mou_status"]
    search_fields = ["name", "contact_email"]
