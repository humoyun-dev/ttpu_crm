import logging
from typing import Optional

from django.conf import settings
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken

from authn.models import RevokedToken

logger = logging.getLogger(__name__)


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
            except Exception:
                # Any unexpected error (DB issue, etc.) — fall through to cookie auth.
                logger.warning("Header token authentication failed unexpectedly", exc_info=True)
                pass

        raw_cookie_token = request.COOKIES.get(settings.ACCESS_COOKIE_NAME)
        if not raw_cookie_token:
            return None

        try:
            return self._authenticate_token(raw_cookie_token)
        except InvalidToken:
            raise
        except Exception:
            # Catch non-auth errors (DB errors, etc.) so they return 401 instead of 500.
            logger.warning("Cookie token authentication failed unexpectedly", exc_info=True)
            raise InvalidToken("Authentication failed due to a server error.")

    def get_validated_token(self, raw_token):
        validated = super().get_validated_token(raw_token)
        if RevokedToken.is_revoked(validated):
            raise InvalidToken("Token has been revoked.")
        return validated
