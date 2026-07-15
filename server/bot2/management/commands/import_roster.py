import csv
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from bot2.services import parse_roster_payload, bulk_upsert_roster_rows


def _iter_xlsx(path: str):
    import openpyxl
    from bot2.views import _normalize_row

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    it = ws.iter_rows(values_only=True)
    headers = list(next(it, []))
    for values in it:
        if all(v is None for v in values):
            continue
        yield _normalize_row(dict(zip(headers, values)))
    wb.close()


def _iter_csv(path: str):
    from bot2.views import _normalize_row

    # utf-8-sig BOM'ni olib tashlaydi; muvaffaqiyatsiz bo'lsa cp1251 (Excel legacy).
    try:
        with open(path, newline="", encoding="utf-8-sig") as f:
            rows = [_normalize_row(r) for r in csv.DictReader(f)]
    except UnicodeDecodeError:
        with open(path, newline="", encoding="cp1251") as f:
            rows = [_normalize_row(r) for r in csv.DictReader(f)]
    yield from rows


class Command(BaseCommand):
    help = "Import roster from CSV or Excel (.xlsx) file."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Path to CSV or .xlsx file")

    def handle(self, *args, **options):
        file_path = options["file"]
        suffix = Path(file_path).suffix.lower()
        rows = _iter_xlsx(file_path) if suffix in (".xlsx", ".xls") else _iter_csv(file_path)

        # Bir xil robust parsing + partiyali upsert (API import bilan izchil):
        # ID'siz qatorlar (statistika jadvali qoldiqlari) o'tkazib yuboriladi,
        # program qidiruvlari keshlanadi, yozuv bitta partiyada.
        program_cache: dict = {}
        valid: list = []
        skipped = errors = 0
        for idx, row in enumerate(rows, start=1):
            if not str(row.get("student_external_id") or "").strip():
                skipped += 1
                continue
            try:
                valid.append(parse_roster_payload(row, program_cache=program_cache))
            except Exception as exc:
                errors += 1
                self.stderr.write(f"Row {idx}: {exc}")

        with transaction.atomic():
            result = bulk_upsert_roster_rows(valid) if valid else {}
        created = sum(1 for _, was_created in result.values() if was_created)
        updated = sum(1 for _, was_created in result.values() if not was_created)

        self.stdout.write(self.style.SUCCESS(
            f"Import completed. Created: {created}, Updated: {updated}, "
            f"Skipped: {skipped}, Errors: {errors}"
        ))
