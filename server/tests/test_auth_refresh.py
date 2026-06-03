"""M-17 — JWT refresh endpoint (`auth-refresh`, POST /api/v1/auth/refresh).

Covers the happy path, the missing-cookie path, the malformed-token path, and the
security-critical revoked-token path (a refresh token revoked at logout must never
be exchangeable for a fresh access token).
"""

from django.conf import settings
from rest_framework import status
from rest_framework.reverse import reverse
from rest_framework.test import APIClient


def _login(api_client, user, password="pass1234"):
    """Log in and return the response (cookies are set on api_client too)."""
    resp = api_client.post(
        reverse("auth-login"),
        {"email": user.email, "password": password},
        format="json",
    )
    assert resp.status_code == status.HTTP_200_OK
    # Carry the issued cookies forward on the client.
    api_client.cookies = resp.cookies
    return resp


def test_refresh_returns_new_access_when_refresh_cookie_present(api_client, admin_user):
    """A valid refresh cookie yields 200, a new access token in the body, and the
    access cookie set on the response."""
    _login(api_client, admin_user)

    resp = api_client.post(reverse("auth-refresh"))

    assert resp.status_code == status.HTTP_200_OK
    assert "access" in resp.data
    assert resp.data["access"]
    # A fresh access cookie is set on the refresh response.
    assert settings.ACCESS_COOKIE_NAME in resp.cookies
    assert resp.cookies[settings.ACCESS_COOKIE_NAME].value


def test_refreshed_access_token_authenticates(api_client, admin_user):
    """The access token returned by refresh actually works against a protected route."""
    _login(api_client, admin_user)
    resp = api_client.post(reverse("auth-refresh"))
    new_access = resp.data["access"]

    client2 = APIClient()
    me = client2.get(reverse("auth-me"), HTTP_AUTHORIZATION=f"Bearer {new_access}")
    assert me.status_code == status.HTTP_200_OK
    assert me.data["email"] == admin_user.email


def test_refresh_without_cookie_returns_401(api_client, admin_user):
    """No refresh cookie → 401 NOT_AUTHENTICATED."""
    resp = api_client.post(reverse("auth-refresh"))

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
    assert resp.data["error"]["code"] == "NOT_AUTHENTICATED"


def test_refresh_with_malformed_token_returns_401(api_client, admin_user):
    """A malformed/garbage refresh cookie is rejected as an invalid token (401)."""
    api_client.cookies[settings.REFRESH_COOKIE_NAME] = "not-a-real-jwt"

    resp = api_client.post(reverse("auth-refresh"))

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED


def test_revoked_refresh_token_cannot_be_reused(api_client, admin_user):
    """SECURITY: a refresh token revoked at logout must not be exchangeable for a new
    access token. Login → logout (revokes refresh) → refresh with the same cookie → 401."""
    login_resp = _login(api_client, admin_user)
    refresh_cookie = login_resp.cookies[settings.REFRESH_COOKIE_NAME].value

    logout_resp = api_client.post(reverse("auth-logout"))
    assert logout_resp.status_code == status.HTTP_200_OK

    # Replay the original refresh token on a clean client.
    attacker = APIClient()
    attacker.cookies[settings.REFRESH_COOKIE_NAME] = refresh_cookie
    resp = attacker.post(reverse("auth-refresh"))

    assert resp.status_code == status.HTTP_401_UNAUTHORIZED
