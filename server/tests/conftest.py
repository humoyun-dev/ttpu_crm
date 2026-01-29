import pytest
from rest_framework.test import APIClient

from authn.models import User
from catalog.models import CatalogItem


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
