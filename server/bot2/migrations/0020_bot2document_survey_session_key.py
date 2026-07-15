from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bot2', '0019_bot2student_ai_skills_bot2student_ai_skills_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='bot2document',
            name='survey_session_key',
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
    ]
