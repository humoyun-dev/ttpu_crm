#!/bin/sh
set -e

python manage.py migrate
python manage.py collectstatic --noinput || true
# Increase timeout and keep-alive to avoid premature worker exits under slow clients/health checks.
gunicorn crm_server.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers 3 \
    --timeout 120 \
    --graceful-timeout 120 \
    --keep-alive 10
