FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir --upgrade pip poetry

COPY pyproject.toml README.md /app/
COPY src /app/src
COPY data /app/data

RUN poetry install --only main --no-root && poetry install --only-root

CMD ["python", "-m", "bot1_service.main"]
