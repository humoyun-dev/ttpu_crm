from typing import Optional

from django.conf import settings
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from authn.models import RevokedToken


class CookieJWTAuthentication(JWTAuthentication):
    def get_raw_token(self, header: Optional[str]) -> Optional[str]:
        raw_token = super().get_raw_token(header) if header else None
        if raw_token:
            return raw_token
        return None

    def _authenticate_token(self, raw_token):
        validated = self.get_validated_token(raw_token)
        return self.get_user(validated), validated

    def authenticate(self, request):
        header = self.get_header(request)
        raw_token = self.get_raw_token(header)
        if raw_token:
            try:
                return self._authenticate_token(raw_token)
            except InvalidToken:
                # Frontend may keep an expired Authorization header while cookie is refreshed.
                # Fall through to cookie-based auth to recover gracefully.
                pass

        raw_cookie_token = request.COOKIES.get(settings.ACCESS_COOKIE_NAME)
        if not raw_cookie_token:
            return None

        return self._authenticate_token(raw_cookie_token)

    def get_validated_token(self, raw_token):
        validated = super().get_validated_token(raw_token)
        if RevokedToken.is_revoked(validated):
            raise InvalidToken("Token has been revoked.")
        return validated
