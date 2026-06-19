from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import Employer
from .serializers import EmployerSerializer


class EmployerViewSet(viewsets.ModelViewSet):
    queryset = Employer.objects.select_related("industry").order_by("name")
    serializer_class = EmployerSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["mou_status"]
    search_fields = ["name", "contact_email"]
