import base64
import logging

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)


def analyze(document) -> dict:
    url = settings.AI_SERVICE_URL.rstrip("/") + "/ai/document/analyze"
    payload = {
        "document_id": str(document.id),
        "doc_type": document.type,
        "file_b64": _read_b64(document.file),
        "context": {
            "student_id": document.student.student_external_id,
            "full_name": f"{document.student.first_name} {document.student.last_name}".strip(),
        },
    }
    r = httpx.post(url, json=payload, timeout=settings.AI_SERVICE_TIMEOUT)
    r.raise_for_status()
    return r.json()


def _read_b64(file_field) -> str:
    try:
        file_field.open("rb")
        return base64.b64encode(file_field.read()).decode()
    finally:
        file_field.close()
