from rest_framework.permissions import BasePermission, SAFE_METHODS

from authn.models import User
from common.auth import verify_service_token


class IsAdminUserRole(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == User.Role.ADMIN)


class IsViewerOrAdminReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_authenticated and request.user.role == User.Role.ADMIN)


class IsAdminCatalogWriter(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_authenticated and request.user.role == User.Role.ADMIN)


class ServiceTokenPermission(BasePermission):
    message = "Service token is required."

    def has_permission(self, request, view):
        service_name = getattr(view, "service_name", None)
        verify_service_token(request.headers.get("X-SERVICE-TOKEN"), service_name=service_name)
        return True
