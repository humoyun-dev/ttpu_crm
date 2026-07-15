"""Hujjat tekshiruvini bajarish va xarajat yozuvi — submit (dashboard) va bot
yuklash oqimlari uchun umumiy joy."""

import logging
import sys
from concurrent.futures import ThreadPoolExecutor

from django.db import close_old_connections
from django.utils import timezone

from .models import AIUsageLog, DocumentVerification
from .services import GeminiVerificationService

logger = logging.getLogger(__name__)

# ── Umumiy fon AI thread-pool ─────────────────────────────────────────────────
# Har bir yuklashga alohida threading.Thread ochish o'rniga BITTA chegaralangan
# pool ishlatiladi: har bir vazifa o'z DB ulanishi + 20-30s Gemini chaqiruvini
# olib yuradi, cheklovsiz esa Postgres connection budjeti (gunicorn
# workerlariga moslangan) tez tugaydi. CV yuklash ikki vazifa tug'diradi
# (hujjat tekshiruvi + skill extraction) — ikkalasi ham shu pool orqali o'tadi.
_AI_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="ai-task")


def submit_ai_task(fn, *args, **kwargs):
    """Fon AI vazifasini umumiy chegaralangan pool'ga topshiradi.

    Har bir vazifa boshida va oxirida `close_old_connections()` chaqiriladi —
    pool thread'lari qayta ishlatilgani uchun eskirgan DB ulanishlar oqib
    ketmasligi kerak.

    pytest ostida vazifa SINXRON bajariladi (Celery ALWAYS_EAGER uslubi):
    testlar fon thread tugashini poylamasdan deterministik natija oladi.
    """
    if "pytest" in sys.modules:  # test rejimi — darhol, shu thread'da
        fn(*args, **kwargs)
        return None

    def _wrapped():
        close_old_connections()
        try:
            fn(*args, **kwargs)
        finally:
            close_old_connections()

    return _AI_EXECUTOR.submit(_wrapped)


def write_usage_log(verification, usage: dict, operation: str = "document_verification"):
    """result['_usage'] dan AIUsageLog yozadi (append-only, monitoring)."""
    AIUsageLog.objects.create(
        verification=verification,
        operation=operation,
        model_name=usage.get("model_name", "gemini-2.5-flash"),
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        thinking_tokens=usage.get("thinking_tokens", 0),
        total_tokens=usage.get("total_tokens", 0),
        cost_usd=usage.get("cost_usd", 0),
        status=usage.get("status", "success"),
        error_message=usage.get("error_message", ""),
        latency_ms=usage.get("latency_ms"),
    )


def _get_student_name(verification) -> str:
    """Verification ga biriktirilgan talabaning to'liq ismini qaytaradi."""
    try:
        student = verification.student
        if not student:
            return ""
        first = (student.first_name or "").strip()
        last = (student.last_name or "").strip()
        return f"{first} {last}".strip()
    except Exception:
        return ""


def _process_verification(verification, operation) -> DocumentVerification:
    """Mavjud yozuvning faylini Gemini orqali tekshiradi va natijani saqlaydi.
    Hech qachon istisno tashlamaydi — xato bo'lsa status=failed yozuv qaytadi."""
    try:
        verification.file.seek(0)
        file_bytes = verification.file.read()

        student_name = _get_student_name(verification)

        result = GeminiVerificationService().verify(
            file_bytes=file_bytes,
            mime_type=verification.mime_type,
            document_type=verification.document_type,
            student_name=student_name,
        )

        # Xavfsizlik filtri: Gemini name_mismatch bayroq qo'ysa lekin
        # baribir yuqori ishonch score bergan bo'lsa — uni 0.10 ga tushuramiz.
        flags = result.get("flags", [])
        if "name_mismatch" in flags:
            result["confidence_score"] = min(result.get("confidence_score", 0.0), 0.10)
            result["confidence_level"] = "red"

        verification.confidence_score = result.get("confidence_score")
        verification.confidence_level = result.get("confidence_level")
        verification.extracted_data = result.get("extracted_data", {})
        verification.flags = flags
        verification.ai_summary = result.get("summary", "")
        verification.processed_at = timezone.now()
        if result.get("_error"):
            verification.status = DocumentVerification.Status.FAILED
            verification.error_message = result.get("summary", "")
        else:
            verification.status = DocumentVerification.Status.DONE
            verification.error_message = ""
            # Confidence ga qarab avtomatik qaror:
            # yashil → qabul qilindi, sariq → admin ko'rsin, qizil → rad etildi
            now = timezone.now()
            level = verification.confidence_level
            if level == "green":
                verification.final_decision = DocumentVerification.FinalDecision.ACCEPTED
                verification.reviewed_at = now
                verification.review_note = "Avtomatik tasdiqlandi (ishonch darajasi yashil ≥75%)"
            elif level == "red":
                verification.final_decision = DocumentVerification.FinalDecision.REJECTED
                verification.reviewed_at = now
                verification.review_note = "Avtomatik rad etildi (ishonch darajasi qizil <45%)"
            # yellow: final_decision "pending" qoladi — admin ko'rishi kerak
        verification.save()

        write_usage_log(verification, result.get("_usage", {}), operation)

    except Exception as exc:
        logger.exception("Verification xatolik (id=%s): %s", verification.pk, exc)
        verification.status = DocumentVerification.Status.FAILED
        verification.error_message = str(exc)
        verification.save()
        write_usage_log(verification, {"status": "error", "error_message": str(exc)}, operation)

    return verification


