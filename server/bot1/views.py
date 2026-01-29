from django.db import transaction
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from audit.utils import log_audit
from bot1.models import (
    Admissions2026Application,
    ApplicationStatus,
    Bot1Applicant,
    CampusTourRequest,
    FoundationRequest,
    PolitoAcademyRequest,
)
from bot1.serializers import (
    Admissions2026ApplicationSerializer,
    Bot1ApplicantSerializer,
    CampusTourRequestSerializer,
    FoundationRequestSerializer,
    PolitoAcademyRequestSerializer,
)
from catalog.models import CatalogItem
from common.auth import verify_service_token
from common.exceptions import APIError, build_error_response
from common.permissions import IsViewerOrAdminReadOnly
from common.time import parse_iso_datetime


class Bot1ApplicantViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Bot1Applicant.objects.all()
    serializer_class = Bot1ApplicantSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["username", "first_name", "last_name", "email", "phone"]
    ordering_fields = ["created_at"]


class Admissions2026ApplicationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Admissions2026Application.objects.select_related("applicant", "direction", "track")
    serializer_class = Admissions2026ApplicationSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["direction", "track", "status"]
    search_fields = ["applicant__username", "applicant__first_name", "applicant__last_name"]
    ordering_fields = ["submitted_at", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        submitted_from = self.request.query_params.get("from")
        submitted_to = self.request.query_params.get("to")
        if submitted_from and (dt := parse_iso_datetime(submitted_from)):
            qs = qs.filter(submitted_at__gte=dt)
        if submitted_to and (dt := parse_iso_datetime(submitted_to)):
            qs = qs.filter(submitted_at__lte=dt)
        return qs


class CampusTourRequestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = CampusTourRequest.objects.select_related("applicant")
    serializer_class = CampusTourRequestSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    ordering_fields = ["submitted_at", "created_at"]


class FoundationRequestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FoundationRequest.objects.select_related("applicant")
    serializer_class = FoundationRequestSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    ordering_fields = ["submitted_at", "created_at"]


class PolitoAcademyRequestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PolitoAcademyRequest.objects.select_related("applicant", "subject")
    serializer_class = PolitoAcademyRequestSerializer
    permission_classes = [IsAuthenticated, IsViewerOrAdminReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "subject"]
    ordering_fields = ["submitted_at", "created_at"]


def _get_region(region_id=None, region_code=None):
    qs = CatalogItem.objects.filter(type=CatalogItem.ItemType.REGION)
    # Try UUID-based lookup first; if it fails (e.g., we received a code), fall back to code lookup.
    if region_id:
        try:
            region = qs.filter(id=region_id).first()
            if region:
                return region
        except Exception:
            # region_id might actually be a code string, ignore casting errors
            pass
        region_code = region_code or region_id
    if region_code:
        region = qs.filter(code=region_code).first()
        if region:
            return region
        raise APIError(code="INVALID_REGION", detail="Region must reference a catalog item with type=region.")
    return None


def _get_catalog_item_or_error(item_id, expected_type: CatalogItem.ItemType, field_name: str):
    if item_id is None:
        return None
    item = CatalogItem.objects.filter(id=item_id, type=expected_type).first()
    if not item:
        raise APIError(
            code="INVALID_CATALOG_TYPE",
            detail=f"{field_name} must reference a catalog item of type={expected_type}.",
        )
    return item


def _get_or_create_applicant(payload: dict) -> Bot1Applicant:
    telegram_user_id = payload.get("telegram_user_id")
    if telegram_user_id is None:
        raise APIError(code="VALIDATION_ERROR", detail="telegram_user_id is required.")
    region = _get_region(payload.get("region_id"), payload.get("region_code"))
    defaults = {
        "telegram_chat_id": payload.get("telegram_chat_id"),
        "username": payload.get("username", "") or "",
        "first_name": payload.get("first_name", "") or "",
        "last_name": payload.get("last_name", "") or "",
        "phone": payload.get("phone", "") or "",
        "email": payload.get("email", "") or "",
        "region": region,
    }
    applicant, created = Bot1Applicant.objects.update_or_create(
        telegram_user_id=telegram_user_id,
        defaults=defaults,
    )
    return applicant


def _handle_status(serializer, status_value):
    instance = serializer.instance
    if status_value == ApplicationStatus.SUBMITTED and not instance.submitted_at:
        instance.submitted_at = timezone.now()
        instance.save(update_fields=["submitted_at"])


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def upsert_applicant(request):
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot1")
    try:
        applicant = _get_or_create_applicant(request.data)
    except APIError as exc:
        return build_error_response(exc.default_code, exc.detail, exc.status_code)

    serializer = Bot1ApplicantSerializer(applicant)
    log_audit(
        actor_type="service",
        actor_service="bot1",
        action="update",
        entity=applicant,
        request=request._request,
        after_data=serializer.data,
    )
    return Response(serializer.data)


def _create_or_update_application(model, serializer_class, applicant, payload, log_entity_name: str):
    # Create new application each time (not idempotent)
    serializer = serializer_class(data=payload)
    serializer.is_valid(raise_exception=True)
    serializer.save(applicant=applicant)
    _handle_status(serializer, serializer.validated_data.get("status"))
    log_audit(
        actor_type="service",
        actor_service="bot1",
        action="update",
        entity=serializer.instance,
        request=None,
        after_data=serializer.data,
    )
    return serializer


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def submit_admissions_application(request):
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot1")
    applicant = _get_or_create_applicant(request.data)
    
    # Debug logging
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Admissions request data: {request.data}")
    
    direction = _get_catalog_item_or_error(
        request.data.get("direction_id"), CatalogItem.ItemType.DIRECTION, "direction_id"
    )
    logger.info(f"Direction found: {direction}")
    
    track = _get_catalog_item_or_error(request.data.get("track_id"), CatalogItem.ItemType.TRACK, "track_id")
    logger.info(f"Track found: {track}")
    
    serializer = _create_or_update_application(
        Admissions2026Application,
        Admissions2026ApplicationSerializer,
        applicant,
        {
            "direction": direction.id if direction else None,
            "track": track.id if track else None,
            "status": request.data.get("status", ApplicationStatus.SUBMITTED),
            "answers": request.data.get("answers", {}),
        },
        "admissions",
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def submit_campus_tour(request):
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot1")
    applicant = _get_or_create_applicant(request.data)
    serializer = _create_or_update_application(
        CampusTourRequest,
        CampusTourRequestSerializer,
        applicant,
        {
            "preferred_date": request.data.get("preferred_date"),
            "status": request.data.get("status", ApplicationStatus.SUBMITTED),
            "answers": request.data.get("answers", {}),
        },
        "campus_tour",
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def submit_foundation(request):
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot1")
    applicant = _get_or_create_applicant(request.data)
    serializer = _create_or_update_application(
        FoundationRequest,
        FoundationRequestSerializer,
        applicant,
        {
            "status": request.data.get("status", ApplicationStatus.SUBMITTED),
            "answers": request.data.get("answers", {}),
        },
        "foundation",
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([])
@transaction.atomic
def submit_polito_academy(request):
    verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name="bot1")
    applicant = _get_or_create_applicant(request.data)
    subject = _get_catalog_item_or_error(request.data.get("subject_id"), CatalogItem.ItemType.SUBJECT, "subject_id")
    serializer = _create_or_update_application(
        PolitoAcademyRequest,
        PolitoAcademyRequestSerializer,
        applicant,
        {
            "subject": subject.id if subject else None,
            "status": request.data.get("status", ApplicationStatus.SUBMITTED),
            "answers": request.data.get("answers", {}),
        },
        "polito_academy",
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)
