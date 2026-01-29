import os
from dataclasses import dataclass
from pathlib import Path

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


settings = Settings(
    bot_token=_get_env("BOT_TOKEN", ""),
    server_base_url=_get_env("SERVER_BASE_URL", "http://localhost:8000/api/v1").rstrip("/"),
    service_token=_get_env("SERVICE_TOKEN", ""),
    dashboard_email=_get_env("DASHBOARD_EMAIL"),
    dashboard_password=_get_env("DASHBOARD_PASSWORD"),
    default_language=_get_env("DEFAULT_LANGUAGE", "uz"),
)

if not settings.bot_token:
    raise RuntimeError("BOT_TOKEN is required in .env")
if not settings.service_token:
    raise RuntimeError("SERVICE_TOKEN is required (raw bot2 token).")
