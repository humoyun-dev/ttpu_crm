from __future__ import annotations

import time
from typing import List

from bot2_service.api import CrmApiClient

PROGRAM_FALLBACK = [
    {"id": 1, "code": "PRG_SE", "name": "Software Engineering"},
    {"id": 2, "code": "PRG_ME", "name": "Mechanical Engineering"},
    {"id": 3, "code": "PRG_BA", "name": "Business Administration"},
    {"id": 4, "code": "PRG_EE", "name": "Electrical Engineering"},
    {"id": 5, "code": "PRG_CE", "name": "Civil Engineering"},
]


class CatalogCache:
    def __init__(self, api: CrmApiClient, ttl_seconds: int = 900):
        self.api = api
        self.ttl_seconds = ttl_seconds
        self.cache: dict[str, dict] = {}

    async def get_programs(self) -> List[dict]:
        """Fetch programs from API with caching."""
        now = time.time()
        cached = self.cache.get("programs")
        if cached and now - cached["ts"] < self.ttl_seconds:
            return cached["data"]
        data = await self.api.get_programs()
        if not data:
            data = PROGRAM_FALLBACK
        self.cache["programs"] = {"ts": now, "data": data}
        return data

    async def get_regions(self) -> List[dict]:
        """Fetch regions from API with caching."""
        now = time.time()
        cached = self.cache.get("regions")
        if cached and now - cached["ts"] < self.ttl_seconds:
            return cached["data"]
        data = await self.api.get_regions()
        self.cache["regions"] = {"ts": now, "data": data}
        return data
