"""
Gemini narxlarini markazlashtirilgan joyda saqlash.
Narx o'zgarsa — faqat shu faylni yangilash kifoya.

Manba: https://ai.google.dev/gemini-api/docs/pricing
Yangilangan: 2026-06-24 (Standard tier, Paid)
"""
from decimal import Decimal

_PER_MILLION = Decimal("1000000")

# Narxlar: 1 token uchun USD (1M token narxini 1_000_000 ga bo'lib)
PRICING = {
    "gemini-2.5-flash": {
        "input": Decimal("0.30") / _PER_MILLION,    # $0.30 / 1M
        "output": Decimal("2.50") / _PER_MILLION,   # $2.50 / 1M (thinking ham shu narxda)
    },
    "gemini-2.5-flash-lite": {
        "input": Decimal("0.10") / _PER_MILLION,    # $0.10 / 1M
        "output": Decimal("0.40") / _PER_MILLION,   # $0.40 / 1M
    },
    "gemini-2.5-pro": {
        # Pro <= 200k token uchun
        "input": Decimal("1.25") / _PER_MILLION,    # $1.25 / 1M
        "output": Decimal("10.00") / _PER_MILLION,  # $10.00 / 1M
    },
}

_CENT = Decimal("0.00000001")  # 8 kasr — model cost_usd bilan mos


def calculate_cost(
    model_name: str,
    input_tokens: int,
    output_tokens: int,
    thinking_tokens: int = 0,
) -> Decimal:
    """
    Token sonlaridan USD xarajatni hisoblaydi.

    Eslatma: Gemini'da thinking tokenlar OUTPUT narxida hisoblanadi, shuning uchun
    output_tokens + thinking_tokens birga olinadi. Noma'lum model 2.5 Flash narxiga
    qaytadi (fallback).
    """
    rates = PRICING.get(model_name) or PRICING["gemini-2.5-flash"]
    input_cost = Decimal(int(input_tokens)) * rates["input"]
    output_cost = Decimal(int(output_tokens) + int(thinking_tokens)) * rates["output"]
    return (input_cost + output_cost).quantize(_CENT)


def estimate_monthly_cost(
    docs_per_day: int,
    model_name: str = "gemini-2.5-flash",
    avg_input_tokens: int = 1500,
    avg_output_tokens: int = 400,
) -> Decimal:
    """Oylik xarajatni taxminiy hisoblash (rejalashtirish uchun, 30 kun)."""
    per_doc = calculate_cost(model_name, avg_input_tokens, avg_output_tokens)
    return (per_doc * Decimal(int(docs_per_day)) * 30).quantize(Decimal("0.01"))
