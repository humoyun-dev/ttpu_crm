import pytest
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_bot2_student_create_is_disabled(admin_user):
    """Bot2Students are created by the bot, not via the admin API.

    Direct POST must be rejected with 405 (previously 500: roster is a required
    FK but read-only in the serializer).
    """
    client = APIClient()
    client.force_authenticate(user=admin_user)
    url = reverse("bot2-student-list")
    resp = client.post(url, {"student_external_id": "x1"}, format="json")
    assert resp.status_code == status.HTTP_405_METHOD_NOT_ALLOWED
