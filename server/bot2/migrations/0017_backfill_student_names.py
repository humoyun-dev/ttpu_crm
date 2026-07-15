from django.db import migrations


def backfill_names(apps, schema_editor):
    """Fill blank Bot2Student first/last names from their roster (the Excel-import
    source of truth) so existing students show a name on the survey detail page and in
    the dashboard Excel export. Only blank fields are touched."""
    Bot2Student = apps.get_model('bot2', 'Bot2Student')
    qs = Bot2Student.objects.select_related('roster').filter(roster__isnull=False)
    to_update = []
    for s in qs.iterator():
        changed = False
        if not (s.first_name or '').strip() and (s.roster.first_name or '').strip():
            s.first_name = s.roster.first_name.strip()
            changed = True
        if not (s.last_name or '').strip() and (s.roster.last_name or '').strip():
            s.last_name = s.roster.last_name.strip()
            changed = True
        if changed:
            to_update.append(s)
    if to_update:
        Bot2Student.objects.bulk_update(to_update, ['first_name', 'last_name'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('bot2', '0016_student_accounts'),
    ]

    operations = [
        migrations.RunPython(backfill_names, noop_reverse),
    ]