def run_document_verification(
    *, student=None, student_id=None, file, doc_type, uploaded_by=None,
    source_document=None, operation="document_verification",
) -> DocumentVerification:
    """Yangi DocumentVerification yaratadi va Gemini orqali tekshiradi.

    Args:
        student / student_id: birinchi (obyekt) yoki ikkinchisi (UUID) berilishi kerak.
        source_document: Bot2Document obyekti (bot orqali yuklanganda beriladi).
            Shu orqali verification → Bot2Document.survey zanjiri quriladi va
            so'rovnoma sahifasida to'g'ri hujjat holati ko'rsatiladi.
    """
    student_kwargs = {"student": student} if student is not None else {"student_id": student_id}
    verification = DocumentVerification.objects.create(
        uploaded_by=uploaded_by,
        document_type=doc_type,
        file=file,
        original_filename=getattr(file, "name", "") or "",
        mime_type=getattr(file, "content_type", "") or "application/octet-stream",
        status=DocumentVerification.Status.PROCESSING,
        source_document=source_document,
        **student_kwargs,
    )
    return _process_verification(verification, operation)


def run_document_verification_async(
    *, student=None, student_id=None, file, doc_type, uploaded_by=None,
    source_document=None, operation="document_verification",
) -> DocumentVerification:
    """Faylni DB ga saqlab, Gemini tekshiruvini umumiy fon pool'da ishga tushiradi.
    HTTP so'rovni bloklamaydi — darhol status=PROCESSING verification qaytaradi."""
    student_kwargs = {"student": student} if student is not None else {"student_id": student_id}
    verification = DocumentVerification.objects.create(
        uploaded_by=uploaded_by,
        document_type=doc_type,
        file=file,
        original_filename=getattr(file, "name", "") or "",
        mime_type=getattr(file, "content_type", "") or "application/octet-stream",
        status=DocumentVerification.Status.PROCESSING,
        source_document=source_document,
        **student_kwargs,
    )
    verification_pk = verification.pk

    def _run():
        try:
            # Muhim: request bilan kelgan UploadedFile so'rov tugashi bilan
            # yopiladi (>2.5MB da temp fayl o'chiriladi) — fon vazifa unga
            # tayana olmaydi. Yozuvni DB dan qayta o'qiymiz: yangi FieldFile
            # faylni storage'dagi SAQLANGAN nusxadan ochadi
            # (rerun_verification bilan bir xil yo'l).
            fresh = DocumentVerification.objects.get(pk=verification_pk)
            _process_verification(fresh, operation)
        except Exception:
            logger.exception("Async verification xatolik (id=%s)", verification_pk)

    submit_ai_task(_run)
    return verification


def rerun_verification(verification, operation="document_verification") -> DocumentVerification:
    """Mavjud (ko'pincha muvaffaqiyatsiz) yozuvni xuddi shu fayl bilan qaytadan
    tekshiradi — yangi yozuv yaratmaydi, o'shanini yangilaydi."""
    verification.status = DocumentVerification.Status.PROCESSING
    verification.error_message = ""
    verification.save(update_fields=["status", "error_message", "updated_at"])
    return _process_verification(verification, operation)
