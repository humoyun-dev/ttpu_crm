import uuid

from django.db import models
from django.utils import timezone

from common.models import BaseModel
from employers.models import Employer


class Lead(BaseModel):
    class Status(models.TextChoices):
        CREATED = "created", "Created"
        SENT = "sent", "Sent"
        VIEWING = "viewing", "Viewing"
        SELECTED = "selected", "Selected"
        CLOSED = "closed", "Closed"

    employer = models.ForeignKey(Employer, on_delete=models.CASCADE, related_name="leads")
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CREATED)
    students = models.ManyToManyField(
        "bot2.Bot2Student", through="LeadStudent", related_name="leads"
    )
    created_by = models.ForeignKey(
        "authn.User", null=True, on_delete=models.SET_NULL, related_name="+"
    )
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["employer"]),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.employer})"


class LeadStudent(BaseModel):
    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="lead_students")
    student = models.ForeignKey(
        "bot2.Bot2Student", on_delete=models.CASCADE, related_name="+"
    )
    employer_interested = models.BooleanField(default=False)
    forwarded = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["lead", "student"], name="uq_lead_student")
        ]

    def __str__(self) -> str:
        return f"LeadStudent(lead={self.lead_id}, student={self.student_id})"


class AccessLink(BaseModel):
    lead = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name="access_link")
    token = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    revoked = models.BooleanField(default=False)

    def is_valid(self) -> bool:
        return (not self.revoked) and timezone.now() < self.expires_at

    def __str__(self) -> str:
        return f"AccessLink({self.token})"


class AccessLog(BaseModel):
    access_link = models.ForeignKey(
        AccessLink, on_delete=models.CASCADE, related_name="logs"
    )
    accessed_at = models.DateTimeField(auto_now_add=True)
    ip = models.GenericIPAddressField(null=True)
    user_agent = models.CharField(max_length=512, blank=True)

    class Meta:
        ordering = ("-accessed_at",)

    def __str__(self) -> str:
        return f"AccessLog({self.access_link_id}, {self.accessed_at})"


class FollowUp(BaseModel):
    class Stage(models.TextChoices):
        PENDING = "pending", "Pending"
        CONTACTED = "contacted", "Contacted"
        INTERVIEWED = "interviewed", "Interviewed"
        DONE = "done", "Done"

    class Outcome(models.TextChoices):
        INTERVIEWED = "interviewed", "Interviewed"
        PLACED = "placed", "Placed"
        NO_CONTACT = "no_contact", "No Contact"
        NO_INTERVIEW = "no_interview", "No Interview"

    lead_student = models.ForeignKey(
        LeadStudent, on_delete=models.CASCADE, related_name="followups"
    )
    stage = models.CharField(max_length=12, choices=Stage.choices, default=Stage.PENDING)
    outcome = models.CharField(max_length=12, choices=Outcome.choices, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_send_at = models.DateTimeField(null=True, blank=True)
    flagged_for_staff = models.BooleanField(default=False)

    class Meta:
        indexes = [
            models.Index(fields=["next_send_at"]),
            models.Index(fields=["stage"]),
        ]

    def __str__(self) -> str:
        return f"FollowUp(lead_student={self.lead_student_id}, stage={self.stage})"
