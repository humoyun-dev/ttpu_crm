from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from audit.utils import log_audit
from authn.serializers import LoginSerializer, UserSerializer
from authn.models import RevokedToken
from common.exceptions import APIError, build_error_response


def _set_cookie(response: Response, name: str, value: str, expires: timedelta):
    response.set_cookie(
        name,
        value,
        httponly=True,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        domain=settings.JWT_COOKIE_DOMAIN,
        expires=timezone.now() + expires,
        path="/",
    )


def _clear_cookie(response: Response, name: str):
    response.set_cookie(
        name,
        value="",
        httponly=True,
        secure=settings.JWT_COOKIE_SECURE,
        samesite=settings.JWT_COOKIE_SAMESITE,
        domain=settings.JWT_COOKIE_DOMAIN,
        expires=timezone.now() - timedelta(days=1),
        path="/",
    )


class LoginView(generics.GenericAPIView):
    serializer_class = LoginSerializer
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        access_token = refresh.access_token

        response = Response({
            "user": UserSerializer(user).data,
            "access": str(access_token),
            "refresh": str(refresh),
        })
        _set_cookie(response, settings.ACCESS_COOKIE_NAME, str(access_token), settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"])
        _set_cookie(response, settings.REFRESH_COOKIE_NAME, str(refresh), settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"])

        log_audit(
            actor_type="user",
            actor_user=user,
            action="login",
            entity=user,
            request=request,
            before_data={},
            after_data={"user": user.email},
        )
        return response


class RefreshView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        raw_refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not raw_refresh:
            raise APIError(code="NOT_AUTHENTICATED", detail="Refresh token missing.", status_code=status.HTTP_401_UNAUTHORIZED)
        try:
            refresh = RefreshToken(raw_refresh)
        except Exception as exc:
            raise InvalidToken("Invalid refresh token.") from exc
        if RevokedToken.is_revoked(refresh):
            raise InvalidToken("Refresh token has been revoked.")

        access_token = refresh.access_token
        response = Response({"access": "ok"})
        _set_cookie(response, settings.ACCESS_COOKIE_NAME, str(access_token), settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"])
        return response


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        raw_refresh = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if raw_refresh:
            try:
                token = RefreshToken(raw_refresh)
                RevokedToken.revoke(token, RevokedToken.TokenType.REFRESH)
            except Exception:
                pass
        raw_access = request.COOKIES.get(settings.ACCESS_COOKIE_NAME)
        if raw_access:
            try:
                access = AccessToken(raw_access)
                RevokedToken.revoke(access, RevokedToken.TokenType.ACCESS)
            except Exception:
                pass

        response = Response({"success": True})
        _clear_cookie(response, settings.ACCESS_COOKIE_NAME)
        _clear_cookie(response, settings.REFRESH_COOKIE_NAME)

        log_audit(
            actor_type="user",
            actor_user=request.user,
            action="logout",
            entity=request.user,
            request=request,
            before_data={},
            after_data={"user": request.user.email},
        )
        return response


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def handle_exception(self, exc):
        if isinstance(exc, APIError):
            return build_error_response(exc.default_code, exc.detail, exc.status_code)
        return super().handle_exception(exc)
