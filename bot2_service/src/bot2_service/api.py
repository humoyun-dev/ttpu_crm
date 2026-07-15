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


class FsmStorageError(RuntimeError):
    """FSM holat API'si ishlamayapti (bo'sh holat bilan adashtirmaslik kerak).

    ApiStorage bu xatoni yutmaydi va kesh ham qilmaydi — aks holda bitta API
    uzilishi foydalanuvchini bot qayta ishga tushgunga qadar "yopishib qolgan"
    bo'sh holatda qoldirar edi.
    """


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
        survey_session_key: str = "",
    ) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        data = {"student_external_id": student_external_id, "doc_type": doc_type}
        # Binds the document to its survey run server-side (see bot_upload_document).
        if survey_session_key:
            data["survey_session_key"] = survey_session_key
        for attempt in (1, 2):
            try:
                resp = await self.client.post(
                    "/bot/document",
                    data=data,
                    files={"file": (filename, file_bytes, mime_type)},
                    headers=headers,
                )
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                # Connection-only retry: the request never reached the server,
                # so retrying is safe even for this non-idempotent POST.
                logger.warning("upload_document connection error (attempt %d): %s", attempt, exc)
                if attempt == 1:
                    await asyncio.sleep(1)
                    continue
                return ApiResult(ok=False, error=f"Connection error: {exc}")
            except httpx.TimeoutException as exc:
                # Read/write/pool timeout — the server may have already stored the
                # document, so do NOT retry (would create duplicates).
                logger.warning("upload_document timeout: %s", exc)
                return ApiResult(ok=False, error=f"Timeout: {exc}")
            except Exception as exc:  # pragma: no cover
                logger.exception("upload_document failed: %s", exc)
                return ApiResult(ok=False, error=str(exc))

            if 200 <= resp.status_code < 300:
                try:
                    return ApiResult(ok=True, data=resp.json(), status=resp.status_code)
                except Exception:
                    return ApiResult(ok=True, data={}, status=resp.status_code)

            # A response (even 5xx) means the server received the request; do not
            # retry non-idempotent POSTs on server errors.
            logger.warning("upload_document %s: %s", resp.status_code, resp.text[:300])
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

    # ── Amaliyot (internship) ─────────────────────────────────────────────────
    async def create_internship(
        self,
        telegram_id: int,
        *,
        employer_id: str = "",
        company_name: str = "",
        note: str = "",
    ) -> ApiResult:
        payload: dict[str, Any] = {"telegram_id": telegram_id}
        if employer_id:
            payload["employer_id"] = employer_id
        if company_name:
            payload["company_name"] = company_name
        if note:
            payload["note"] = note
        return await self._post_service("/bot/internship", payload)

    async def internship_status(self, telegram_id: int) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.get(
                "/bot/internship/status",
                params={"telegram_id": telegram_id},
                headers=headers,
            )
        except Exception as exc:
            logger.warning("internship_status error: %s", exc)
            return ApiResult(ok=False, error=str(exc))
        if 200 <= resp.status_code < 300:
            try:
                return ApiResult(ok=True, data=resp.json(), status=resp.status_code)
            except Exception:
                return ApiResult(ok=True, data={}, status=resp.status_code)
        return ApiResult(ok=False, error=resp.text, status=resp.status_code)

    async def list_employers(self, q: str = "", limit: int = 8, offset: int = 0) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if q:
            params["q"] = q
        try:
            resp = await self.client.get("/bot/employers", params=params, headers=headers)
        except Exception as exc:
            logger.warning("list_employers error: %s", exc)
            return ApiResult(ok=False, error=str(exc))
        if 200 <= resp.status_code < 300:
            try:
                return ApiResult(ok=True, data=resp.json(), status=resp.status_code)
            except Exception:
                return ApiResult(ok=True, data={"results": [], "count": 0}, status=resp.status_code)
        return ApiResult(ok=False, error=resp.text, status=resp.status_code)

    async def fsm_get(self, user_id: int) -> dict:
        """Returns {state, data}. Raises FsmStorageError on ANY API failure —
        an error must never be mistaken for (and cached as) an empty state."""
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.get(f"/bot/fsm/{user_id}", headers=headers)
        except Exception as exc:
            logger.warning("fsm_get error user=%s: %s", user_id, exc)
            raise FsmStorageError(f"fsm_get failed for user {user_id}: {exc}") from exc
        if 200 <= resp.status_code < 300:
            try:
                payload = resp.json()
            except Exception as exc:
                raise FsmStorageError(f"fsm_get invalid JSON for user {user_id}: {exc}") from exc
            if isinstance(payload, dict):
                return {"state": payload.get("state"), "data": payload.get("data") or {}}
            raise FsmStorageError(f"fsm_get unexpected payload for user {user_id}")
        logger.warning("fsm_get failed user=%s: %s %s", user_id, resp.status_code, resp.text[:200])
        raise FsmStorageError(f"fsm_get HTTP {resp.status_code} for user {user_id}")

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

    async def get_vacancies(
        self, telegram_user_id: int, page: int = 1, page_size: int = 5
    ) -> ApiResult:
        headers = {"X-SERVICE-TOKEN": self.service_token}
        try:
            resp = await self.client.get(
                "/vacancies/feed",
                params={"telegram_user_id": telegram_user_id, "page": page, "page_size": page_size},
                headers=headers,
            )
        except Exception as exc:
            logger.warning("get_vacancies error: %s", exc)
            return ApiResult(ok=False, error=str(exc))
        if 200 <= resp.status_code < 300:
            try:
                return ApiResult(ok=True, data=resp.json(), status=resp.status_code)
            except Exception:
                return ApiResult(ok=True, data={})
        return ApiResult(ok=False, error=resp.text, status=resp.status_code)
