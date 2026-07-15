from django.core.management.base import BaseCommand

from bot2.models import Bot2Document, Bot2Student
from bot2.ai_skills import extract_for_student


class Command(BaseCommand):
    help = "CV'si bor, lekin ai_skills'i hali ajratilmagan talabalar uchun ko'nikma profilini ajratadi."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=10)
        parser.add_argument("--force", action="store_true", help="Allaqachon ajratilganlarni ham qayta ishlash")

    def handle(self, *args, **opts):
        limit = opts["limit"]
        cv_student_ids = (
            Bot2Document.objects.filter(doc_type="cv")
            .values_list("student_id", flat=True).distinct()
        )
        qs = Bot2Student.objects.filter(id__in=list(cv_student_ids))
        if not opts["force"]:
            qs = qs.filter(ai_skills_at__isnull=True)
        qs = qs[:limit]

        done = 0
        for s in qs:
            if extract_for_student(s):
                done += 1
        self.stdout.write(self.style.SUCCESS(f"extract_skills: {done} talaba uchun ko'nikma ajratildi"))
