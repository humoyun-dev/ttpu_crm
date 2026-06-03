import hashlib
import hmac
import logging
from typing import Optional

from django.conf import settings
from django.db import OperationalError, ProgrammingError
from django.db.models import Q
from django.utils import timezone
from rest_framework import exceptions

from common.exceptions import APIError
from common.models import ServiceToken

logger = logging.getLogger(__name__)


def _hashed(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _verify_db_token(incoming_hash: str, service_name: Optional[str]) -> bool:
    now = timezone.now()
    qs = ServiceToken.objects.filter(
        token_hash=incoming_hash,
        is_active=True,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
    if service_name:
        qs = qs.filter(service_name=service_name)
    token = qs.order_by("-created_at").first()
    if not token:
        return False
    if not token.last_used_at or (now - token.last_used_at).total_seconds() > 60:
        ServiceToken.objects.filter(pk=token.pk).update(last_used_at=now)
    return True


def verify_service_token(raw_token: Optional[str], service_name: Optional[str] = None) -> None:
    if not raw_token:
        raise APIError(code="SERVICE_TOKEN_REQUIRED", detail="X-SERVICE-TOKEN header is required.", status_code=403)

    incoming_hash = _hashed(raw_token)

    try:
        if _verify_db_token(incoming_hash, service_name):
            return
    except (OperationalError, ProgrammingError) as exc:
        # DB unavailable / not migrated yet — log and fall back to settings tokens.
        # (Narrowed from a bare `except` so genuine bugs aren't silently swallowed.)
        logger.warning("ServiceToken DB lookup failed; falling back to settings tokens: %s", exc)

    hashes = []
    if service_name:
        hash_value = settings.SERVICE_TOKENS.get(service_name)
        if hash_value:
            hashes.append(hash_value)
    else:
        hashes = [value for value in settings.SERVICE_TOKENS.values() if value]

    if not hashes:
        raise exceptions.PermissionDenied("Service tokens are not configured.")

    for expected in hashes:
        if expected and hmac.compare_digest(incoming_hash, expected):
            return

    raise APIError(code="SERVICE_TOKEN_INVALID", detail="Invalid service token.", status_code=403)
