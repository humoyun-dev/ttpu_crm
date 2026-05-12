#!/bin/sh
set -e

python manage.py migrate
python manage.py collectstatic --noinput
gunicorn crm_server.wsgi:application --config /app/gunicorn.conf.py
