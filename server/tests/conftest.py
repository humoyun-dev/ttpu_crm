import pytest
from rest_framework.test import APIClient

from authn.models import User
from catalog.models import CatalogItem
from common.auth import _hashed


@pytest.fixture(autouse=True)
def service_tokens(settings):
    """Pin the bot2 service-token hash for the whole suite so tests never depend on
    the ambient SERVICE_TOKEN_BOT2_HASH env var (loaded via python-dotenv, which was
    flaky on a fresh shell and caused intermittent 403s in token-gated tests).
    Matches the raw token used by test_bot2_flow's `service_token` fixture; modules
    that use a different raw token override this fixture by name (same `service_tokens`).
    Uses the auto-reverting pytest-django `settings` fixture, so no cross-test leakage."""
    settings.SERVICE_TOKENS = {"bot2": _hashed("raw-bot2-service-token")}


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        email="admin@example.com", password="pass1234", role=User.Role.ADMIN, is_staff=True
    )


@pytest.fixture
def viewer_user(db):
    return User.objects.create_user(
        email="viewer@example.com", password="pass1234", role=User.Role.VIEWER, is_staff=False
    )


@pytest.fixture
def program_item(db):
    return CatalogItem.objects.create(type=CatalogItem.ItemType.PROGRAM, name="Program A", code="PA")
