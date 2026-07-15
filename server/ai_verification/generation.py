"""Umumiy Gemini matn-generatsiya yordamchisi — barcha AI featurelar shuni ishlatadi.

`generate_text(prompt, files=..., operation=...)` → {"text", "ok", "usage"}.
Xarajat AIUsageLog'ga yoziladi. ai_verification.services bilan bir xil model/narx.
"""
import json
import logging
import time

from django.conf import settings

from .models import AIUsageLog
from .pricing import calculate_cost

logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-2.5-flash"
SUPPORTED_MIME = {"image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"}


def generate_text(
    prompt: str,
    *,
    operation: str,
    files: list[tuple[bytes, str]] | None = None,
    temperature: float = 0.3,
    max_output_tokens: int = 4096,
    json_mode: bool = False,
    verification=None,
) -> dict:
    """
    Gemini'dan matn (yoki JSON) generatsiya qiladi va xarajatni log qiladi.

    Args:
        operation: AIUsageLog uchun belgi (masalan "vacancy_post", "cv_skill_extraction").
        files: [(bytes, mime_type)] — multimodal kirish (CV/rasm).
        json_mode: True bo'lsa response_mime_type=application/json.

    Returns:
        {"text": str, "ok": bool, "usage": dict, "json": dict|None}
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY yo'q — %s o'tkazib yuborildi", operation)
        return {"text": "", "ok": False, "usage": {}, "json": None}

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    contents = []
    for data, mime in (files or []):
        m = (mime or "").lower().replace("image/jpg", "image/jpeg")
        if data and m in SUPPORTED_MIME:
            try:
                contents.append(types.Part.from_bytes(data=data, mime_type=m))
            except Exception:
                logger.warning("Multimodal fayl qo'shishda xato (op=%s)", operation)
    contents.append(prompt)

    cfg = dict(temperature=temperature, max_output_tokens=max_output_tokens)
    if json_mode:
        cfg["response_mime_type"] = "application/json"
    # Gemini 2.5 "thinking" max_output_tokens budjetini yeydi → javob uzilishi mumkin.
    # Bu vazifalar uzun fikrlashni talab qilmaydi, shuning uchun o'chiramiz.
    thinking_cfg = _build_thinking_config(types)
    if thinking_cfg is not None:
        cfg["thinking_config"] = thinking_cfg
    config = types.GenerateContentConfig(**cfg)

    start = time.monotonic()
    status, error, response, text = "success", "", None, ""
    try:
        response = client.models.generate_content(model=MODEL_NAME, contents=contents, config=config)
        text = (response.text or "").strip()
    except Exception as exc:
        logger.exception("generate_text xato (op=%s)", operation)
        status, error = "error", str(exc)
    latency_ms = int((time.monotonic() - start) * 1000)

    usage = _log_usage(response, latency_ms, status, error, operation, verification)

    parsed = None
    if json_mode and text:
        parsed = _safe_json(text)

    return {"text": text, "ok": status == "success" and bool(text), "usage": usage, "json": parsed}


def _build_thinking_config(types):
    """`ThinkingConfig(thinking_budget=0)` — faqat SDK qo'llab-quvvatlasa (eski versiyada yo'q)."""
    try:
        fields = getattr(types.ThinkingConfig, "model_fields", {})
        if "thinking_budget" in fields:
            return types.ThinkingConfig(thinking_budget=0)
    except Exception:
        pass
    return None


def _safe_json(raw: str):
    try:
        t = raw.strip()
        if t.startswith("```"):
            t = "\n".join(t.split("\n")[1:-1])
        return json.loads(t)
    except Exception:
        logger.warning("JSON parse xato")
        return None


def _log_usage(response, latency_ms, status, error, operation, verification) -> dict:
    input_t = output_t = thinking_t = 0
    meta = getattr(response, "usage_metadata", None) if response is not None else None
    if meta is not None:
        input_t = getattr(meta, "prompt_token_count", 0) or 0
        output_t = getattr(meta, "candidates_token_count", 0) or 0
        thinking_t = getattr(meta, "thoughts_token_count", 0) or 0
        # google-genai usage_metadata da candidates va thoughts ALOHIDA
        # (total = prompt + candidates + thoughts) — ayirish kerak emas;
        # ikkalasi ham output narxida hisoblanadi (calculate_cost).
    cost = calculate_cost(MODEL_NAME, input_t, output_t, thinking_t)
    usage = {
        "input_tokens": input_t, "output_tokens": output_t, "thinking_tokens": thinking_t,
        "total_tokens": input_t + output_t + thinking_t, "cost_usd": cost,
        "latency_ms": latency_ms, "model_name": MODEL_NAME, "status": status, "error_message": error,
    }
    try:
        AIUsageLog.objects.create(
            verification=verification,
            operation=operation,
            model_name=MODEL_NAME,
            input_tokens=input_t, output_tokens=output_t, thinking_tokens=thinking_t,
            total_tokens=input_t + output_t + thinking_t,
            cost_usd=cost,
            status="success" if status == "success" else "error",
            error_message=error[:500],
            latency_ms=latency_ms,
        )
    except Exception:
        logger.exception("AIUsageLog yozishda xato (op=%s)", operation)
    return usage
