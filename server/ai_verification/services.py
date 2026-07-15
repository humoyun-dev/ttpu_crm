import json
import logging
import time

from django.conf import settings

from .pricing import calculate_cost
from .prompts import get_prompt

logger = logging.getLogger(__name__)

# 503 / 429 kabi o'tkinchi xatolar uchun retry sozlamalari
_RETRY_ATTEMPTS = 3          # jami urinishlar soni (birinchi + 2 retry)
_RETRY_BASE_DELAY = 1.0      # birinchi kutish (soniya); keyingisi 2x oshadi
_RETRYABLE_CODES = {"503", "429", "500"}
_RETRYABLE_STATUSES = {"UNAVAILABLE", "RESOURCE_EXHAUSTED", "INTERNAL"}


def _is_retryable(exc: Exception) -> bool:
    """Xato o'tkinchi (server yuklama / rate-limit) ekanligini tekshiradi."""
    msg = str(exc)
    for code in _RETRYABLE_CODES:
        if code in msg:
            return True
    for status in _RETRYABLE_STATUSES:
        if status in msg:
            return True
    return False


class GeminiVerificationService:
    """
    Gemini 2.5 Flash orqali hujjatlarni tekshirish xizmati.

    Yangi `google-genai` SDK ishlatiladi (eski `google-generativeai` emas).
    Gemini ga faqat xom bytes yuboriladi (base64 string emas — SDK o'zi kodlaydi),
    fayl URL hech qachon tashqariga chiqmaydi.

    Ishlatish:
        service = GeminiVerificationService()
        result = service.verify(file_bytes, mime_type, "cv")
    """

    MODEL_NAME = "gemini-2.5-flash"

    # MIME turlari Gemini qabul qiladi
    SUPPORTED_MIME_TYPES = {
        "image/jpeg", "image/png", "image/webp",
        "image/gif", "application/pdf",
    }

    def __init__(self):
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY settings da sozlanmagan")
        # Lazy import: app importi `google-genai` paketisiz ham yuklanadi,
        # paket faqat haqiqiy tekshiruv vaqtida kerak bo'ladi.
        from google import genai

        self._genai = genai
        self.client = genai.Client(api_key=settings.GEMINI_API_KEY)

    def verify(
        self,
        file_bytes: bytes,
        mime_type: str,
        document_type: str,
        student_name: str = "",
    ) -> dict:
        """
        Hujjatni Gemini orqali tekshiradi.

        Args:
            student_name: Tizimda saqlangan talabaning to'liq ismi. Berilsa,
                          Gemini hujjatdagi ism bilan solishtirib bayroq qo'yadi.

        Returns:
            {
                "confidence_score": float,
                "confidence_level": "green"|"yellow"|"red",
                "extracted_data": dict,   # name_match, document_name maydonlari bor
                "flags": list,            # name_mismatch / name_variant
                "summary": str,
            }
        """
        # MIME type tekshirish (image/jpg -> image/jpeg normalizatsiya)
        normalized_mime = mime_type.lower().replace("image/jpg", "image/jpeg")
        if normalized_mime not in self.SUPPORTED_MIME_TYPES:
            return self._error_result_with_usage(
                f"Qo'llab-quvvatlanmaydigan fayl turi: {mime_type}"
            )

        prompt = get_prompt(document_type, student_name=student_name)
        start = time.monotonic()

        from google.genai import types

        config_kwargs = dict(
            temperature=0.1,
            max_output_tokens=8192,
            response_mime_type="application/json",
        )
        thinking_cfg = self._build_thinking_config(types)
        if thinking_cfg is not None:
            config_kwargs["thinking_config"] = thinking_cfg

        contents = [
            types.Part.from_bytes(data=file_bytes, mime_type=normalized_mime),
            prompt,
        ]
        config = types.GenerateContentConfig(**config_kwargs)

        last_exc: Exception | None = None
        response = None
        for attempt in range(_RETRY_ATTEMPTS):
            try:
                response = self.client.models.generate_content(
                    model=self.MODEL_NAME,
                    contents=contents,
                    config=config,
                )
                last_exc = None
                break  # muvaffaqiyatli — chiqamiz
            except Exception as exc:
                last_exc = exc
                if _is_retryable(exc) and attempt < _RETRY_ATTEMPTS - 1:
                    delay = _RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "Gemini %s xato (urinish %d/%d), %.1fs kutilmoqda: %s",
                        "503/429" if _is_retryable(exc) else "xato",
                        attempt + 1, _RETRY_ATTEMPTS, delay, exc,
                    )
                    time.sleep(delay)
                else:
                    break  # qayta urinib bo'lmaydigan xato yoki urinishlar tugadi

        latency_ms = int((time.monotonic() - start) * 1000)

        if last_exc is not None:
            logger.error("Gemini API xatolik (barcha urinishlar tugadi): %s", last_exc, exc_info=True)
            result = self._error_result(f"Gemini API xatoligi: {last_exc}")
            result["_usage"] = self._build_usage(
                None, latency_ms, status="error", error_message=str(last_exc)
            )
            return result

        raw_text = response.text or ""

        result = self._parse_response(raw_text)
        result["_usage"] = self._build_usage(response, latency_ms, status="success")
        return result

    @staticmethod
    def _build_thinking_config(types):
        """`ThinkingConfig(thinking_budget=0)` ni faqat SDK qo'llab-quvvatlasa qaytaradi.
        google-genai 1.2.0 da bu maydon yo'q (pydantic 'extra_forbidden' xatosi beradi),
        shuning uchun mavjudligini tekshiramiz."""
        try:
            fields = getattr(types.ThinkingConfig, "model_fields", {})
            if "thinking_budget" in fields:
                return types.ThinkingConfig(thinking_budget=0)
        except Exception:
            pass
        return None

    def _build_usage(self, response, latency_ms, status="success", error_message=""):
        """Gemini javobidan token va xarajat ma'lumotini ajratadi (xom dict)."""
        input_tokens = output_tokens = thinking_tokens = 0

        meta = getattr(response, "usage_metadata", None) if response is not None else None
        if meta is not None:
            input_tokens = getattr(meta, "prompt_token_count", 0) or 0
            output_tokens = getattr(meta, "candidates_token_count", 0) or 0
            thinking_tokens = getattr(meta, "thoughts_token_count", 0) or 0
            # google-genai usage_metadata da candidates va thoughts ALOHIDA
            # (total = prompt + candidates + thoughts) — ayirish kerak emas.
            # Ikkalasi ham output narxida hisoblanadi (calculate_cost).

        total_tokens = input_tokens + output_tokens + thinking_tokens
        cost = calculate_cost(self.MODEL_NAME, input_tokens, output_tokens, thinking_tokens)

        return {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "thinking_tokens": thinking_tokens,
            "total_tokens": total_tokens,
            "cost_usd": cost,
            "latency_ms": latency_ms,
            "model_name": self.MODEL_NAME,
            "status": status,
            "error_message": error_message,
        }

    def _error_result_with_usage(self, message: str) -> dict:
        result = self._error_result(message)
        result["_usage"] = self._build_usage(None, 0, status="error", error_message=message)
        return result

    def _parse_response(self, raw_text: str) -> dict:
        """Gemini javobini JSON ga aylantiradi va validatsiya qiladi."""
        try:
            # Markdown kod bloklari bo'lsa tozalash (JSON rejimida odatda kerak emas)
            text = raw_text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])

            data = json.loads(text)

            # Confidence level hisoblash (agar berilmagan bo'lsa).
            # Modeldan kelgan qiymatni [0,1] oralig'iga qisamiz.
            score = max(0.0, min(1.0, float(data.get("confidence_score", 0.5))))
            if "confidence_level" not in data:
                data["confidence_level"] = self._score_to_level(score)

            # Majburiy maydonlar
            data.setdefault("extracted_data", {})
            data.setdefault("flags", [])
            data.setdefault("summary", "")
            data["confidence_score"] = round(score, 2)

            return data

        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            logger.warning("Gemini javobini parse qilib bo'lmadi: %s | Raw: %s", exc, raw_text[:200])
            return self._error_result("Javobni o'qib bo'lmadi — qayta urinib ko'ring")

    @staticmethod
    def _score_to_level(score: float) -> str:
        if score >= 0.75:
            return "green"
        elif score >= 0.45:
            return "yellow"
        else:
            return "red"

    @staticmethod
    def _error_result(message: str) -> dict:
        return {
            "confidence_score": 0.0,
            "confidence_level": "red",
            "extracted_data": {},
            "flags": ["processing_error"],
            "summary": f"Xatolik: {message}",
            "_error": True,
        }
