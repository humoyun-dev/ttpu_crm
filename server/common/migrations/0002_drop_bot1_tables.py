from django.db import migrations

BOT1_TABLES = [
    "bot1_admissions2026application",
    "bot1_campustourrequest",
    "bot1_foundationrequest",
    "bot1_politoacademyrequest",
    "bot1_bot1applicant",
]


def drop_bot1_tables(apps, schema_editor):
    """Drop the legacy bot1 tables.

    Uses vendor-aware SQL: PostgreSQL supports ``DROP TABLE ... CASCADE`` while
    SQLite (the default dev/test backend) does not even parse the CASCADE
    keyword — the original raw SQL broke ``migrate`` entirely on SQLite.
    """
    conn = schema_editor.connection
    with conn.cursor() as cursor:
        for table in BOT1_TABLES:
            if conn.vendor == "postgresql":
                cursor.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE;')
            else:
                cursor.execute(f'DROP TABLE IF EXISTS "{table}";')
        cursor.execute("DELETE FROM django_migrations WHERE app = 'bot1';")


class Migration(migrations.Migration):
    dependencies = [
        ("common", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(drop_bot1_tables, migrations.RunPython.noop),
    ]
