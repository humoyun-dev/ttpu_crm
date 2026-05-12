from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                DROP TABLE IF EXISTS bot1_admissions2026application CASCADE;
                DROP TABLE IF EXISTS bot1_campustourrequest CASCADE;
                DROP TABLE IF EXISTS bot1_foundationrequest CASCADE;
                DROP TABLE IF EXISTS bot1_politoacademyrequest CASCADE;
                DROP TABLE IF EXISTS bot1_bot1applicant CASCADE;
                DELETE FROM django_migrations WHERE app = 'bot1';
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
