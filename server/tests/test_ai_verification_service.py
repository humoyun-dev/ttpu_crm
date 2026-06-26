"""GeminiVerificationService — pure logic (no real Gemini API calls).

The `google-genai` SDK is faked via sys.modules so the service can be instantiated
and `verify()` exercised end-to-end without the package installed or the network.
Parsing/scoring/MIME logic is deterministic and gets the most coverage here.
"""

import sys
import types as pytypes
from decimal import Decimal

import pytest

from ai_verification.services import GeminiVerificationService


# ── pure helpers (no instantiation needed) ────────────────────────────────────

@pytest.mark.parametrize("score,level", [
    (0.99, "green"), (0.75, "green"),      # >= 0.75
    (0.74, "yellow"), (0.45, "yellow"),    # 0.45 .. 0.75
    (0.44, "red"), (0.0, "red"),           # < 0.45
])
def test_score_to_level_boundaries(score, level):
    assert GeminiVerificationService._score_to_level(score) == level


def test_error_result_shape():
    r = GeminiVerificationService._error_result("nimadir")
    assert r["_error"] is True
    assert r["confidence_level"] == "red"
    assert r["confidence_score"] == 0.0
    assert r["flags"] == ["processing_error"]
    assert "nimadir" in r["summary"]


# ── _parse_response (instance method, but uses no self) ───────────────────────

def _parse(text):
    # __new__ skips __init__ (no google-genai import needed) while keeping access to
    # the static helpers _parse_response relies on.
    svc = GeminiVerificationService.__new__(GeminiVerificationService)
    return svc._parse_response(text)


def test_parse_valid_json_rounds_and_fills_defaults():
    out = _parse('{"confidence_score": 0.8123, "confidence_level": "green"}')
    assert out["confidence_score"] == 0.81          # rounded to 2 dp
    assert out["confidence_level"] == "green"
    assert out["extracted_data"] == {}              # default filled
    assert out["flags"] == []
    assert out["summary"] == ""


def test_parse_computes_level_when_missing():
    out = _parse('{"confidence_score": 0.5}')        # no confidence_level
    assert out["confidence_level"] == "yellow"


def test_parse_strips_markdown_code_fence():
    raw = '```json\n{"confidence_score": 0.9, "confidence_level": "green"}\n```'
    out = _parse(raw)
    assert out["confidence_score"] == 0.9
    assert not out.get("_error")


def test_parse_invalid_json_returns_error_result():
    out = _parse("bu JSON emas")
    assert out["_error"] is True
    assert out["confidence_level"] == "red"


def test_parse_keeps_extracted_data_and_flags():
    out = _parse('{"confidence_score": 0.9, "extracted_data": {"full_name": "Ali"}, "flags": ["blurry"]}')
    assert out["extracted_data"]["full_name"] == "Ali"
    assert out["flags"] == ["blurry"]


# ── __init__ guard (no SDK needed: key check happens first) ───────────────────

def test_init_without_api_key_raises(settings):
    settings.GEMINI_API_KEY = ""
    with pytest.raises(ValueError):
        GeminiVerificationService()


# ── verify() with a faked google-genai SDK ────────────────────────────────────

class _FakeResponse:
    def __init__(self, text, usage_metadata=None):
        self.text = text
        if usage_metadata is not None:
            self.usage_metadata = usage_metadata


class _FakeModels:
    def __init__(self, outer):
        self._outer = outer

    def generate_content(self, model, contents, config):
        self._outer.last_call = {"model": model, "contents": contents, "config": config}
        if self._outer.raise_exc:
            raise self._outer.raise_exc
        return _FakeResponse(self._outer.response_text, self._outer.usage_metadata)


class _FakeClient:
    def __init__(self, outer):
        self.models = _FakeModels(outer)


@pytest.fixture
def fake_genai(monkeypatch, settings):
    """Install a fake `google.genai` (+ `.types`) so the service runs offline."""
    settings.GEMINI_API_KEY = "test-key"

    state = pytypes.SimpleNamespace(
        response_text="{}", raise_exc=None, last_call=None, usage_metadata=None
    )

    genai_mod = pytypes.ModuleType("google.genai")
    types_mod = pytypes.ModuleType("google.genai.types")

    class _Part:
        @staticmethod
        def from_bytes(data, mime_type):
            return {"data": data, "mime_type": mime_type}

    types_mod.Part = _Part
    types_mod.GenerateContentConfig = lambda **kw: {"_cfg": kw}
    types_mod.ThinkingConfig = lambda **kw: {"_thinking": kw}
    genai_mod.types = types_mod
    genai_mod.Client = lambda api_key=None: _FakeClient(state)

    google_pkg = sys.modules.get("google") or pytypes.ModuleType("google")
    monkeypatch.setitem(sys.modules, "google", google_pkg)
    monkeypatch.setitem(sys.modules, "google.genai", genai_mod)
    monkeypatch.setitem(sys.modules, "google.genai.types", types_mod)
    monkeypatch.setattr(google_pkg, "genai", genai_mod, raising=False)
    return state


