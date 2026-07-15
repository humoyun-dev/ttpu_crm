import re
from datetime import date, datetime
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
    # Excel (openpyxl) sana kataklarini datetime sifatida qaytaradi — sof date ga.
    if isinstance(value, datetime):
        return value.date()
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


def parse_roster_payload(row: dict, program_cache: Optional[dict] = None) -> dict:
    student_external_id = str(row.get("student_external_id") or "").strip()
    if not student_external_id:
        raise APIError(code="VALIDATION_ERROR", detail="student_external_id is required.")

    # program and course_year are optional — collected from the student via bot.
    # program_cache: bir xil program_id/code takror qidirilmasligi uchun (katta
    # importda minglab bir xil qatorlar — bitta so'rov yetarli).
    program_id = row.get("program_id")
    program_code = row.get("program_code")
    if program_id or program_code:
        key = (program_id, program_code)
        if program_cache is not None and key in program_cache:
            program = program_cache[key]
        else:
            program = get_program(program_id, program_code)
            if program_cache is not None:
                program_cache[key] = program
        if not program:
            raise APIError(code="PROGRAM_NOT_FOUND", detail="Program not found.")
    else:
        program = None

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
    # Bo'sh katak = "qiymat berilmadi" (None), "" emas. Shunda qayta importda
    # bo'sh ism ustuni mavjud (to'ldirilgan) ismni o'chirib yubormaydi —
    # Excel faqat qiymat BERGANDA g'olib (upsert'dagi `is not None` filtri).
    return {
        "student_external_id": student_external_id,
        "first_name": (str(row.get("first_name") or "").strip() or None),
        "last_name": (str(row.get("last_name") or "").strip() or None),
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

            # Append-only tarix: survey qatorlarida faqat hali NULL bo'lgan
            # program/course_year to'ldiriladi — mavjud (non-null) qiymat hech
            # qachon qayta import bilan ustidan yozilmaydi.
            if "program" in changed_fields or "course_year" in changed_fields:
                from bot2.models import Bot2SurveyResponse
                if "program" in changed_fields and existing.program_id:
                    Bot2SurveyResponse.objects.filter(
                        roster=existing, program__isnull=True
                    ).update(program=existing.program)
                if "course_year" in changed_fields and existing.course_year:
                    Bot2SurveyResponse.objects.filter(
                        roster=existing, course_year__isnull=True
                    ).update(course_year=existing.course_year)

        return existing, False

    roster = StudentRoster(
        student_external_id=data["student_external_id"],
        **defaults,
    )
    roster.full_clean()
    roster.save()
    return roster, True


def _roster_defaults(data: dict) -> dict:
    """upsert_roster_row bilan bir xil "qaysi maydonlar yoziladi" qoidasi."""
    defaults: dict = {
        "is_active": data.get("is_active", True),
        "roster_campaign": data.get("roster_campaign", "default"),
    }
    for f in ("first_name", "last_name", "birth_date", "program", "course_year"):
        if data.get(f) is not None:
            defaults[f] = data[f]
    return defaults


def bulk_upsert_roster_rows(parsed_rows: list[dict]) -> dict:
    """Ko'p qatorli rosterni samarali upsert qiladi (katta Excel import uchun).

    Har qatorda alohida SELECT + save (+ full_clean) o'rniga: mavjud qatorlar
    BITTA so'rovda oldindan olinadi, yangilar `bulk_create`, o'zgarganlar
    `bulk_update` bilan yoziladi. Semantikasi `upsert_roster_row` bilan bir xil
    (program/course_year faqat berilganda ustidan yoziladi; survey snapshotlarida
    faqat NULL qiymatlar backfill qilinadi — append-only saqlanadi).

    Fayl ichida bir xil ID takrorlansa — oxirgisi g'olib. Qaytaradi:
    {student_external_id: (StudentRoster, was_created)}.
    """
    from django.utils import timezone

    ordered_ids: list[str] = []
    by_id: dict[str, dict] = {}
    for data in parsed_rows:
        sid = data["student_external_id"]
        if sid not in by_id:
            ordered_ids.append(sid)
        by_id[sid] = data  # oxirgisi g'olib

    existing_map = {
        r.student_external_id: r
        for r in StudentRoster.objects.filter(student_external_id__in=ordered_ids)
    }

    to_create: list[StudentRoster] = []
    to_update: list[StudentRoster] = []
    update_fields: set[str] = set()
    backfill: list[tuple[StudentRoster, bool, bool]] = []
    result: dict[str, tuple[StudentRoster, bool]] = {}
    now = timezone.now()

    for sid in ordered_ids:
        data = by_id[sid]
        defaults = _roster_defaults(data)
        ex = existing_map.get(sid)
        if ex is None:
            roster = StudentRoster(student_external_id=sid, **defaults)
            to_create.append(roster)
            result[sid] = (roster, True)
        else:
            changed: list[str] = []
            for field, value in defaults.items():
                if getattr(ex, field) != value:
                    setattr(ex, field, value)
                    changed.append(field)
            if changed:
                ex.updated_at = now  # bulk_update auto_now'ni ishga tushirmaydi
                to_update.append(ex)
                update_fields.update(changed)
                do_prog = "program" in changed and bool(ex.program_id)
                do_course = "course_year" in changed and bool(ex.course_year)
                if do_prog or do_course:
                    backfill.append((ex, do_prog, do_course))
            result[sid] = (ex, False)

    if to_create:
        StudentRoster.objects.bulk_create(to_create, batch_size=500)
    if to_update:
        StudentRoster.objects.bulk_update(
            to_update, fields=list(update_fields) + ["updated_at"], batch_size=500
        )

    if backfill:
        from bot2.models import Bot2SurveyResponse
        for roster, do_prog, do_course in backfill:
            if do_prog:
                Bot2SurveyResponse.objects.filter(
                    roster=roster, program__isnull=True
                ).update(program=roster.program)
            if do_course:
                Bot2SurveyResponse.objects.filter(
                    roster=roster, course_year__isnull=True
                ).update(course_year=roster.course_year)

    return result
