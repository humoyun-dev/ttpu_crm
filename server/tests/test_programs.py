import pytest
from django.core.management import call_command
from rest_framework import status
from rest_framework.reverse import reverse

from catalog.models import CatalogItem

pytestmark = pytest.mark.django_db


def test_seed_programs_idempotent(api_client, admin_user):
    call_command("seed_programs")
    first_count = CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM).count()
    call_command("seed_programs")
    second_count = CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM).count()
    assert first_count == 13
    assert second_count == first_count
    codes = set(CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM).values_list("code", flat=True))
    assert len(codes) == first_count


def test_program_endpoint_filters_by_level_and_track(api_client, admin_user):
    call_command("seed_programs")
    api_client.force_authenticate(user=admin_user)
    url = reverse("catalog-program-list")
    resp = api_client.get(url, {"level": "bachelor", "track": "italian"})
    assert resp.status_code == status.HTTP_200_OK
    data = resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
    names = {row["name"] for row in data}
    assert "MECHANICAL ENGINEERING" in names
    assert all(row["level"] == "bachelor" for row in data)
    assert all(row["track"] == "italian" for row in data)


def test_program_endpoint_includes_masters(api_client, admin_user):
    call_command("seed_programs")
    api_client.force_authenticate(user=admin_user)
    url = reverse("catalog-program-list")
    resp = api_client.get(url, {"level": "master"})
    assert resp.status_code == status.HTTP_200_OK
    data = resp.data["results"] if isinstance(resp.data, dict) and "results" in resp.data else resp.data
    tracks = {row["track"] for row in data}
    names = {row["name"] for row in data}
    assert "MASTER OF BUSINESS ADMINISTRATION (MBA)" in names
    assert "MECHATRONIC ENGINEERING" in names
    assert tracks == {"n/a"}


def test_invalid_program_metadata_rejected(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    resp = api_client.post(
        reverse("catalog-item-list"),
        {
            "type": CatalogItem.ItemType.PROGRAM,
            "code": "BAD",
            "name": "Bad Program",
            "metadata": {"level": "bachelor"},  # missing fields
        },
        format="json",
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
    assert resp.data.get("error", {}).get("code") == "INVALID"
    details = resp.data.get("error", {}).get("details", {})
    assert "non_field_errors" in details
