"""CV'dan AI bilan ko'nikma profili ajratish (Gemini multimodal).

Natija Bot2Student.ai_skills'ga yoziladi — matching va qidiruv uchun ishlatiladi.
"""
import logging

from django.utils import timezone

from ai_verification.generation import generate_text
from .models import Bot2Document, Bot2Student

logger = logging.getLogger(__name__)

PROMPT = """Siz universitet bandlik markazining HR yordamchisisiz. Biriktirilgan CV faylini tahlil qiling va talabaning ko'nikma profilini JSON ko'rinishida qaytaring.

Quyidagi JSON sxemasiga qat'iy amal qiling (o'zbek tilida, qiymatlar bo'sh bo'lishi mumkin):
{
  "skills": ["texnik va yumshoq ko'nikmalar ro'yxati, masalan Python, Loyiha boshqaruvi"],
  "languages": ["til va daraja, masalan Ingliz (B2)"],
  "experience_summary": "1-2 jumlada ish/loyiha tajribasi qisqacha",
  "level": "junior | mid | senior (umumiy daraja)",
  "education": "ta'lim haqida qisqa eslatma"
}
Faqat JSON qaytaring. CV'da ma'lumot bo'lmasa, tegishli maydonni bo'sh ([] yoki "") qoldiring."""


def extract_for_student(student: Bot2Student) -> bool:
    """Talabaning eng so'nggi CV'sidan ko'nikma profilini ajratadi. True = muvaffaqiyat."""
    cv = (
        Bot2Document.objects
        .filter(student=student, doc_type="cv")
        .order_by("-created_at")
        .first()
    )
    if not cv or not cv.file:
        logger.debug("Talaba %s da CV yo'q — skill extraction o'tkazildi", student.student_external_id)
        return False

    mime = (cv.mime_type or "").lower()
    try:
        cv.file.seek(0)
        file_bytes = cv.file.read()
    except Exception:
        logger.warning("CV o'qishda xato (student=%s)", student.id)
        return False

    result = generate_text(
        PROMPT,
        operation="cv_skill_extraction",
        files=[(file_bytes, mime)],
        json_mode=True,
        temperature=0.2,
        max_output_tokens=4096,
    )
    data = result.get("json")
    if not result["ok"] or not isinstance(data, dict):
        return False

    # Faqat kutilgan kalitlarni saqlaymiz.
    student.ai_skills = {
        "skills": data.get("skills", []) or [],
        "languages": data.get("languages", []) or [],
        "experience_summary": data.get("experience_summary", "") or "",
        "level": data.get("level", "") or "",
        "education": data.get("education", "") or "",
    }
    student.ai_skills_at = timezone.now()
    student.save(update_fields=["ai_skills", "ai_skills_at", "updated_at"])
    return True


def extract_for_student_async(student: Bot2Student):
    """CV ko'nikma ajratishni umumiy AI fon pool'ida ishga tushiradi
    (HTTP'ni bloklamaydi; pool DB ulanishlar sonini chegaralaydi)."""
    from ai_verification.orchestration import submit_ai_task

    def _run():
        try:
            extract_for_student(student)
        except Exception:
            logger.exception("CV skill extraction xato (student=%s)", student.id)

    submit_ai_task(_run)
