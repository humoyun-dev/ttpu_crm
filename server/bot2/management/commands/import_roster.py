import csv
from pathlib import Path

from django.core.management.base import BaseCommand

from bot2.services import parse_roster_payload, upsert_roster_row


def _iter_xlsx(path: str):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.active
    rows = iter(ws.rows)
    headers = [str(cell.value).strip() for cell in next(rows) if cell.value is not None]
    for row in rows:
        values = [cell.value for cell in row]
        yield dict(zip(headers, values))
    wb.close()


def _iter_csv(path: str):
    with open(path, newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)


class Command(BaseCommand):
    help = "Import roster from CSV or Excel (.xlsx) file."

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Path to CSV or .xlsx file")

    def handle(self, *args, **options):
        file_path = options["file"]
        suffix = Path(file_path).suffix.lower()

        if suffix in (".xlsx", ".xls"):
            rows = _iter_xlsx(file_path)
        else:
            rows = _iter_csv(file_path)

        created = updated = errors = 0
        for idx, row in enumerate(rows, start=1):
            try:
                parsed = parse_roster_payload(row)
                flag = upsert_roster_row(parsed)
                created += int(flag)
                updated += int(not flag)
            except Exception as exc:
                errors += 1
                self.stderr.write(f"Row {idx}: {exc}")

        self.stdout.write(self.style.SUCCESS(
            f"Import completed. Created: {created}, Updated: {updated}, Errors: {errors}"
        ))
