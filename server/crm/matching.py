"""Nomzod ↔ ish o'rni moslashtirish (Gemini). ai_skills + profil asosida ball beradi.

Bitta Gemini chaqiruvida N nomzodni tartiblaydi (matn — oldindan ajratilgan ai_skills'dan
foydalanadi, shuning uchun arzon va tez).
"""
import logging

from ai_verification.generation import generate_text

logger = logging.getLogger(__name__)

MAX_CANDIDATES = 40

PROMPT = """Siz bandlik markazining HR yordamchisisiz. Quyidagi ish o'rni talabiga ko'ra nomzodlarni moslik darajasi bo'yicha baholang.

Ish o'rni talabi:
{requirement}

Nomzodlar:
{candidates}

Har bir nomzod uchun moslik foizini (0-100) va qisqa sababni baholang. Faqat JSON qaytaring:
{{"ranked": [{{"student_id": "<id>", "score": <0-100 butun son>, "reason": "<1 qisqa jumla, o'zbekcha>"}}]}}

Eng mosdan eng kam mosga qarab tartiblang. Faqat berilgan nomzodlarni baholang."""


def _profile_line(idx: int, s) -> str:
    name = f"{s.first_name} {s.last_name}".strip() or s.student_external_id
    roster = getattr(s, "roster", None)
    program = roster.program.name if roster and roster.program_id else ""
    course = roster.course_year if roster else ""
    parts = [f"[{idx}] id={s.id} | {name}"]
    if program:
        parts.append(f"{program}{f' {course}-kurs' if course else ''}")
    sk = s.ai_skills or {}
    if sk.get("skills"):
        parts.append("Ko'nikmalar: " + ", ".join(sk["skills"][:12]))
    if sk.get("languages"):
        parts.append("Tillar: " + ", ".join(sk["languages"][:5]))
    if sk.get("level"):
        parts.append("Daraja: " + str(sk["level"]))
    if sk.get("experience_summary"):
        parts.append("Tajriba: " + str(sk["experience_summary"])[:200])
    return " | ".join(parts)


def rank_candidates(requirement: str, students) -> list[dict]:
    """[{student_id, score, reason}] — eng mosdan tartiblangan. Xato bo'lsa bo'sh ro'yxat."""
    students = list(students)[:MAX_CANDIDATES]
    requirement = (requirement or "").strip()
    if not requirement or not students:
        return []

    candidates = "\n".join(_profile_line(i, s) for i, s in enumerate(students))
    prompt = PROMPT.format(requirement=requirement, candidates=candidates)

    result = generate_text(
        prompt,
        operation="candidate_matching",
        json_mode=True,
        temperature=0.2,
        max_output_tokens=4096,
    )
    data = result.get("json")
    if not result["ok"] or not isinstance(data, dict):
        return []

    valid_ids = {str(s.id) for s in students}
    out = []
    for r in data.get("ranked", []):
        sid = str(r.get("student_id", ""))
        if sid in valid_ids:
            try:
                score = max(0, min(100, int(r.get("score", 0))))
            except (TypeError, ValueError):
                score = 0
            out.append({"student_id": sid, "score": score, "reason": str(r.get("reason", ""))[:300]})
    out.sort(key=lambda x: x["score"], reverse=True)
    return out
