import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv()


@dataclass
class Settings:
    bot_token: str
    server_base_url: str
    service_token: str
    dashboard_email: str | None
    dashboard_password: str | None
    default_language: str


def _get_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    if value is None or value == "":
        return default
    return value


def _validate_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"Invalid SERVER_BASE_URL: {url!r}")
    return url.rstrip("/")


settings = Settings(
    bot_token=_get_env("BOT_TOKEN", ""),
    server_base_url=_validate_url(_get_env("SERVER_BASE_URL", "http://localhost:8000/api/v1")),
    service_token=_get_env("SERVICE_TOKEN", ""),
    dashboard_email=_get_env("DASHBOARD_EMAIL"),
    dashboard_password=_get_env("DASHBOARD_PASSWORD"),
    default_language=_get_env("DEFAULT_LANGUAGE", "uz"),
)

if not settings.bot_token:
    raise RuntimeError("BOT_TOKEN is required in .env")
if not settings.service_token:
    raise RuntimeError("SERVICE_TOKEN is required (raw bot2 token).")
