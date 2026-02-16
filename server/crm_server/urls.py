from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework import routers

from authn.views import LoginView, LogoutView, MeView, RefreshView
from bot1.views import (
    Admissions2026ApplicationViewSet,
    Bot1ApplicantViewSet,
    CampusTourRequestViewSet,
    FoundationRequestViewSet,
    PolitoAcademyRequestViewSet,
    submit_admissions_application,
    submit_campus_tour,
    submit_foundation,
    submit_polito_academy,
    upsert_applicant,
)
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
    admissions_by_direction,
    admissions_by_track,
    polito_by_subject,
    bot2_course_year_coverage,
    bot2_program_coverage,
    bot2_program_course_matrix,
    bot2_program_details_by_year,
    enrollments_overview,
)



def healthz(request):
    return JsonResponse({"ok": True})

router = routers.DefaultRouter()
router.register(r"catalog/items", CatalogItemViewSet, basename="catalog-item")
router.register(r"catalog/relations", CatalogRelationViewSet, basename="catalog-relation")
router.register(r"catalog/programs", ProgramViewSet, basename="catalog-program")

router.register(r"bot1/applicants", Bot1ApplicantViewSet, basename="bot1-applicant")
router.register(r"bot1/applications/admissions-2026", Admissions2026ApplicationViewSet, basename="bot1-admissions")
router.register(r"bot1/applications/campus-tour", CampusTourRequestViewSet, basename="bot1-campus-tour")
router.register(r"bot1/applications/foundation", FoundationRequestViewSet, basename="bot1-foundation")
router.register(r"bot1/applications/polito-academy", PolitoAcademyRequestViewSet, basename="bot1-polito-academy")

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
        # Bot1 service endpoints
        path("bot1/applicants/upsert", upsert_applicant, name="bot1-applicant-upsert"),
        path("bot1/admissions-2026/submit", submit_admissions_application, name="bot1-admissions-submit"),
        path("bot1/campus-tour/submit", submit_campus_tour, name="bot1-campus-tour-submit"),
        path("bot1/foundation/submit", submit_foundation, name="bot1-foundation-submit"),
        path("bot1/polito-academy/submit", submit_polito_academy, name="bot1-polito-academy-submit"),
        # Bot2
        path("admin/roster/import", import_roster, name="bot2-roster-import"),
        path("bot2/surveys/submit", submit_survey, name="bot2-survey-submit"),
        # Analytics
        path("analytics/admissions-2026/by-direction", admissions_by_direction, name="analytics-adm-direction"),
        path("analytics/admissions-2026/by-track", admissions_by_track, name="analytics-adm-track"),
        path("analytics/polito-academy/by-subject", polito_by_subject, name="analytics-polito-subject"),
        path("analytics/bot2/course-year-coverage", bot2_course_year_coverage, name="analytics-bot2-course"),
        path("analytics/bot2/program-coverage", bot2_program_coverage, name="analytics-bot2-program"),
        path("analytics/bot2/program-course-matrix", bot2_program_course_matrix, name="analytics-bot2-matrix"),
        path("analytics/bot2/program-details-by-year", bot2_program_details_by_year, name="analytics-bot2-program-year"),
        path("analytics/bot2/enrollments-overview", enrollments_overview, name="analytics-bot2-enrollments-overview"),
    ])),
]
