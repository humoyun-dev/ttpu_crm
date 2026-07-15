#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# Seed reference data and demo analytics only on a fresh database
STUDENT_COUNT=$(python manage.py shell -c "
from bot2.models import StudentRoster
print(StudentRoster.objects.count())
" 2>/dev/null || echo "0")

# Only auto-seed in DEBUG/dev — never inject demo data into a prod database.
if [ "$STUDENT_COUNT" = "0" ] && { [ "$DJANGO_DEBUG" = "true" ] || [ "$DJANGO_DEBUG" = "True" ] || [ "$DJANGO_DEBUG" = "1" ]; }; then
    echo "→ Empty dev database detected, seeding reference + demo data..."
    python manage.py seed_dev
    python manage.py seed_demo_analytics
fi

gunicorn crm_server.wsgi:application --config /app/gunicorn.conf.py
