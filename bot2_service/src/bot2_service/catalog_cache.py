from __future__ import annotations

import logging
import time
from typing import List

from bot2_service.api import CrmApiClient

logger = logging.getLogger(__name__)


class CatalogCache:
    """Cache wrapper for catalog items from CRM API (shared with bot1)."""

    def __init__(self, api: CrmApiClient, ttl_seconds: int = 900):
        self.api = api
        self.ttl_seconds = ttl_seconds
        self.cache: dict[str, dict] = {}

    async def _get_cached(self, key: str, item_type: str) -> List[dict]:
        now = time.time()
        cached = self.cache.get(key)
        if cached and now - cached["ts"] < self.ttl_seconds:
            return cached["data"]
        data = await self.api.get_catalog_items(item_type)
        if data:
            self.cache[key] = {"ts": now, "data": data}
            logger.info("Cached %d %s items from catalog", len(data), item_type)
        else:
            logger.warning("No %s items returned from catalog API", item_type)
        return data

    async def get_programs(self) -> List[dict]:
        """Fetch directions (yo'nalishlar) from shared catalog."""
        return await self._get_cached("programs", "direction")

    async def get_regions(self) -> List[dict]:
        """Fetch regions from shared catalog."""
        return await self._get_cached("regions", "region")

    async def get_subjects(self) -> List[dict]:
        """Fetch subjects (fanlar) from shared catalog."""
        return await self._get_cached("subjects", "subject")

    async def get_tracks(self) -> List[dict]:
        """Fetch tracks (tarmoqlar) from shared catalog."""
        return await self._get_cached("tracks", "track")
