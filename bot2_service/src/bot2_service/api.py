from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict

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
        self.client = httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers={"Host": "server"})
        self._logged_in = False
        self._auth_token = None

    async def close(self):
        await self.client.aclose()

    async def login_dashboard(self) -> bool:
        if not (self.email and self.password):
            return False
        if self._logged_in and self._auth_token:
            return True
        try:
            resp = await self.client.post(
                f"{self.base_url}/auth/login",
                json={"email": self.email, "password": self.password},
            )
            if resp.status_code == 200:
                try:
                    token = resp.json().get("access")
                    if token:
                        self._auth_token = token
                        self._logged_in = True
                        return True
                    else:
                        logger.warning("Dashboard login response missing access token")
                except Exception:
                    logger.warning("Dashboard login response parsing failed")
            else:
                logger.warning("Dashboard login failed: %s %s", resp.status_code, resp.text)
        except Exception as exc:  # pragma: no cover - network guard
            logger.exception("Dashboard login error: %s", exc)
        return False

    async def get_programs(self) -> list[dict]:
        """Fetch directions (bakalavriat yo'nalishlari) as programs."""
        ok = await self.login_dashboard()
        if not ok:
            return []
        try:
            resp = await self.client.get(
                f"{self.base_url}/catalog/items/?type=direction",
                headers={"Authorization": f"Bearer {self._auth_token}"}
            )
            if resp.status_code == 401:
                logger.warning("Direction GET 401 - resetting auth")
                self._logged_in = False
                self._auth_token = None
                return []
            if resp.status_code != 200:
                logger.warning("Direction GET failed: %s %s", resp.status_code, resp.text)
                return []
            return resp.json().get("results", []) if isinstance(resp.json(), dict) else resp.json()
        except Exception as exc:  # pragma: no cover
            logger.exception("Direction fetch error: %s", exc)
            return []

    async def get_regions(self) -> list[dict]:
        """Fetch regions from catalog."""
        ok = await self.login_dashboard()
        if not ok:
            return []
        try:
            resp = await self.client.get(
                f"{self.base_url}/catalog/items/?type=region",
                headers={"Authorization": f"Bearer {self._auth_token}"}
            )
            if resp.status_code == 401:
                logger.warning("Region GET 401 - resetting auth")
                self._logged_in = False
                self._auth_token = None
                return []
            if resp.status_code != 200:
                logger.warning("Region GET failed: %s %s", resp.status_code, resp.text)
                return []
            return resp.json().get("results", []) if isinstance(resp.json(), dict) else resp.json()
        except Exception as exc:  # pragma: no cover
            logger.exception("Region fetch error: %s", exc)
            return []

    async def _post_service(self, path: str, payload: Dict[str, Any]) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.post(f"{self.base_url}{path}", json=payload, headers=headers)
        except Exception as exc:  # pragma: no cover
            logger.exception("POST %s failed: %s", path, exc)
            return ApiResult(ok=False, error=str(exc))
        if 200 <= resp.status_code < 300:
            try:
                data = resp.json()
            except Exception:
                data = resp.text
            return ApiResult(ok=True, data=data, status=resp.status_code)
        try:
            err = resp.json()
        except Exception:
            err = resp.text
        return ApiResult(ok=False, error=str(err), status=resp.status_code)

    async def submit_survey(self, payload: Dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot2/surveys/submit", payload)
