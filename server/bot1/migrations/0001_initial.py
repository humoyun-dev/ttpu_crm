import uuid

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="Bot1Applicant",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("telegram_user_id", models.BigIntegerField(unique=True)),
                ("telegram_chat_id", models.BigIntegerField(blank=True, null=True)),
                ("username", models.CharField(blank=True, max_length=150)),
                ("first_name", models.CharField(blank=True, max_length=150)),
                ("last_name", models.CharField(blank=True, max_length=150)),
                ("phone", models.CharField(blank=True, max_length=50)),
                ("email", models.EmailField(blank=True, max_length=254)),
                (
                    "region",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="bot1_applicants",
                        to="catalog.catalogitem",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.CreateModel(
            name="FoundationRequest",
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
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("submitted", "Submitted"),
                            ("in_progress", "In Progress"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                        ],
                        default="new",
                        max_length=32,
                    ),
                ),
                ("answers", models.JSONField(blank=True, default=dict)),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "applicant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="foundation_requests",
                        to="bot1.bot1applicant",
                    ),
                ),
            ],
            options={
                "ordering": ("-submitted_at", "-created_at"),
            },
        ),
        migrations.CreateModel(
            name="PolitoAcademyRequest",
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
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("submitted", "Submitted"),
                            ("in_progress", "In Progress"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                        ],
                        default="new",
                        max_length=32,
                    ),
                ),
                ("answers", models.JSONField(blank=True, default=dict)),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "applicant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="polito_academy_requests",
                        to="bot1.bot1applicant",
                    ),
                ),
                (
                    "subject",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="polito_academy_subjects",
                        to="catalog.catalogitem",
                    ),
                ),
            ],
            options={
                "ordering": ("-submitted_at", "-created_at"),
            },
        ),
        migrations.CreateModel(
            name="Admissions2026Application",
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
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("submitted", "Submitted"),
                            ("in_progress", "In Progress"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                        ],
                        default="new",
                        max_length=32,
                    ),
                ),
                ("answers", models.JSONField(blank=True, default=dict)),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "applicant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="admissions_2026_applications",
                        to="bot1.bot1applicant",
                    ),
                ),
                (
                    "direction",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="admissions_direction_applications",
                        to="catalog.catalogitem",
                    ),
                ),
                (
                    "track",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="admissions_track_applications",
                        to="catalog.catalogitem",
                    ),
                ),
            ],
            options={
                "verbose_name": "Admissions 2026 Application",
                "ordering": ("-submitted_at", "-created_at"),
            },
        ),
        migrations.CreateModel(
            name="CampusTourRequest",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4, editable=False, primary_key=True, serialize=False
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("preferred_date", models.DateField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("new", "New"),
                            ("submitted", "Submitted"),
                            ("in_progress", "In Progress"),
                            ("approved", "Approved"),
                            ("rejected", "Rejected"),
                        ],
                        default="new",
                        max_length=32,
                    ),
                ),
                ("answers", models.JSONField(blank=True, default=dict)),
                ("submitted_at", models.DateTimeField(blank=True, null=True)),
                (
                    "applicant",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="campus_tour_requests",
                        to="bot1.bot1applicant",
                    ),
                ),
            ],
            options={
                "ordering": ("-submitted_at", "-created_at"),
            },
        ),
        migrations.AddIndex(
            model_name="bot1applicant",
            index=models.Index(fields=["telegram_user_id"], name="bot1_bot1ap_telegr_6bba15_idx"),
        ),
        migrations.AddIndex(
            model_name="bot1applicant",
            index=models.Index(fields=["telegram_chat_id"], name="bot1_bot1ap_telegr_f6f4fa_idx"),
        ),
    ]
