from django.urls import reverse
from rest_framework import status

from catalog.models import CatalogItem


def test_login_and_me(api_client, admin_user):
    resp = api_client.post(
        reverse("auth-login"),
        {"email": admin_user.email, "password": "pass1234"},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    assert "access_token" in resp.cookies
    api_client.cookies = resp.cookies

    me_resp = api_client.get(reverse("auth-me"))
    assert me_resp.status_code == status.HTTP_200_OK
    assert me_resp.data["email"] == admin_user.email
    assert me_resp.data["role"] == admin_user.role


def test_viewer_cannot_modify_catalog(api_client, viewer_user):
    api_client.force_authenticate(user=viewer_user)
    resp = api_client.post(reverse("catalog-item-list"), {"type": "program", "name": "Test"}, format="json")
    assert resp.status_code == status.HTTP_403_FORBIDDEN


def test_admin_can_crud_catalog(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    create_resp = api_client.post(
        reverse("catalog-item-list"),
        {
            "type": "program",
            "name": "Test Program",
            "code": "TP",
            "metadata": {
                "level": "bachelor",
                "track": "italian",
                "language": "English",
                "duration_years": 4,
            },
        },
        format="json",
    )
    assert create_resp.status_code == status.HTTP_201_CREATED
    item_id = create_resp.data["id"]

    patch_resp = api_client.patch(
        reverse("catalog-item-detail", args=[item_id]),
        {"name": "Updated"},
        format="json",
    )
    assert patch_resp.status_code == status.HTTP_200_OK
    assert patch_resp.data["name"] == "Updated"
