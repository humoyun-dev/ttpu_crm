from django.core.management.base import BaseCommand, CommandError

from authn.models import User


class Command(BaseCommand):
    help = "Create an admin user with email/password."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--password", required=True)

    def handle(self, *args, **options):
        email = options["email"]
        password = options["password"]
        if User.objects.filter(email=email).exists():
            raise CommandError("User with this email already exists.")
        user = User.objects.create_user(email=email, password=password, role=User.Role.ADMIN, is_staff=True)
        self.stdout.write(self.style.SUCCESS(f"Admin user created: {user.email}"))
