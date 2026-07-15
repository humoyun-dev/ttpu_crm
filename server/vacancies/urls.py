from django.urls import path
from . import views

urlpatterns = [
    path("",                       views.vacancy_list_create,   name="vacancy-list"),
    path("<uuid:pk>",              views.vacancy_detail,        name="vacancy-detail"),
    path("<uuid:pk>/publish",      views.vacancy_publish,       name="vacancy-publish"),
    path("<uuid:pk>/upload_image", views.vacancy_upload_image,  name="vacancy-upload-image"),
    path("feed",                   views.vacancy_feed,          name="vacancy-feed"),
    path("ai_draft",               views.vacancy_ai_draft,      name="vacancy-ai-draft"),
]