def test_verify_happy_path_returns_parsed(fake_genai):
    fake_genai.response_text = '{"confidence_score": 0.88, "confidence_level": "green", "extracted_data": {"full_name": "Ali"}}'
    svc = GeminiVerificationService()
    out = svc.verify(b"\x89PNG", "image/png", "cv")
    assert out["confidence_level"] == "green"
    assert out["extracted_data"]["full_name"] == "Ali"
    assert not out.get("_error")
    assert fake_genai.last_call["model"] == "gemini-2.5-flash"


def test_verify_normalizes_jpg_to_jpeg(fake_genai):
    fake_genai.response_text = '{"confidence_score": 0.9}'
    svc = GeminiVerificationService()
    svc.verify(b"x", "image/jpg", "cv")
    # The Part was built with the normalized mime type.
    part = fake_genai.last_call["contents"][0]
    assert part["mime_type"] == "image/jpeg"


def test_verify_rejects_unsupported_mime_without_api_call(fake_genai):
    svc = GeminiVerificationService()
    out = svc.verify(b"x", "text/plain", "cv")
    assert out["_error"] is True
    assert "Qo'llab" in out["summary"] or "fayl turi" in out["summary"]
    assert fake_genai.last_call is None        # API never called


def test_verify_api_exception_returns_error_result(fake_genai):
    fake_genai.raise_exc = RuntimeError("network down")
    svc = GeminiVerificationService()
    out = svc.verify(b"x", "image/png", "cv")
    assert out["_error"] is True
    assert out["confidence_level"] == "red"


# ── token / cost usage (_build_usage + _usage in verify) ──────────────────────

def _svc():
    return GeminiVerificationService.__new__(GeminiVerificationService)


def test_build_usage_from_metadata_computes_cost_and_total():
    meta = pytypes.SimpleNamespace(
        prompt_token_count=1500, candidates_token_count=400, thoughts_token_count=0
    )
    u = _svc()._build_usage(pytypes.SimpleNamespace(usage_metadata=meta), latency_ms=123)
    assert u["input_tokens"] == 1500
    assert u["output_tokens"] == 400
    assert u["total_tokens"] == 1900
    assert u["cost_usd"] == Decimal("0.00145")   # matches pricing test
    assert u["latency_ms"] == 123
    assert u["status"] == "success"


def test_build_usage_subtracts_thinking_from_candidates():
    # candidates_token_count INCLUDES thinking → must not double-count.
    meta = pytypes.SimpleNamespace(
        prompt_token_count=1000, candidates_token_count=500, thoughts_token_count=300
    )
    u = _svc()._build_usage(pytypes.SimpleNamespace(usage_metadata=meta), latency_ms=0)
    assert u["output_tokens"] == 200      # 500 - 300
    assert u["thinking_tokens"] == 300
    assert u["total_tokens"] == 1500      # 1000 + 200 + 300


def test_build_usage_no_metadata_is_zero():
    u = _svc()._build_usage(None, latency_ms=0, status="error", error_message="boom")
    assert u["total_tokens"] == 0
    assert u["cost_usd"] == Decimal("0")
    assert u["status"] == "error"
    assert u["error_message"] == "boom"


def test_verify_attaches_usage(fake_genai):
    fake_genai.response_text = '{"confidence_score": 0.9, "confidence_level": "green"}'
    fake_genai.usage_metadata = pytypes.SimpleNamespace(
        prompt_token_count=1500, candidates_token_count=400, thoughts_token_count=0
    )
    out = GeminiVerificationService().verify(b"x", "image/png", "cv")
    assert "_usage" in out
    assert out["_usage"]["total_tokens"] == 1900
    assert out["_usage"]["cost_usd"] == Decimal("0.00145")


def test_verify_unsupported_mime_usage_is_error(fake_genai):
    out = GeminiVerificationService().verify(b"x", "text/plain", "cv")
    assert out["_usage"]["status"] == "error"
    assert out["_usage"]["total_tokens"] == 0


# ── student_name prompt injection ─────────────────────────────────────────────

