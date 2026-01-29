from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Dict, List, Optional

from bot1_service.config import settings

STORE_FILE = settings.data_dir / "bot1_store.json"


@dataclass
class ApplicationRecord:
    kind: str
    payload: dict
    response: dict | None = None
    meta: dict = field(default_factory=dict)


@dataclass
class UserProfile:
    user_id: int
    chat_id: int
    language: str
    phone: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    email: str | None = None
    region_id: str | None = None
    region_label: str | None = None
    gender: str | None = None
    birth_date: str | None = None
    extra_phone: str | None = None
    meta: dict = field(default_factory=dict)
    applications: List[ApplicationRecord] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "chat_id": self.chat_id,
            "language": self.language,
            "phone": self.phone,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "username": self.username,
            "email": self.email,
            "region_id": self.region_id,
            "region_label": self.region_label,
            "gender": self.gender,
            "birth_date": self.birth_date,
            "extra_phone": self.extra_phone,
            "meta": self.meta,
            "applications": [
                {"kind": app.kind, "payload": app.payload, "response": app.response, "meta": app.meta}
                for app in self.applications
            ],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "UserProfile":
        apps = []
        for app in data.get("applications", []):
            meta = app.get("meta") or {}
            apps.append(ApplicationRecord(kind=app.get("kind"), payload=app.get("payload", {}), response=app.get("response"), meta=meta))
        return cls(
            user_id=data["user_id"],
            chat_id=data.get("chat_id", 0),
            language=data.get("language", "uz"),
            phone=data.get("phone"),
            first_name=data.get("first_name"),
            last_name=data.get("last_name"),
            username=data.get("username"),
            email=data.get("email"),
            region_id=data.get("region_id"),
            region_label=data.get("region_label"),
            gender=data.get("gender"),
            birth_date=data.get("birth_date"),
            extra_phone=data.get("extra_phone"),
            meta=data.get("meta") or {},
            applications=apps,
        )


class Store:
    def __init__(self, path: Path = STORE_FILE):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = Lock()
        self._data: Dict[str, dict] = {}
        self._load()

    def _load(self):
        if self.path.exists():
            try:
                with self.path.open("r", encoding="utf-8") as f:
                    self._data = json.load(f)
            except Exception:
                self._data = {}

    def _save(self):
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(self._data, f, indent=2)

    def get_profile(self, user_id: int) -> Optional[UserProfile]:
        data = self._data.get(str(user_id))
        if not data:
            return None
        return UserProfile.from_dict(data)

    def upsert_profile(self, profile: UserProfile) -> UserProfile:
        with self.lock:
            self._data[str(profile.user_id)] = profile.to_dict()
            self._save()
        return profile

    def update_fields(self, user_id: int, **fields) -> UserProfile:
        profile = self.get_profile(user_id)
        if not profile:
            profile = UserProfile(user_id=user_id, chat_id=0, language=settings.default_language)
        for key, value in fields.items():
            if hasattr(profile, key):
                setattr(profile, key, value)
        return self.upsert_profile(profile)

    def append_application(self, user_id: int, record: ApplicationRecord) -> UserProfile:
        profile = self.get_profile(user_id)
        if not profile:
            raise ValueError("Profile missing for application append.")
        profile.applications.append(record)
        return self.upsert_profile(profile)
