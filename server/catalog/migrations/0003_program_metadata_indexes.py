from django.db import migrations


def create_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS catalog_item_level_idx ON catalog_catalogitem (type, (metadata->>'level'));"
    )
    schema_editor.execute(
        "CREATE INDEX IF NOT EXISTS catalog_item_track_idx ON catalog_catalogitem (type, (metadata->>'track'));"
    )


def drop_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute("DROP INDEX IF EXISTS catalog_item_level_idx;")
    schema_editor.execute("DROP INDEX IF EXISTS catalog_item_track_idx;")


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0002_type_safety_constraints"),
    ]

    operations = [
        migrations.RunPython(create_indexes, reverse_code=drop_indexes),
    ]