def test_verify_injects_student_name_into_prompt(fake_genai):
    """student_name berilsa prompt ichida ism ko'rsatilishi kerak."""
    fake_genai.response_text = '{"confidence_score": 0.9, "confidence_level": "green"}'
    svc = GeminiVerificationService()
    svc.verify(b"\x89PNG", "image/png", "cv", student_name="Humoyun Tursunov")
    # contents[1] — matn prompt
    prompt_text = fake_genai.last_call["contents"][1]
    assert "Humoyun Tursunov" in prompt_text
    assert "ISM MOSLIK TEKSHIRUVI" in prompt_text


def test_verify_no_student_name_no_injection(fake_genai):
    """student_name bo'sh bo'lsa ism bloki qo'shilmasligi kerak."""
    fake_genai.response_text = '{"confidence_score": 0.9, "confidence_level": "green"}'
    svc = GeminiVerificationService()
    svc.verify(b"\x89PNG", "image/png", "cv")
    prompt_text = fake_genai.last_call["contents"][1]
    assert "ISM MOSLIK TEKSHIRUVI" not in prompt_text


# ── get_prompt (prompts module) ───────────────────────────────────────────────

def test_get_prompt_with_name_contains_name_check():
    from ai_verification.prompts import get_prompt
    p = get_prompt("cv", student_name="Ali Valiyev")
    assert "Ali Valiyev" in p
    assert "name_mismatch" in p
    assert "name_variant" in p


def test_get_prompt_without_name_no_name_block():
    from ai_verification.prompts import get_prompt
    p = get_prompt("cv")
    assert "ISM MOSLIK TEKSHIRUVI" not in p


def test_get_prompt_all_doc_types_include_name_flags():
    from ai_verification.prompts import get_prompt
    for dtype in ("cv", "ielts", "certificate", "diploma"):
        p = get_prompt(dtype, student_name="Test Talaba")
        assert "name_mismatch" in p, f"{dtype} promptida name_mismatch yo'q"
        assert "name_variant" in p, f"{dtype} promptida name_variant yo'q"


# ── retry logic ───────────────────────────────────────────────────────────────

def test_retryable_503_retries_and_succeeds(fake_genai, monkeypatch):
    """503 xatosidan keyin muvaffaqiyatli javob qaytarishi kerak."""
    import ai_verification.services as svc_mod
    monkeypatch.setattr(svc_mod, "_RETRY_BASE_DELAY", 0)  # testda kutmaslik

    calls = []
    ok_response = '{"confidence_score": 0.9, "confidence_level": "green"}'

    original_generate = fake_genai.__class__  # unused; patch via state

    attempt_count = 0
    _original_models_cls = type(fake_genai)

    # Birinchi chaqiruv 503, ikkinchisi muvaffaqiyatli
    class _CountingModels:
        def generate_content(self, model, contents, config):
            nonlocal attempt_count
            attempt_count += 1
            if attempt_count == 1:
                raise Exception("503 UNAVAILABLE high demand")
            return _FakeResponse(ok_response, None)

    svc = GeminiVerificationService()
    svc.client = pytypes.SimpleNamespace(models=_CountingModels())

    out = svc.verify(b"\x89PNG", "image/png", "cv")
    assert attempt_count == 2
    assert out["confidence_level"] == "green"
    assert not out.get("_error")


def test_non_retryable_error_no_retry(fake_genai, monkeypatch):
    """Qayta urinib bo'lmaydigan xato (masalan 400) darhol xato qaytarishi kerak."""
    import ai_verification.services as svc_mod
    monkeypatch.setattr(svc_mod, "_RETRY_BASE_DELAY", 0)

    attempt_count = 0

    class _FailModels:
        def generate_content(self, model, contents, config):
            nonlocal attempt_count
            attempt_count += 1
            raise Exception("400 INVALID_ARGUMENT bad request")

    svc = GeminiVerificationService()
    svc.client = pytypes.SimpleNamespace(models=_FailModels())

    out = svc.verify(b"\x89PNG", "image/png", "cv")
    assert attempt_count == 1   # faqat bir marta, retry yo'q
    assert out.get("_error")


def test_is_retryable():
    from ai_verification.services import _is_retryable
    assert _is_retryable(Exception("503 UNAVAILABLE high demand"))
    assert _is_retryable(Exception("429 RESOURCE_EXHAUSTED"))
    assert not _is_retryable(Exception("400 INVALID_ARGUMENT"))
    assert not _is_retryable(Exception("404 NOT_FOUND"))
