from django.db import migrations, models


def dedupe_survey_responses(apps, schema_editor):
    """Drop duplicate (student, survey_campaign) rows, keeping the most recent,
    so the new unique constraint can be applied to existing data safely."""
    Bot2SurveyResponse = apps.get_model("bot2", "Bot2SurveyResponse")
    seen: set = set()
    to_delete: list = []
    rows = (
        Bot2SurveyResponse.objects.order_by("-submitted_at", "-created_at", "-id")
        .values("id", "student_id", "survey_campaign")
    )
    for row in rows:
        key = (row["student_id"], row["survey_campaign"])
        if key in seen:
            to_delete.append(row["id"])
        else:
            seen.add(key)
    if to_delete:
        Bot2SurveyResponse.objects.filter(id__in=to_delete).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("bot2", "0007_allow_course_year_5_graduated"),
    ]

    operations = [
        migrations.RunPython(dedupe_survey_responses, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="bot2surveyresponse",
            constraint=models.UniqueConstraint(
                fields=["student", "survey_campaign"],
                name="uq_survey_student_campaign",
            ),
        ),
    ]
