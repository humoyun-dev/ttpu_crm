from __future__ import annotations

import uuid
from typing import Any, Optional

from django.http import HttpRequest
from django.utils import timezone

from audit.models import AuditLog


PII_KEYS = {"email", "phone", "answers", "first_name", "last_name"}


def _sanitize_value(key: str, value: Any):
    if key in PII_KEYS:
        return "[REDACTED]"
    # Convert UUID to string for JSON serialization
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _sanitize_payload(payload: Optional[dict]) -> dict:
    if not payload:
        return {}
    cleaned = {}
    for key, value in payload.items():
        if isinstance(value, dict):
            cleaned[key] = _sanitize_payload(value)
        elif isinstance(value, uuid.UUID):
            cleaned[key] = str(value)
        else:
            cleaned[key] = _sanitize_value(str(key), value)
    return cleaned


def log_audit(
    *,
    actor_type: str,
    action: str,
    entity,
    request: Optional[HttpRequest] = None,
    actor_user=None,
    actor_service: Optional[str] = None,
    before_data: Optional[dict] = None,
    after_data: Optional[dict] = None,
    meta: Optional[dict] = None,
):
    ip = None
    user_agent = ""
    if request:
        ip = request.META.get("REMOTE_ADDR")
        user_agent = request.META.get("HTTP_USER_AGENT", "")

    AuditLog.objects.create(
        actor_type=actor_type,
        actor_user=actor_user,
        actor_service=actor_service or "",
        action=action,
        entity_table=entity._meta.db_table,
        entity_id=getattr(entity, "id", None),
        before_data=_sanitize_payload(before_data),
        after_data=_sanitize_payload(after_data),
        meta=_sanitize_payload(meta),
        ip=ip,
        user_agent=user_agent,
        created_at=timezone.now(),
        updated_at=timezone.now(),
    )
