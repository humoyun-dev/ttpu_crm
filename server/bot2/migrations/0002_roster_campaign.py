from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("bot2", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="studentroster",
            name="roster_campaign",
            field=models.CharField(default="default", max_length=64),
        ),
        migrations.AddIndex(
            model_name="studentroster",
            index=models.Index(fields=["roster_campaign"], name="bot2_roster_campaign_idx"),
        ),
    ]
