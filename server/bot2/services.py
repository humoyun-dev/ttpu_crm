from typing import Optional

from django.db import transaction

from bot2.models import StudentRoster
from catalog.models import CatalogItem
from common.exceptions import APIError


def get_program(program_id=None, program_code=None) -> Optional[CatalogItem]:
    if program_id:
        return CatalogItem.objects.filter(id=program_id).first()
    if program_code:
        return CatalogItem.objects.filter(type=CatalogItem.ItemType.PROGRAM, code=program_code).first()
    return None


def parse_roster_payload(row: dict) -> dict:
    program = get_program(row.get("program_id"), row.get("program_code"))
    if not program:
        raise APIError(code="PROGRAM_NOT_FOUND", detail="Program not found.")
    try:
        course_year = int(row.get("course_year"))
    except (TypeError, ValueError):
        raise APIError(code="INVALID_COURSE_YEAR", detail="course_year must be 1..4.")
    if course_year not in (1, 2, 3, 4):
        raise APIError(code="INVALID_COURSE_YEAR", detail="course_year must be between 1 and 4.")
    campaign = row.get("campaign") or "default"
    return {
        "student_external_id": str(row.get("student_external_id")),
        "program": program,
        "course_year": course_year,
        "is_active": bool(row.get("is_active", True) not in [False, "false", "False", "0"]),
        "roster_campaign": campaign,
    }


@transaction.atomic
def upsert_roster_row(data: dict) -> bool:
    defaults = {
        "program": data["program"],
        "course_year": data["course_year"],
        "is_active": data.get("is_active", True),
        "roster_campaign": data.get("roster_campaign", "default"),
    }
    existing = StudentRoster.objects.filter(student_external_id=data["student_external_id"]).first()
    if existing:
        changed = (
            existing.program_id != defaults["program"].id
            or existing.course_year != defaults["course_year"]
            or existing.roster_campaign != defaults["roster_campaign"]
            or existing.is_active != defaults["is_active"]
        )
        for field, value in defaults.items():
            setattr(existing, field, value)
        existing.full_clean()
        existing.save()
        if changed:
            # keep denormalized survey rows in sync
            from bot2.models import Bot2SurveyResponse

            Bot2SurveyResponse.objects.filter(roster=existing).update(
                program=existing.program,
                course_year=existing.course_year,
            )
        return False

    roster = StudentRoster(
        student_external_id=data["student_external_id"],
        **defaults,
    )
    roster.full_clean()
    roster.save()
    return True
