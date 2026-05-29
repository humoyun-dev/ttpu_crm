from __future__ import annotations

import asyncio
import logging
import time
from typing import List

from bot2_service.api import CrmApiClient

logger = logging.getLogger(__name__)


class CatalogCache:
    def __init__(self, api: CrmApiClient, ttl_seconds: int = 900):
        self.api = api
        self.ttl_seconds = ttl_seconds
        self._cache: dict[str, dict] = {}
        self._lock = asyncio.Lock()

    async def _get_cached(self, key: str, item_type: str) -> List[dict]:
        async with self._lock:
            now = time.time()
            cached = self._cache.get(key)
            if cached and now - cached["ts"] < self.ttl_seconds:
                return cached["data"]
            data = await self.api.get_catalog_items(item_type)
            if data:
                self._cache[key] = {"ts": now, "data": data}
                logger.info("Cached %d %s items from catalog", len(data), item_type)
            else:
                logger.warning("No %s items returned from catalog API", item_type)
            return data

    async def get_programs(self) -> List[dict]:
        return await self._get_cached("programs", "direction")

    async def get_regions(self) -> List[dict]:
        return await self._get_cached("regions", "region")
