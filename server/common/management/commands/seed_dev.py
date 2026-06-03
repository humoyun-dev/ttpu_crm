from django.core.management import BaseCommand, call_command


class Command(BaseCommand):
    help = "Seed catalog reference data for bot2: directions, regions, programs, tracks, subjects."

    def handle(self, *args, **options):
        self.stdout.write("→ Directions + regions...")
        call_command("seed_catalog")

        self.stdout.write("→ Programs...")
        call_command("seed_programs")

        self.stdout.write("→ Polito tracks + subjects...")
        call_command("seed_polito_admissions")

        self.stdout.write(self.style.SUCCESS("✅ Catalog seed complete."))
