from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("ai_verification", "0002_aiusagelog"),
        ("bot2", "0015_survey_nullable_program_course_year"),
    ]

    operations = [
        migrations.AddField(
            model_name="documentverification",
            name="source_document",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="verifications",
                to="bot2.bot2document",
            ),
        ),
    ]
