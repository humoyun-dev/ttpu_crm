from django.core.management import BaseCommand, call_command


class Command(BaseCommand):
    help = "Seed all dev/demo data: catalog items + bot2 rosters/students/surveys (no users created)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--scale",
            choices=["small", "medium", "large"],
            default="medium",
            help="Bot2 dataset size (small=800, medium=1500, large=3000 roster entries).",
        )
        parser.add_argument(
            "--seed",
            type=int,
            default=None,
            help="Deterministic RNG seed for reproducible bot2 data.",
        )

    def handle(self, *args, **options):
        scale = options["scale"]
        rng_seed = options["seed"]

        self.stdout.write("→ Seeding catalog: directions + regions...")
        call_command("seed_catalog")

        self.stdout.write("→ Seeding catalog: programs...")
        call_command("seed_programs")

        self.stdout.write("→ Seeding catalog: Polito tracks + subjects...")
        call_command("seed_polito_admissions")

        self.stdout.write(f"→ Seeding bot2 mock data (scale={scale})...")
        cmd_kwargs = {"scale": scale}
        if rng_seed is not None:
            cmd_kwargs["seed"] = rng_seed
        call_command("seed_ttpumock", **cmd_kwargs)

        self.stdout.write(self.style.SUCCESS("✅ Dev seed complete."))
