"""M-16 — ServiceToken DB-backed verification path (`common.auth.verify_service_token`).

The existing suite only exercises the settings-fallback branch. These tests drive
the DB branch in `_verify_db_token`.

Design note: under the test environment `settings.SERVICE_TOKENS["bot2"]` is populated
from `.env` (it hashes to the literal "raw-bot2-service-token"). To prove that *the DB*
is what authorises a request — and not the settings fallback — every token used here
hashes to something OTHER than that env value. A success can therefore only have come
from the DB row. Negative cases additionally clear `SERVICE_TOKENS` so the assertion
about the raised exception is unambiguous.
"""

import hashlib
from datetime import timedelta

import pytest
from django.utils import timezone
from rest_framework import exceptions

from common.auth import verify_service_token
from common.exceptions import APIError
from common.models import ServiceToken


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# A raw token that is NOT the one configured in settings.SERVICE_TOKENS["bot2"].
DB_RAW = "db-only-bot2-token"
DB_HASH = _hash(DB_RAW)


def _make_token(**overrides):
    fields = {
        "service_name": "bot2",
        "token_hash": DB_HASH,
        "scope": "default",
        "is_active": True,
        "expires_at": None,
    }
    fields.update(overrides)
    return ServiceToken.objects.create(**fields)


def test_valid_active_db_token_passes(db):
    """A matching active token with no expiry authorises the request via the DB path."""
    _make_token()

    # No exception == success. (Returns None.)
    assert verify_service_token(DB_RAW, service_name="bot2") is None


def test_valid_db_token_takes_priority_over_empty_settings(db, settings):
    """The DB row alone authorises even when settings.SERVICE_TOKENS is empty,
    proving success came from the DB and not the settings fallback."""
    settings.SERVICE_TOKENS = {}
    _make_token()

    assert verify_service_token(DB_RAW, service_name="bot2") is None


def test_expired_token_is_rejected(db, settings):
    """An expired token must not authorise; with settings empty the DB miss surfaces
    as PermissionDenied (no tokens configured)."""
    settings.SERVICE_TOKENS = {}
    _make_token(expires_at=timezone.now() - timedelta(seconds=1))

    with pytest.raises(exceptions.PermissionDenied):
        verify_service_token(DB_RAW, service_name="bot2")


def test_inactive_token_is_rejected(db, settings):
    """is_active=False excludes the row from the DB lookup."""
    settings.SERVICE_TOKENS = {}
    _make_token(is_active=False)

    with pytest.raises(exceptions.PermissionDenied):
        verify_service_token(DB_RAW, service_name="bot2")


def test_service_name_mismatch_is_rejected(db, settings):
    """A token registered for one service must not authorise a different service name."""
    settings.SERVICE_TOKENS = {}
    _make_token(service_name="dashboard")

    # Request as "bot2" while the token is for "dashboard" → DB filter excludes it.
    with pytest.raises(exceptions.PermissionDenied):
        verify_service_token(DB_RAW, service_name="bot2")


def test_unmatched_token_with_configured_settings_raises_api_error(db):
    """When SERVICE_TOKENS is configured (the real test env) but neither the DB nor
    the configured hash matches, the caller gets APIError(SERVICE_TOKEN_INVALID)."""
    # No DB row, raw token does not match the configured bot2 hash.
    with pytest.raises(APIError) as exc_info:
        verify_service_token("totally-wrong-token", service_name="bot2")
    assert exc_info.value.default_code == "SERVICE_TOKEN_INVALID"


def test_missing_raw_token_raises_required(db):
    """A missing header is reported distinctly as SERVICE_TOKEN_REQUIRED."""
    with pytest.raises(APIError) as exc_info:
        verify_service_token(None, service_name="bot2")
    assert exc_info.value.default_code == "SERVICE_TOKEN_REQUIRED"


def test_last_used_at_is_set_on_first_verification(db):
    """A fresh token (last_used_at is None) gets stamped on the first successful verify."""
    token = _make_token(last_used_at=None)
    assert token.last_used_at is None

    verify_service_token(DB_RAW, service_name="bot2")

    token.refresh_from_db()
    assert token.last_used_at is not None


def test_last_used_at_is_throttled_within_60s(db):
    """Within the 60s throttle window last_used_at is NOT rewritten on every call,
    so the timestamp stays at its recent value (avoids a write per request)."""
    recent = timezone.now() - timedelta(seconds=5)
    token = _make_token(last_used_at=recent)

    verify_service_token(DB_RAW, service_name="bot2")

    token.refresh_from_db()
    # Unchanged because the last use was < 60s ago.
    assert abs((token.last_used_at - recent).total_seconds()) < 1


def test_last_used_at_refreshes_after_60s(db):
    """Once the throttle window has elapsed, a successful verify advances last_used_at."""
    stale = timezone.now() - timedelta(seconds=120)
    token = _make_token(last_used_at=stale)

    verify_service_token(DB_RAW, service_name="bot2")

    token.refresh_from_db()
    assert (token.last_used_at - stale).total_seconds() > 60
