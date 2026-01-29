import csv

from django.core.management.base import BaseCommand

from bot2.services import parse_roster_payload, upsert_roster_row


class Command(BaseCommand):
    help = "Import roster from CSV file with columns: student_external_id, program_id/program_code, course_year, is_active(optional)"

    def add_arguments(self, parser):
        parser.add_argument("--file", required=True, help="Path to CSV file")

    def handle(self, *args, **options):
        file_path = options["file"]
        created = 0
        updated = 0
        errors = 0

        with open(file_path, newline="", encoding="utf-8") as csvfile:
            reader = csv.DictReader(csvfile)
            for idx, row in enumerate(reader, start=1):
                try:
                    parsed = parse_roster_payload(row)
                    flag = upsert_roster_row(parsed)
                    created += int(flag)
                    updated += int(not flag)
                except Exception as exc:  # pragma: no cover - CLI errors
                    errors += 1
                    self.stderr.write(f"Row {idx}: {exc}")

        self.stdout.write(self.style.SUCCESS(f"Import completed. Created: {created}, Updated: {updated}, Errors: {errors}"))
