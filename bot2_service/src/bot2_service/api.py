from __future__ import annotations

import asyncio
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
        self.client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=5.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )

    async def close(self):
        await self.client.aclose()

    async def _get_catalog(self, item_type: str) -> list[dict]:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.get(
                "/bot/catalog/items",
                params={"type": item_type},
                headers=headers,
            )
        except Exception as exc:  # pragma: no cover
            logger.exception("%s catalog fetch error: %s", item_type, exc)
            return []

        if resp.status_code != 200:
            logger.warning("%s catalog GET failed: %s %s", item_type, resp.status_code, resp.text)
            return []

        data = resp.json()
        if isinstance(data, dict):
            items = data.get("results", [])
            return items if isinstance(items, list) else []
        if isinstance(data, list):
            return data
        return []

    async def get_catalog_items(self, item_type: str) -> list[dict]:
        return await self._get_catalog(item_type)

    async def get_programs(self) -> list[dict]:
        return await self._get_catalog("direction")

    async def get_regions(self) -> list[dict]:
        return await self._get_catalog("region")

    async def _post_service(self, path: str, payload: dict[str, Any]) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        for attempt in (1, 2):
            try:
                resp = await self.client.post(path, json=payload, headers=headers)
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                # Connection-only retry: the request never reached the server,
                # so retrying is safe even for non-idempotent POSTs.
                logger.warning("POST %s connection error (attempt %d): %s", path, attempt, exc)
                if attempt == 1:
                    await asyncio.sleep(1)
                    continue
                return ApiResult(ok=False, error=f"Connection error: {exc}")
            except httpx.TimeoutException as exc:
                # Read/write/pool timeout — the server may have already committed,
                # so do NOT retry (unsafe for non-idempotent POSTs).
                logger.warning("POST %s timeout: %s", path, exc)
                return ApiResult(ok=False, error=f"Timeout: {exc}")
            except Exception as exc:  # pragma: no cover
                logger.exception("POST %s failed: %s", path, exc)
                return ApiResult(ok=False, error=str(exc))

            if 200 <= resp.status_code < 300:
                try:
                    data = resp.json()
                except Exception:
                    data = resp.text
                return ApiResult(ok=True, data=data, status=resp.status_code)

            # A response (even 5xx) means the server received the request; do not
            # retry non-idempotent POSTs on server errors.
            logger.warning("POST %s returned %s: %s", path, resp.status_code, resp.text[:500])
            try:
                err = resp.json()
            except Exception:
                err = resp.text
            return ApiResult(ok=False, error=str(err), status=resp.status_code)

        return ApiResult(ok=False, error="Max retries exceeded")

    async def verify(self, student_id: str, birth_date: str) -> ApiResult:
        return await self._post_service("/bot/verify", {
            "student_id": student_id,
            "birth_date": birth_date,
        })

    async def logout(self, telegram_user_id: int) -> ApiResult:
        """Unlink the Telegram account from its student so /start re-verifies."""
        return await self._post_service("/bot/logout", {
            "telegram_user_id": telegram_user_id,
        })

    async def register(
        self,
        telegram_user_id: int,
        student_id: str,
        consent: bool,
        language: str,
        username: str = "",
        first_name: str = "",
        last_name: str = "",
    ) -> ApiResult:
        return await self._post_service("/bot/register", {
            "student_id": student_id,
            "telegram_user_id": telegram_user_id,
            "consent": consent,
            "language": language,
            "username": username,
            "first_name": first_name,
            "last_name": last_name,
        })

    async def upload_document(
        self,
        student_external_id: str,
        doc_type: str,
        file_bytes: bytes,
        filename: str,
        mime_type: str = "application/octet-stream",
    ) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        for attempt in (1, 2):
            try:
                resp = await self.client.post(
                    "/bot/document",
                    data={"student_external_id": student_external_id, "doc_type": doc_type},
                    files={"file": (filename, file_bytes, mime_type)},
                    headers=headers,
                )
            except httpx.TimeoutException as exc:
                logger.warning("upload_document timeout (attempt %d): %s", attempt, exc)
                if attempt == 1:
                    continue
                return ApiResult(ok=False, error=f"Timeout: {exc}")
            except httpx.ConnectError as exc:
                logger.warning("upload_document connect error (attempt %d): %s", attempt, exc)
                if attempt == 1:
                    await asyncio.sleep(1)
                    continue
                return ApiResult(ok=False, error=f"Connection error: {exc}")
            except Exception as exc:  # pragma: no cover
                logger.exception("upload_document failed (attempt %d): %s", attempt, exc)
                if attempt == 1:
                    continue
                return ApiResult(ok=False, error=str(exc))

            if 200 <= resp.status_code < 300:
                try:
                    return ApiResult(ok=True, data=resp.json(), status=resp.status_code)
                except Exception:
                    return ApiResult(ok=True, data={}, status=resp.status_code)

            logger.warning("upload_document %s (attempt %d): %s", resp.status_code, attempt, resp.text[:300])
            if attempt == 1 and resp.status_code >= 500:
                await asyncio.sleep(1)
                continue
            try:
                err = resp.json()
            except Exception:
                err = resp.text
            return ApiResult(ok=False, error=str(err), status=resp.status_code)

        return ApiResult(ok=False, error="Max retries exceeded")

    async def get_student_profile(self, telegram_user_id: int) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.get(
                "/bot/profile",
                params={"telegram_user_id": telegram_user_id},
                headers=headers,
            )
        except Exception as exc:
            logger.warning("get_student_profile error: %s", exc)
            return ApiResult(ok=False, error=str(exc))
        if 200 <= resp.status_code < 300:
            try:
                return ApiResult(ok=True, data=resp.json())
            except Exception:
                return ApiResult(ok=True, data={})
        return ApiResult(ok=False, error=resp.text, status=resp.status_code)

    async def followup_answer(self, followup_id: str, answer: str, telegram_user_id: int) -> ApiResult:
        return await self._post_service("/bot/followup-answer", {
            "followup_id": followup_id,
            "answer": answer,
            "telegram_user_id": telegram_user_id,
        })

    async def submit_survey(self, payload: dict[str, Any]) -> ApiResult:
        return await self._post_service("/bot2/surveys/submit", payload)

    async def fsm_get(self, user_id: int) -> dict:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.get(f"/bot/fsm/{user_id}", headers=headers)
            if 200 <= resp.status_code < 300:
                return resp.json()
        except Exception as exc:
            logger.warning("fsm_get error user=%s: %s", user_id, exc)
        return {"state": None, "data": {}}

    async def fsm_put(self, user_id: int, state: str | None, data: dict) -> bool:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.put(
                f"/bot/fsm/{user_id}",
                json={"state": state, "data": data},
                headers=headers,
            )
        except Exception as exc:
            logger.warning("fsm_put error user=%s: %s", user_id, exc)
            return False
        if 200 <= resp.status_code < 300:
            return True
        logger.warning("fsm_put failed user=%s: %s %s", user_id, resp.status_code, resp.text[:200])
        return False

    async def fsm_delete(self, user_id: int) -> bool:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.delete(f"/bot/fsm/{user_id}", headers=headers)
        except Exception as exc:
            logger.warning("fsm_delete error user=%s: %s", user_id, exc)
            return False
        if 200 <= resp.status_code < 300:
            return True
        logger.warning("fsm_delete failed user=%s: %s %s", user_id, resp.status_code, resp.text[:200])
        return False
