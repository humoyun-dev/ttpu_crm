import json
import logging

from django.conf import settings

from .prompts import get_prompt

logger = logging.getLogger(__name__)


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
    ) -> dict:
        """
        Hujjatni Gemini orqali tekshiradi.

        Returns:
            {
                "confidence_score": float,
                "confidence_level": "green"|"yellow"|"red",
                "extracted_data": dict,
                "flags": list,
                "summary": str,
            }
        """
        # MIME type tekshirish (image/jpg -> image/jpeg normalizatsiya)
        normalized_mime = mime_type.lower().replace("image/jpg", "image/jpeg")
        if normalized_mime not in self.SUPPORTED_MIME_TYPES:
            return self._error_result(f"Qo'llab-quvvatlanmaydigan fayl turi: {mime_type}")

        prompt = get_prompt(document_type)

        try:
            from google.genai import types

            response = self.client.models.generate_content(
                model=self.MODEL_NAME,
                contents=[
                    # Xom bytes — SDK base64 ni o'zi qiladi
                    types.Part.from_bytes(data=file_bytes, mime_type=normalized_mime),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,            # Past temperature = barqaror javob
                    max_output_tokens=2048,
                    response_mime_type="application/json",  # JSON rejimi
                    # 2.5 Flash "thinking" modeli — strukturali ajratish uchun
                    # o'ylashni o'chiramiz (tezroq, arzonroq, JSON budjetini yemaydi).
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
            raw_text = response.text or ""
        except Exception as exc:
            logger.error("Gemini API xatolik: %s", exc, exc_info=True)
            return self._error_result(f"Gemini API xatoligi: {exc}")

        return self._parse_response(raw_text)

    def _parse_response(self, raw_text: str) -> dict:
        """Gemini javobini JSON ga aylantiradi va validatsiya qiladi."""
        try:
            # Markdown kod bloklari bo'lsa tozalash (JSON rejimida odatda kerak emas)
            text = raw_text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])

            data = json.loads(text)

            # Confidence level hisoblash (agar berilmagan bo'lsa)
            score = float(data.get("confidence_score", 0.5))
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
