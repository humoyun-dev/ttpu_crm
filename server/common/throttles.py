from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = "login"


class SurveySubmitThrottle(AnonRateThrottle):
    """Per-IP throttle for the public, service-token-guarded survey submit endpoint.

    Replaces the default 100/day anon cap (which could silently 429 a legitimate
    campaign burst from a single NAT IP) with a more generous dedicated rate.
    """

    scope = "survey_submit"
