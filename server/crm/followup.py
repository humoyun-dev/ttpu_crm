"""Follow-up kadens mantig'i (2 → 5 → 7 kun, 2 bosqichli savol).

Bosqich (`stage`) = hozir so'ralayotgan savol:
  CONTACTED   → Q1 "Ish beruvchi bog'landimi?"
  INTERVIEWED → Q2 "Suhbat bo'ldimi?"
  DONE        → tugagan.

Q1 = Ha → Q2 ga o'tadi, kadens noldan boshlanadi (attempt=0).
Har bosqichda 3× "Yo'q" → DONE + flagged_for_staff, mos outcome.
"""
import logging
from datetime import timedelta

from django.utils import timezone

from .models import FollowUp

logger = logging.getLogger(__name__)

CADENCE_DAYS = [2, 5, 7]
MAX_NO_ANSWERS = 3


def schedule_first(lead_student) -> FollowUp:
    """Lead yaratilganda har bir LeadStudent uchun birinchi follow-up (Q1, +2 kun)."""
    return FollowUp.objects.create(
        lead_student=lead_student,
        stage=FollowUp.Stage.CONTACTED,
        next_send_at=timezone.now() + timedelta(days=CADENCE_DAYS[0]),
    )


def record_answer(followup: FollowUp, answer: str) -> None:
    """
    answer: "yes" | "no" | "interviewed" | "placed".
    Bosqichga qarab kadensni siljitadi yoki limitda xodimga flag qo'yadi.
    """
    # Xodim yorlig'i: bevosita joylashtirildi → terminal.
    if answer == "placed":
        followup.stage = FollowUp.Stage.DONE
        followup.outcome = FollowUp.Outcome.PLACED
        followup.next_send_at = None
        followup.save()
        return

    yes = answer in ("yes", "interviewed")
    stage = followup.stage

    if stage in (FollowUp.Stage.CONTACTED, FollowUp.Stage.PENDING):
        if yes:
            # Q1 (aloqa) = Ha → Q2 (suhbat); kadens noldan.
            followup.stage = FollowUp.Stage.INTERVIEWED
            followup.attempts = 0
            followup.next_send_at = timezone.now() + timedelta(days=CADENCE_DAYS[0])
        else:
            _handle_no(followup, FollowUp.Outcome.NO_CONTACT)
    elif stage == FollowUp.Stage.INTERVIEWED:
        if yes:
            # Q2 (suhbat) = Ha → yakun.
            followup.stage = FollowUp.Stage.DONE
            followup.outcome = FollowUp.Outcome.INTERVIEWED
            followup.next_send_at = None
        else:
            _handle_no(followup, FollowUp.Outcome.NO_INTERVIEW)
    else:
        # DONE — javobni e'tiborsiz qoldiramiz.
        return

    followup.save()


def _handle_no(followup: FollowUp, terminal_outcome: str) -> None:
    """'Yo'q' javobi: urinishni oshiradi, limitda DONE+flag, aks holda qayta rejalashtiradi."""
    followup.attempts += 1
    if followup.attempts >= MAX_NO_ANSWERS:
        followup.stage = FollowUp.Stage.DONE
        followup.flagged_for_staff = True
        followup.outcome = terminal_outcome
        followup.next_send_at = None
    else:
        idx = min(followup.attempts, len(CADENCE_DAYS) - 1)
        followup.next_send_at = timezone.now() + timedelta(days=CADENCE_DAYS[idx])
