from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


def _has_valid_service_token(request) -> bool:
    """True — request'da amaldagi X-SERVICE-TOKEN bo'lsa (bot service trafigi)."""
    # Lazy import: common.auth -> common.exceptions -> rest_framework.views eagerly
    # resolves DEFAULT_THROTTLE_CLASSES (-> this module), so a module-level import
    # here would be circular whenever common.auth is imported first (tests, shell).
    from common.auth import verify_service_token

    raw_token = request.headers.get("X-SERVICE-TOKEN")
    if not raw_token:
        return False
    try:
        verify_service_token(raw_token)
    except Exception:
        return False
    return True


class ServiceTokenExemptAnonRateThrottle(AnonRateThrottle):
    """Default anon throttle, lekin amaldagi service-token'li so'rovlar cheklanmaydi.

    Bot bitta konteyner IP'sidan yuboradi — 100/day anon limiti butun botni
    to'xtatib qo'ymasligi uchun service-token trafigi throttle'dan ozod.
    """

    def allow_request(self, request, view):
        if _has_valid_service_token(request):
            return True
        return super().allow_request(request, view)


class ServiceTokenExemptUserRateThrottle(UserRateThrottle):
    """Default user throttle, lekin amaldagi service-token'li so'rovlar cheklanmaydi."""

    def allow_request(self, request, view):
        if _has_valid_service_token(request):
            return True
        return super().allow_request(request, view)


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class SurveySubmitThrottle(AnonRateThrottle):
    """Per-IP throttle for the public, service-token-guarded survey submit endpoint.

    Replaces the default 100/day anon cap (which could silently 429 a legitimate
    campaign burst from a single NAT IP) with a more generous dedicated rate.
    """

    scope = "survey_submit"
