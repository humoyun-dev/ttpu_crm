from django.db import migrations, models
from django.db.models import Value
from django.db.models.functions import Coalesce


class Migration(migrations.Migration):
    dependencies = [
        ("catalog", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="catalogrelation",
            name="relation_type",
            field=models.CharField(
                choices=[
                    ("program_direction", "Program -> Direction"),
                    ("program_track", "Program -> Track"),
                    ("subject_prereq", "Subject prerequisite"),
                    ("custom", "Custom"),
                ],
                default="custom",
                max_length=100,
            ),
        ),
        migrations.AddConstraint(
            model_name="catalogitem",
            constraint=models.UniqueConstraint(
                "type",
                Coalesce("code", Value("")),
                name="catalog_item_type_code_unique_with_nulls",
            ),
        ),
    ]
