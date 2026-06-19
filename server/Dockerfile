FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# psycopg2-binary is a prebuilt wheel — no compiler needed
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

RUN chmod +x /app/entrypoint.sh

ENV GUNICORN_BIND=0.0.0.0:8000

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
