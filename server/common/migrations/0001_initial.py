import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ServiceToken",
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
                    "service_name",
                    models.CharField(
                        choices=[
                            ("bot1", "Bot1"),
                            ("bot2", "Bot2"),
                            ("dashboard", "Dashboard"),
                            ("other", "Other"),
                        ],
                        max_length=50,
                    ),
                ),
                ("token_hash", models.CharField(max_length=64, unique=True)),
                ("scope", models.CharField(default="default", max_length=100)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("last_used_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("notes", models.CharField(blank=True, max_length=255)),
            ],
            options={
                "ordering": ("service_name", "-created_at"),
            },
        ),
        migrations.AddConstraint(
            model_name="servicetoken",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_active", True)),
                fields=("service_name", "scope"),
                name="active_service_scope_unique",
            ),
        ),
    ]
