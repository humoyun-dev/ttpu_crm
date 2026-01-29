import uuid

import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="StudentRoster",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("student_external_id", models.CharField(max_length=100, unique=True)),
                (
                    "course_year",
                    models.PositiveSmallIntegerField(
                        validators=[
                            django.core.validators.MinValueValidator(1),
                            django.core.validators.MaxValueValidator(4),
                        ]
                    ),
                ),
                ("is_active", models.BooleanField(default=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "program",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="roster_programs",
                        to="catalog.catalogitem",
                    ),
                ),
            ],
            options={
                "ordering": ("student_external_id",),
            },
        ),
        migrations.CreateModel(
            name="Bot2Student",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("student_external_id", models.CharField(max_length=100, unique=True)),
                ("telegram_user_id", models.BigIntegerField(blank=True, null=True, unique=True)),
                ("username", models.CharField(blank=True, max_length=150)),
                ("first_name", models.CharField(blank=True, max_length=150)),
                ("last_name", models.CharField(blank=True, max_length=150)),
                (
                    "gender",
                    models.CharField(
                        choices=[
                            ("male", "Male"),
                            ("female", "Female"),
                            ("other", "Other"),
                            ("unspecified", "Unspecified"),
                        ],
                        default="unspecified",
                        max_length=32,
                    ),
                ),
                ("phone", models.CharField(blank=True, max_length=50)),
                (
                    "region",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="bot2_students",
                        to="catalog.catalogitem",
                    ),
                ),
                (
                    "roster",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="students",
                        to="bot2.studentroster",
                    ),
                ),
            ],
            options={
                "ordering": ("student_external_id",),
            },
        ),
        migrations.CreateModel(
            name="Bot2SurveyResponse",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "course_year",
                    models.PositiveSmallIntegerField(
                        validators=[
                            django.core.validators.MinValueValidator(1),
                            django.core.validators.MaxValueValidator(4),
                        ]
                    ),
                ),
                ("survey_campaign", models.CharField(default="default", max_length=64)),
                ("employment_status", models.CharField(blank=True, max_length=100)),
                ("employment_company", models.CharField(blank=True, max_length=255)),
                ("employment_role", models.CharField(blank=True, max_length=255)),
                ("suggestions", models.TextField(blank=True)),
                ("consents", models.JSONField(blank=True, default=dict)),
                ("answers", models.JSONField(blank=True, default=dict)),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "program",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="bot2_program_surveys",
                        to="catalog.catalogitem",
                    ),
                ),
                (
                    "roster",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="survey_responses",
                        to="bot2.studentroster",
                    ),
                ),
                (
                    "student",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="survey_responses",
                        to="bot2.bot2student",
                    ),
                ),
            ],
            options={
                "ordering": ("-submitted_at", "-created_at"),
            },
        ),
        migrations.AddConstraint(
            model_name="bot2student",
            constraint=models.UniqueConstraint(
                fields=("roster", "student_external_id"), name="unique_roster_student_external_id"
            ),
        ),
        migrations.AddIndex(
            model_name="bot2student",
            index=models.Index(fields=["student_external_id"], name="bot2_bot2stu_student_2f52e5_idx"),
        ),
        migrations.AddIndex(
            model_name="bot2student",
            index=models.Index(fields=["telegram_user_id"], name="bot2_bot2stu_telegr_6e2a84_idx"),
        ),
        migrations.AddIndex(
            model_name="studentroster",
            index=models.Index(fields=["program"], name="bot2_studen_program_bbea4e_idx"),
        ),
        migrations.AddIndex(
            model_name="studentroster",
            index=models.Index(fields=["course_year"], name="bot2_studen_course__7600a8_idx"),
        ),
        migrations.AddIndex(
            model_name="studentroster",
            index=models.Index(fields=["is_active"], name="bot2_studen_is_activ_8c9b30_idx"),
        ),
        migrations.AddConstraint(
            model_name="bot2surveyresponse",
            constraint=models.UniqueConstraint(
                fields=("roster", "survey_campaign"), name="unique_roster_campaign"
            ),
        ),
        migrations.AddConstraint(
            model_name="bot2surveyresponse",
            constraint=models.CheckConstraint(
                check=models.Q(("course_year__gte", 1), ("course_year__lte", 4)),
                name="survey_course_year_between_1_and_4",
            ),
        ),
        migrations.AddIndex(
            model_name="bot2surveyresponse",
            index=models.Index(fields=["survey_campaign"], name="bot2_bot2sur_survey__319f5a_idx"),
        ),
        migrations.AddIndex(
            model_name="bot2surveyresponse",
            index=models.Index(fields=["submitted_at"], name="bot2_bot2sur_submit_844d3a_idx"),
        ),
    ]
