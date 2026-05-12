from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework import routers

from authn.views import LoginView, LogoutView, MeView, RefreshView
from bot2.views import (
    Bot2SurveyResponseViewSet,
    Bot2StudentRosterViewSet,
    Bot2StudentViewSet,
    ProgramEnrollmentViewSet,
    import_roster,
    submit_survey,
)
from catalog.views import CatalogItemViewSet, CatalogRelationViewSet, ProgramViewSet
from analytics.views import (
    bot2_course_year_coverage,
    bot2_program_coverage,
    bot2_program_course_matrix,
    bot2_program_details_by_year,
    enrollments_overview,
    bot2_academic_years,
)


def healthz(request):
    return JsonResponse({"ok": True})


router = routers.DefaultRouter()
router.register(r"catalog/items", CatalogItemViewSet, basename="catalog-item")
router.register(r"catalog/relations", CatalogRelationViewSet, basename="catalog-relation")
router.register(r"catalog/programs", ProgramViewSet, basename="catalog-program")

router.register(r"bot2/roster", Bot2StudentRosterViewSet, basename="bot2-roster")
router.register(r"bot2/students", Bot2StudentViewSet, basename="bot2-student")
router.register(r"bot2/surveys", Bot2SurveyResponseViewSet, basename="bot2-survey")
router.register(r"bot2/enrollments", ProgramEnrollmentViewSet, basename="bot2-enrollment")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/", include([
        path("healthz", healthz, name="healthz"),
        path("", include(router.urls)),
        path("auth/login", LoginView.as_view(), name="auth-login"),
        path("auth/refresh", RefreshView.as_view(), name="auth-refresh"),
        path("auth/logout", LogoutView.as_view(), name="auth-logout"),
        path("auth/me", MeView.as_view(), name="auth-me"),
        # Bot2
        path("admin/roster/import", import_roster, name="bot2-roster-import"),
        path("bot2/surveys/submit", submit_survey, name="bot2-survey-submit"),
        # Analytics
        path("analytics/bot2/course-year-coverage", bot2_course_year_coverage, name="analytics-bot2-course"),
        path("analytics/bot2/program-coverage", bot2_program_coverage, name="analytics-bot2-program"),
        path("analytics/bot2/program-course-matrix", bot2_program_course_matrix, name="analytics-bot2-matrix"),
        path("analytics/bot2/program-details-by-year", bot2_program_details_by_year, name="analytics-bot2-program-year"),
        path("analytics/bot2/enrollments-overview", enrollments_overview, name="analytics-bot2-enrollments-overview"),
        path("analytics/bot2/academic-years", bot2_academic_years, name="analytics-bot2-academic-years"),
    ])),
]
