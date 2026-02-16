from typing import Optional

from django.db import transaction
from django.db.models import Q

from bot2.models import StudentRoster
from catalog.models import CatalogItem
from common.exceptions import APIError


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
        "student_external_id": student_external_id,
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
        changed_fields: list[str] = []
        for field, value in defaults.items():
            if getattr(existing, field) != value:
                setattr(existing, field, value)
                changed_fields.append(field)

        if changed_fields:
            existing.full_clean()
            existing.save(update_fields=changed_fields + ["updated_at"])

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
