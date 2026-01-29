import datetime
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("authn", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="RevokedToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("jti", models.CharField(max_length=255, unique=True)),
                (
                    "token_type",
                    models.CharField(
                        choices=[("access", "Access"), ("refresh", "Refresh")],
                        max_length=32,
                    ),
                ),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "ordering": ("-created_at",),
            },
        ),
        migrations.AddIndex(
            model_name="revokedtoken",
            index=models.Index(fields=["expires_at"], name="authn_revoked_expires_idx"),
        ),
        migrations.AddIndex(
            model_name="revokedtoken",
            index=models.Index(fields=["token_type"], name="authn_revoked_type_idx"),
        ),
    ]
