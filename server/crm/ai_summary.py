"""Korxona sahifasi uchun AI nomzod tavsifi (Gemini, multimodal — profil + CV + so'rovnoma).

Umumiy `ai_verification.generation.generate_text` orqali ishlaydi (thinking o'chirilgan,
xarajat AIUsageLog'ga yoziladi). Fon-thread'da chaqiriladi — HTTP'ni bloklamaydi.
"""
import json
import logging

from django.utils import timezone

from ai_verification.generation import generate_text, SUPPORTED_MIME
from bot2.models import Bot2Document

logger = logging.getLogger(__name__)

GENDER = {"male": "erkak", "female": "ayol"}

PROMPT = """Siz bandlik markazining HR yordamchisisiz. Quyidagi talaba haqida ish beruvchi uchun TUZILGAN (strukturali) ma'lumot tayyorlang. HR uni tez ko'zdan kechiradi — uzun matn EMAS, qisqa va aniq qismlar kerak.

Faqat JSON qaytaring:
{{
  "headline": "1 qisqa jumla: kim va qaysi rolga eng mos (masalan: 'Junior Frontend Developer — React/Next.js')",
  "education": "Yo'nalish, kurs, universitet (qisqa, masalan: 'Software Engineering, 1-kurs, TTPU')",
  "skills": ["asosiy texnik ko'nikma/texnologiyalar, har biri qisqa"],
  "languages": ["til va daraja, masalan: 'Ingliz (B2)'"],
  "experience": ["muhim loyiha yoki tajriba — har biri 1 qisqa qator"],
  "fit": "qaysi lavozim/sohaga mos (qisqa)"
}}

Qoidalar:
- CV'dagi eng muhim, ish beruvchi uchun foydali ma'lumotni oling. Umumiy gaplar va ortiqcha tafsilotni QO'SHMANG.
- Har bir massiv elementi qisqa bo'lsin (bir necha so'z yoki 1 qator).
- skills: 5-12 ta eng muhimi. experience: 2-5 ta eng muhimi.
- Faqat haqiqiy ma'lumot; to'qimang. Ma'lumot yo'q bo'lsa massivni bo'sh ([]) yoki qatorni "" qoldiring.
- O'zbek tilida.

Talaba ma'lumotlari:
{context}
"""


def _build_context(ls) -> str:
    s = ls.student
    name = f"{s.first_name} {s.last_name}".strip() or s.student_external_id
    roster = getattr(s, "roster", None)
    program = roster.program.name if roster and roster.program_id else ""
    course = roster.course_year if roster else None
    region = s.region.name if s.region_id else ""
    survey = s.survey_responses.order_by("-submitted_at").first()

    lines = [f"Ism: {name}"]
    if program:
        lines.append("Yo'nalish: " + program + (f", {course}-kurs" if course else ""))
    if region:
        lines.append(f"Hudud: {region}")
    if s.gender in GENDER:
        lines.append(f"Jins: {GENDER[s.gender]}")
    if survey:
        if survey.employment_status:
            emp = "ishlamoqda" if survey.employment_status == "employed" else "ishlamayapti"
            lines.append(f"Bandlik holati: {emp}")
            if survey.employment_company:
                lines.append(f"Ish joyi: {survey.employment_company}")
            if survey.employment_role:
                lines.append(f"Lavozim: {survey.employment_role}")
        if survey.suggestions:
            lines.append(f"Qo'shimcha izoh: {survey.suggestions[:500]}")
        if isinstance(survey.answers, dict) and survey.answers:
            lines.append("So'rovnoma javoblari: " + json.dumps(survey.answers, ensure_ascii=False)[:800])

    # Oldindan ajratilgan AI ko'nikma profili (bo'lsa) — qo'shimcha signal.
    sk = s.ai_skills or {}
    if sk.get("skills"):
        lines.append("Ajratilgan ko'nikmalar: " + ", ".join(sk["skills"][:15]))
    if sk.get("languages"):
        lines.append("Tillar: " + ", ".join(sk["languages"][:6]))
    if sk.get("experience_summary"):
        lines.append("Tajriba (AI): " + str(sk["experience_summary"])[:300])
    return "\n".join(lines)


def _latest_cv_file(student):
    """Eng so'nggi CV'ni (bytes, mime) qaytaradi yoki None."""
    cv = (
        Bot2Document.objects
        .filter(student=student, doc_type="cv").order_by("-created_at").first()
    )
    if not cv or not cv.file:
        return None
    mime = (cv.mime_type or "").lower()
    if mime not in SUPPORTED_MIME:
        return None
    try:
        cv.file.seek(0)
        return (cv.file.read(), mime)
    except Exception:
        logger.warning("CV o'qishda xato (student=%s)", student.id)
        return None


def generate_for_lead_student(ls) -> bool:
    """Bitta LeadStudent uchun strukturali AI tahlil yaratadi va saqlaydi. True = muvaffaqiyat."""
    prompt = PROMPT.format(context=_build_context(ls))
    cv = _latest_cv_file(ls.student)
    files = [cv] if cv else None

    result = generate_text(
        prompt,
        operation="lead_candidate_summary",
        files=files,
        json_mode=True,
        temperature=0.3,
        # Gemini 2.5 "thinking" budjetni yeydi (SDK 1.2.0 da o'chirib bo'lmaydi) → yuqori limit.
        max_output_tokens=8192,
    )
    data = result.get("json")
    if not result["ok"] or not isinstance(data, dict):
        return False

    profile = {
        "headline": str(data.get("headline", "")).strip(),
        "education": str(data.get("education", "")).strip(),
        "skills": [str(x).strip() for x in (data.get("skills") or []) if str(x).strip()][:15],
        "languages": [str(x).strip() for x in (data.get("languages") or []) if str(x).strip()][:8],
        "experience": [str(x).strip() for x in (data.get("experience") or []) if str(x).strip()][:6],
        "fit": str(data.get("fit", "")).strip(),
    }
    ls.ai_profile = profile
    ls.ai_summary = profile["headline"]  # jadval uchun qisqa sarlavha
    ls.ai_summary_at = timezone.now()
    ls.save(update_fields=["ai_profile", "ai_summary", "ai_summary_at", "updated_at"])
    return True


def generate_for_lead_async(lead, force: bool = False):
    """Lead'dagi tavsifi yo'q (yoki force=True bo'lsa barcha) talabalar uchun fon-generatsiya.

    Har chaqiruvda cheksiz xom thread ochish o'rniga umumiy, cheklangan (4 ta ishchi)
    ai_verification pool'iga topshiriladi — DB ulanishlari va parallel Gemini
    chaqiruvlari nazorat ostida bo'ladi.
    """
    from django.db import close_old_connections
    from ai_verification.orchestration import submit_ai_task

    def _run():
        try:
            qs = lead.lead_students.select_related("student__roster__program", "student__region")
            for ls in qs:
                if force or not ls.ai_summary:
                    try:
                        generate_for_lead_student(ls)
                    except Exception:
                        logger.exception("Lead AI tavsif xato (ls=%s)", ls.id)
        finally:
            close_old_connections()

    submit_ai_task(_run)
