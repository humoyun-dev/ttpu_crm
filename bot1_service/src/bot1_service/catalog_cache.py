from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, List

from bot1_service.api import CrmApiClient
from bot1_service.config import settings

LOCAL_CATALOG_FILE = settings.data_dir / "catalog_local.json"

REGION_FALLBACK = [
    {"id": None, "code": "REG_TASH", "name": "Tashkent"},
    {"id": None, "code": "REG_TASHREG", "name": "Tashkent Region"},
    {"id": None, "code": "REG_AND", "name": "Andijan"},
    {"id": None, "code": "REG_BUK", "name": "Bukhara"},
    {"id": None, "code": "REG_FER", "name": "Fergana"},
    {"id": None, "code": "REG_JIZ", "name": "Jizzakh"},
    {"id": None, "code": "REG_NAV", "name": "Navoi"},
    {"id": None, "code": "REG_NAM", "name": "Namangan"},
    {"id": None, "code": "REG_QAR", "name": "Qarshi"},
    {"id": None, "code": "REG_SAM", "name": "Samarkand"},
    {"id": None, "code": "REG_SUR", "name": "Surkhandarya"},
    {"id": None, "code": "REG_SYR", "name": "Syrdarya"},
    {"id": None, "code": "REG_KHO", "name": "Khorezm"},
    {"id": None, "code": "REG_NUK", "name": "Nukus (Karakalpakstan)"},
    {"id": None, "code": "REG_FOREIGN", "name": "Foreign"},
]

TRACK_FALLBACK = [
    {"id": None, "code": "uzbek", "name": "Uzbek Track"},
    {"id": None, "code": "italian", "name": "Italian Track"},
    {"id": None, "code": "american", "name": "American Track"},
]


class CatalogCache:
    def __init__(self, api: CrmApiClient, ttl_seconds: int):
        self.api = api
        self.ttl_seconds = ttl_seconds
        self.cache: Dict[str, dict] = {}

    def _load_local(self, item_type: str) -> list[dict]:
        if LOCAL_CATALOG_FILE.exists():
            try:
                data = json.loads(LOCAL_CATALOG_FILE.read_text())
                return data.get(item_type, [])
            except Exception:
                return []
        if item_type == "region":
            return REGION_FALLBACK
        if item_type == "track":
            return TRACK_FALLBACK
        return []

    async def get_items(self, item_type: str) -> List[dict]:
        now = time.time()
        cached = self.cache.get(item_type)
        if cached and (now - cached["ts"] < self.ttl_seconds):
            return cached["data"]

        data = await self.api.get_catalog_items(item_type)
        if not data:
            data = self._load_local(item_type)

        self.cache[item_type] = {"ts": now, "data": data}
        return data

    async def get_regions(self) -> List[dict]:
        return await self.get_items("region")

    async def get_tracks(self) -> List[dict]:
        return await self.get_items("track")

    async def get_directions(self) -> List[dict]:
        return await self.get_items("direction")

    async def get_subjects(self) -> List[dict]:
        return await self.get_items("subject")
