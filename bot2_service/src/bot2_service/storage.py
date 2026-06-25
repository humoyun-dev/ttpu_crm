from typing import Any, Optional

from aiogram.fsm.state import State
from aiogram.fsm.storage.base import BaseStorage, StateType, StorageKey

from bot2_service.api import CrmApiClient


class ApiStorage(BaseStorage):
    """
    Aiogram FSM storage backed by the CRM API (BotFsmState DB table).
    Survives bot restarts — state/data are persisted per telegram_user_id.

    Single GET per (set_state + set_data) pair: both share an in-flight cache
    dict that is invalidated after each write so the next read is always fresh.
    """

    def __init__(self, api: CrmApiClient) -> None:
        self._api = api
        # Transient write-buffer: filled on first get_*, cleared after each put.
        self._buf: dict[int, dict[str, Any]] = {}

    def _uid(self, key: StorageKey) -> int:
        return key.user_id

    async def _fetch(self, uid: int) -> dict[str, Any]:
        if uid not in self._buf:
            self._buf[uid] = await self._api.fsm_get(uid)
        return self._buf[uid]

    def _state_str(self, state: StateType) -> Optional[str]:
        if state is None:
            return None
        if isinstance(state, State):
            return state.state
        return str(state)

    async def set_state(self, key: StorageKey, state: StateType = None) -> None:
        uid = self._uid(key)
        entry = await self._fetch(uid)
        entry["state"] = self._state_str(state)
        ok = await self._api.fsm_put(uid, state=entry["state"], data=entry.get("data", {}))
        if ok:
            self._buf.pop(uid, None)  # invalidate so next get re-reads from DB
        # else: keep buffered value so in-memory state stays consistent with the write

    async def get_state(self, key: StorageKey) -> Optional[str]:
        return (await self._fetch(self._uid(key))).get("state")

    async def set_data(self, key: StorageKey, data: dict[str, Any]) -> None:
        uid = self._uid(key)
        entry = await self._fetch(uid)
        entry["data"] = data
        ok = await self._api.fsm_put(uid, state=entry.get("state"), data=data)
        if ok:
            self._buf.pop(uid, None)  # invalidate
        # else: keep buffered value so in-memory state stays consistent with the write

    async def get_data(self, key: StorageKey) -> dict[str, Any]:
        return (await self._fetch(self._uid(key))).get("data", {})

    async def close(self) -> None:
        self._buf.clear()
