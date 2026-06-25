import logging
from datetime import timedelta

from django.utils import timezone

from .models import FollowUp

logger = logging.getLogger(__name__)

CADENCE_DAYS = [2, 5, 7]
MAX_NO_ANSWERS = 3


def schedule_first(lead_student) -> FollowUp:
    return FollowUp.objects.create(
        lead_student=lead_student,
        next_send_at=timezone.now() + timedelta(days=CADENCE_DAYS[0]),
    )


def record_answer(followup: FollowUp, answer: str) -> None:
    """
    answer: "yes" | "no" | "interviewed" | "placed"
    Advances cadence or flags for staff when limit reached.
    """
    followup.attempts += 1
    yes_answers = {"yes", "interviewed", "placed"}

    if answer in yes_answers:
        if answer == "placed":
            followup.stage = FollowUp.Stage.DONE
            followup.outcome = FollowUp.Outcome.PLACED
        elif answer == "interviewed":
            followup.stage = FollowUp.Stage.INTERVIEWED
            followup.outcome = FollowUp.Outcome.INTERVIEWED
        else:
            followup.stage = FollowUp.Stage.CONTACTED
        followup.next_send_at = _next_cadence(followup)
    else:
        if followup.attempts >= MAX_NO_ANSWERS:
            # Decide outcome from the stage reached SO FAR, before marking DONE.
            reached_interview = followup.stage == FollowUp.Stage.INTERVIEWED
            followup.stage = FollowUp.Stage.DONE
            followup.flagged_for_staff = True
            followup.outcome = (
                FollowUp.Outcome.NO_INTERVIEW
                if reached_interview
                else FollowUp.Outcome.NO_CONTACT
            )
            followup.next_send_at = None
        else:
            followup.next_send_at = _next_cadence(followup)

    followup.save()


def _next_cadence(followup: FollowUp):
    idx = min(followup.attempts, len(CADENCE_DAYS) - 1)
    return timezone.now() + timedelta(days=CADENCE_DAYS[idx])
