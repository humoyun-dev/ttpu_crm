from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from bot2_service.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ApiResult:
    ok: bool
    data: Any = None
    error: str | None = None
    status: int | None = None


class CrmApiClient:
    def __init__(self):
        self.base_url = settings.server_base_url
        self.service_token = settings.service_token
        self.email = settings.dashboard_email
        self.password = settings.dashboard_password
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(15.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        self._logged_in = False
        self._auth_token: str | None = None

    async def close(self):
        await self.client.aclose()

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._auth_token}"} if self._auth_token else {}

    async def login_dashboard(self) -> bool:
        if not (self.email and self.password):
            logger.warning("Dashboard credentials are missing for bot2 service")
            return False

        if self._logged_in and self._auth_token:
            return True

        try:
            resp = await self.client.post(
                "/auth/login",
                json={"email": self.email, "password": self.password},
            )
        except Exception as exc:  # pragma: no cover - network guard
            logger.exception("Dashboard login error: %s", exc)
            return False

        if resp.status_code != 200:
            logger.warning("Dashboard login failed: %s %s", resp.status_code, resp.text)
            return False

        try:
            token = resp.json().get("access")
        except Exception:
            logger.warning("Dashboard login response parsing failed")
            return False

        if not token:
            logger.warning("Dashboard login response missing access token")
            return False

        self._auth_token = token
        self._logged_in = True
        return True

    async def _get_catalog(self, item_type: str) -> list[dict]:
        if not await self.login_dashboard():
            return []

        for attempt in (1, 2):
            try:
                resp = await self.client.get(
                    "/catalog/items/",
                    params={"type": item_type, "is_active": "true"},
                    headers=self._auth_headers(),
                )
            except Exception as exc:  # pragma: no cover
                logger.exception("%s fetch error: %s", item_type, exc)
                return []

            if resp.status_code == 401 and attempt == 1:
                logger.info("%s GET 401 - relogin and retry", item_type)
                self._logged_in = False
                self._auth_token = None
                if await self.login_dashboard():
                    continue

            if resp.status_code != 200:
                logger.warning("%s GET failed: %s %s", item_type, resp.status_code, resp.text)
                return []

            data = resp.json()
            if isinstance(data, dict):
                items = data.get("results", [])
                return items if isinstance(items, list) else []
            if isinstance(data, list):
                return data
            return []

        return []

    async def get_catalog_items(self, item_type: str) -> list[dict]:
        """Generic method – fetch any catalog type (direction, region, subject, track, …)."""
        return await self._get_catalog(item_type)

    async def get_programs(self) -> list[dict]:
        """Fetch directions (bakalavriat yo'nalishlari) as programs."""
        return await self._get_catalog("direction")

    async def get_regions(self) -> list[dict]:
        """Fetch regions from catalog."""
        return await self._get_catalog("region")

    async def _post_service(self, path: str, payload: dict[str, Any]) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        for attempt in (1, 2):
            try:
                resp = await self.client.post(path, json=payload, headers=headers)
            except httpx.TimeoutException as exc:
                logger.warning("POST %s timeout (attempt %d): %s", path, attempt, exc)
                if attempt == 1:
                    continue
                return ApiResult(ok=False, error=f"Timeout: {exc}")
            except httpx.ConnectError as exc:
                logger.warning("POST %s connection error (attempt %d): %s", path, attempt, exc)
                if attempt == 1:
                    import asyncio
                    await asyncio.sleep(1)
                    continue
                return ApiResult(ok=False, error=f"Connection error: {exc}")
            except Exception as exc:  # pragma: no cover
                logger.exception("POST %s failed (attempt %d): %s", path, attempt, exc)
                if attempt == 1:
                    continue
                return ApiResult(ok=False, error=str(exc))

            if 200 <= resp.status_code < 300:
                try:
                    data = resp.json()
                except Exception:
                    data = resp.text
                return ApiResult(ok=True, data=data, status=resp.status_code)

            logger.warning("POST %s returned %s (attempt %d): %s", path, resp.status_code, attempt, resp.text[:500])
            if attempt == 1 and resp.status_code >= 500:
                import asyncio
                await asyncio.sleep(1)
                continue

            try:
                err = resp.json()
            except Exception:
                err = resp.text
            return ApiResult(ok=False, error=str(err), status=resp.status_code)

        return ApiResult(ok=False, error="Max retries exceeded")

    async def submit_survey(self, payload: dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot2/surveys/submit", payload)
