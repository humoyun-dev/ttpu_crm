from __future__ import annotations

import logging
from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class APIError(exceptions.APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "BAD_REQUEST"
    default_detail = _("Bad request")

    def __init__(self, code: str | None = None, detail: Any | None = None, status_code: int | None = None):
        if code:
            self.default_code = code
        if status_code:
            self.status_code = status_code
        super().__init__(detail=detail or self.default_detail, code=self.default_code)


def build_error_response(code: str, message: Any, status_code: int, details: Any | None = None) -> Response:
    payload = {"error": {"code": code, "message": message}}
    if details:
        payload["error"]["details"] = details
    return Response(payload, status=status_code)


def custom_exception_handler(exc: Exception, context: dict) -> Response:
    response = drf_exception_handler(exc, context)

    if isinstance(exc, APIError):
        return build_error_response(
            str(exc.default_code).upper(),
            exc.detail,
            getattr(exc, "status_code", status.HTTP_400_BAD_REQUEST),
        )

    if response is None:
        logger.exception("Unhandled exception in API", exc_info=exc)
        return build_error_response("SERVER_ERROR", "Internal server error", status.HTTP_500_INTERNAL_SERVER_ERROR)

    code = getattr(exc, "default_code", None) or "error"
    message = response.data if response.data else str(exc)

    # Normalize DRF validation errors
    if isinstance(exc, exceptions.ValidationError):
        message = "Validation error"
        details = response.data
        return build_error_response(code.upper(), message, response.status_code, details=details)

    if isinstance(exc, exceptions.PermissionDenied):
        return build_error_response("FORBIDDEN", "You do not have permission to perform this action.", response.status_code)

    if isinstance(exc, exceptions.NotAuthenticated):
        return build_error_response("NOT_AUTHENTICATED", "Authentication credentials were not provided or are invalid.", response.status_code)

    if isinstance(exc, exceptions.NotFound):
        return build_error_response("NOT_FOUND", "Resource not found.", response.status_code)

    # Fall back to generic format
    return build_error_response(str(code).upper(), message, response.status_code)
