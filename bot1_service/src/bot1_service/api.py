from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

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
        # Disable redirect following to avoid hitting Django admin login, and set base headers.
        self.client = httpx.AsyncClient(timeout=15.0, follow_redirects=True, headers={"Host": "server"})
        self._logged_in = False
        self._auth_token: str | None = None

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
                        logger.info("Dashboard login successful, token acquired")
                        return True
                    else:
                        logger.warning("Dashboard login response missing access token")
                        return False
                except Exception as e:
                    logger.warning("Dashboard login response parse error: %s", e)
                    return False
            logger.warning("Dashboard login failed: %s %s", resp.status_code, resp.text)
        except Exception as exc:  # pragma: no cover - network guard
            logger.exception("Dashboard login error: %s", exc)
        return False

    async def get_catalog_items(self, item_type: str) -> list[dict]:
        ok = await self.login_dashboard()
        if not ok:
            logger.warning("Cannot fetch catalog - not logged in")
            return []
        try:
            headers = {"Authorization": f"Bearer {self._auth_token}"}
            resp = await self.client.get(
                f"{self.base_url}/catalog/items/",
                params={"type": item_type, "is_active": "true"},
                headers=headers,
            )
            if resp.status_code != 200:
                logger.warning("Catalog GET %s failed: %s %s", item_type, resp.status_code, resp.text)
                # Reset login state if unauthorized
                if resp.status_code == 401:
                    self._logged_in = False
                    self._auth_token = None
                return []
            data = resp.json()
            # Handle both paginated response and direct list
            if isinstance(data, dict) and "results" in data:
                results = data["results"]
                logger.info("Fetched %d %s items (paginated)", len(results), item_type)
                return results
            elif isinstance(data, list):
                logger.info("Fetched %d %s items (direct list)", len(data), item_type)
                return data
            else:
                logger.warning("Unexpected catalog response format: %s, data type: %s", type(data), data)
                return []
        except Exception as exc:  # pragma: no cover - network guard
            logger.exception("Catalog fetch error: %s", exc)
            return []

    async def _post_service(self, path: str, payload: Dict[str, Any]) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.post(f"{self.base_url}{path}", json=payload, headers=headers)
        except Exception as exc:  # pragma: no cover - network guard
            logger.exception("POST %s failed: %s", path, exc)
            return ApiResult(ok=False, error=str(exc))
        if 200 <= resp.status_code < 300:
            data = None
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

    async def upsert_applicant(self, payload: Dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/applicants/upsert", payload)

    async def submit_campus_tour(self, payload: Dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/campus-tour/submit", payload)

    async def submit_foundation(self, payload: Dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/foundation/submit", payload)

    async def submit_polito_academy(self, payload: Dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/polito-academy/submit", payload)

    async def submit_admissions(self, payload: Dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot1/admissions-2026/submit", payload)
