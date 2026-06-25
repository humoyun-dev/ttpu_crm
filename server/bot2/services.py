import re
from datetime import date
from typing import Optional

from django.db import transaction
from django.db.models import Q

from bot2.models import StudentRoster
from catalog.models import CatalogItem
from common.exceptions import APIError

_BIRTH_DATE_RE = re.compile(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$")


def parse_birth_date(value) -> Optional[date]:
    """Accept DD.MM.YYYY (or - / separators). Returns date or None."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    m = _BIRTH_DATE_RE.match(str(value).strip())
    if not m:
        return None
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return date(year, month, day)
    except ValueError:
        return None


def get_program(program_id=None, program_code=None) -> Optional[CatalogItem]:
    program_types = Q(type=CatalogItem.ItemType.PROGRAM) | Q(type=CatalogItem.ItemType.DIRECTION)
    if program_id:
        return CatalogItem.objects.filter(program_types, id=program_id).first()
    if program_code:
        return CatalogItem.objects.filter(program_types, code=program_code).first()
    return None


def parse_roster_payload(row: dict) -> dict:
    student_external_id = str(row.get("student_external_id") or "").strip()
    if not student_external_id:
        raise APIError(code="VALIDATION_ERROR", detail="student_external_id is required.")

    # program and course_year are optional — collected from the student via bot
    program = get_program(row.get("program_id"), row.get("program_code"))
    if row.get("program_id") or row.get("program_code"):
        if not program:
            raise APIError(code="PROGRAM_NOT_FOUND", detail="Program not found.")

    course_year = None
    raw_year = row.get("course_year")
    if raw_year is not None and str(raw_year).strip():
        try:
            course_year = int(raw_year)
        except (TypeError, ValueError):
            raise APIError(code="INVALID_COURSE_YEAR", detail="course_year must be an integer between 1 and 5.")
        if course_year not in (1, 2, 3, 4, 5):
            raise APIError(code="INVALID_COURSE_YEAR", detail="course_year must be between 1 and 5 (5 = graduated).")

    campaign = row.get("campaign") or "default"
    birth_date = parse_birth_date(row.get("birth_date"))
    return {
        "student_external_id": student_external_id,
        "first_name": str(row.get("first_name") or "").strip(),
        "last_name": str(row.get("last_name") or "").strip(),
        "program": program,
        "course_year": course_year,
        "is_active": bool(row.get("is_active", True) not in [False, "false", "False", "0"]),
        "roster_campaign": campaign,
        "birth_date": birth_date,
    }


@transaction.atomic
def upsert_roster_row(data: dict) -> tuple[StudentRoster, bool]:
    defaults: dict = {
        "is_active": data.get("is_active", True),
        "roster_campaign": data.get("roster_campaign", "default"),
    }
    if data.get("first_name") is not None:
        defaults["first_name"] = data["first_name"]
    if data.get("last_name") is not None:
        defaults["last_name"] = data["last_name"]
    if data.get("birth_date") is not None:
        defaults["birth_date"] = data["birth_date"]
    # Only overwrite program/course_year when explicitly provided in the import row
    if data.get("program") is not None:
        defaults["program"] = data["program"]
    if data.get("course_year") is not None:
        defaults["course_year"] = data["course_year"]

    existing = StudentRoster.objects.filter(student_external_id=data["student_external_id"]).first()
    if existing:
        changed_fields: list[str] = []
        for field, value in defaults.items():
            if getattr(existing, field) != value:
                setattr(existing, field, value)
                changed_fields.append(field)

        if changed_fields:
            existing.full_clean()
            existing.save(update_fields=changed_fields + ["updated_at"])

            if "program" in changed_fields or "course_year" in changed_fields:
                from bot2.models import Bot2SurveyResponse
                Bot2SurveyResponse.objects.filter(roster=existing).update(
                    program=existing.program,
                    course_year=existing.course_year,
                )

        return existing, False

    roster = StudentRoster(
        student_external_id=data["student_external_id"],
        **defaults,
    )
    roster.full_clean()
    roster.save()
    return roster, True
