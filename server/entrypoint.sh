#!/bin/sh
set -e

python manage.py migrate --fake-initial
python manage.py collectstatic --noinput

# Seed reference data and demo analytics only on a fresh database
STUDENT_COUNT=$(python manage.py shell -c "
from bot2.models import StudentRoster
print(StudentRoster.objects.count())
" 2>/dev/null || echo "0")

if [ "$STUDENT_COUNT" = "0" ]; then
    echo "→ Empty database detected, seeding reference + demo data..."
    python manage.py seed_dev
    python manage.py seed_demo_analytics
fi

gunicorn crm_server.wsgi:application --config /app/gunicorn.conf.py
