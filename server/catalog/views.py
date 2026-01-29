from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets

from audit.utils import log_audit
from catalog.models import CatalogItem, CatalogRelation
from catalog.serializers import CatalogItemSerializer, CatalogRelationSerializer, ProgramSerializer
from common.permissions import IsAdminCatalogWriter, IsViewerOrAdminReadOnly


class CatalogItemViewSet(viewsets.ModelViewSet):
    serializer_class = CatalogItemSerializer
    queryset = CatalogItem.objects.all()
    permission_classes = [IsAdminCatalogWriter]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["sort_order", "name", "type"]

    def get_queryset(self):
        qs = super().get_queryset()
        item_type = self.request.query_params.get("type")
        is_active = self.request.query_params.get("is_active")
        if item_type:
            qs = qs.filter(type=item_type)
        if is_active in ("true", "false"):
            qs = qs.filter(is_active=is_active == "true")
        return qs

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="create",
            entity=instance,
            request=self.request,
            before_data={},
            after_data=serializer.data,
        )

    def perform_update(self, serializer):
        before = CatalogItemSerializer(self.get_object()).data
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="update",
            entity=instance,
            request=self.request,
            before_data=before,
            after_data=serializer.data,
        )

    def perform_destroy(self, instance):
        before = CatalogItemSerializer(instance).data
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="delete",
            entity=instance,
            request=self.request,
            before_data=before,
            after_data={},
        )
        instance.delete()


class CatalogRelationViewSet(viewsets.ModelViewSet):
    serializer_class = CatalogRelationSerializer
    queryset = CatalogRelation.objects.all()
    permission_classes = [IsAdminCatalogWriter]
    filter_backends = [filters.SearchFilter]
    search_fields = ["relation_type", "from_item__name", "to_item__name"]

    def perform_create(self, serializer):
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="create",
            entity=instance,
            request=self.request,
            after_data=serializer.data,
        )

    def perform_update(self, serializer):
        before = CatalogRelationSerializer(self.get_object()).data
        instance = serializer.save()
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="update",
            entity=instance,
            request=self.request,
            before_data=before,
            after_data=serializer.data,
        )

    def perform_destroy(self, instance):
        before = CatalogRelationSerializer(instance).data
        log_audit(
            actor_type="user",
            actor_user=self.request.user,
            action="delete",
            entity=instance,
            request=self.request,
            before_data=before,
            after_data={},
        )
        instance.delete()


class ProgramViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = ProgramSerializer
    permission_classes = [IsViewerOrAdminReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["sort_order", "name", "code"]

    def get_queryset(self):
        qs = CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM)
        level = self.request.query_params.get("level")
        track = self.request.query_params.get("track")
        if level:
            qs = qs.filter(metadata__level=level)
        if track:
            qs = qs.filter(metadata__track=track)
        return qs
