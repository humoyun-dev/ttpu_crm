from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from bot1_service.config import settings

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
            logger.warning("Dashboard credentials are missing for bot1 service")
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
        except Exception as exc:  # pragma: no cover - malformed response
            logger.warning("Dashboard login response parse error: %s", exc)
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
            except Exception as exc:  # pragma: no cover - network guard
                logger.exception("Catalog fetch error (%s): %s", item_type, exc)
                return []

            if resp.status_code == 401 and attempt == 1:
                self._logged_in = False
                self._auth_token = None
                if await self.login_dashboard():
                    continue

            if resp.status_code != 200:
                logger.warning("Catalog GET %s failed: %s %s", item_type, resp.status_code, resp.text)
                return []

            try:
                data = resp.json()
            except Exception as exc:
                logger.warning("Catalog GET %s returned non-JSON payload: %s", item_type, exc)
                return []

            if isinstance(data, dict):
                results = data.get("results", [])
                return results if isinstance(results, list) else []
            if isinstance(data, list):
                return data

            logger.warning("Unexpected catalog response format for %s: %s", item_type, type(data).__name__)
            return []

        return []

    async def get_catalog_items(self, item_type: str) -> list[dict]:
        return await self._get_catalog(item_type)

    async def _post_service(self, path: str, payload: dict[str, Any]) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.post(path, json=payload, headers=headers)
        except Exception as exc:  # pragma: no cover - network guard
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

    async def upsert_applicant(self, payload: dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/applicants/upsert", payload)

    async def submit_campus_tour(self, payload: dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/campus-tour/submit", payload)

    async def submit_foundation(self, payload: dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/foundation/submit", payload)

    async def submit_polito_academy(self, payload: dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/polito-academy/submit", payload)

    async def submit_admissions(self, payload: dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/admissions-2026/submit", payload)
