"""ai_verification.pricing — token → USD hisoblash (sof, DB kerak emas)."""

from decimal import Decimal

import pytest

from ai_verification.pricing import calculate_cost, estimate_monthly_cost, PRICING


def test_calculate_cost_basic():
    # 1500 input * 0.30/1M = 0.00045 ; 400 output * 2.50/1M = 0.001 ; jami 0.00145
    cost = calculate_cost("gemini-2.5-flash", 1500, 400)
    assert cost == Decimal("0.00145000")


def test_thinking_tokens_priced_as_output():
    # input 1000*0.30/1M=0.0003 ; (200+300)*2.50/1M=0.00125 ; jami 0.00155
    cost = calculate_cost("gemini-2.5-flash", 1000, 200, thinking_tokens=300)
    assert cost == Decimal("0.00155000")


def test_unknown_model_falls_back_to_flash():
    assert calculate_cost("unknown-model", 1000, 100) == calculate_cost("gemini-2.5-flash", 1000, 100)


def test_flash_lite_cheaper_than_flash():
    assert calculate_cost("gemini-2.5-flash-lite", 1000, 1000) < calculate_cost("gemini-2.5-flash", 1000, 1000)


def test_pro_more_expensive_than_flash():
    assert calculate_cost("gemini-2.5-pro", 1000, 1000) > calculate_cost("gemini-2.5-flash", 1000, 1000)


def test_zero_tokens_zero_cost():
    assert calculate_cost("gemini-2.5-flash", 0, 0) == Decimal("0.00000000")


def test_monthly_estimate_reasonable():
    est = estimate_monthly_cost(50)
    assert Decimal("0") < est < Decimal("10")   # 50/kun ~ $2.2/oy


def test_monthly_estimate_scales_with_volume():
    assert estimate_monthly_cost(100) > estimate_monthly_cost(50)


@pytest.mark.parametrize("model", list(PRICING))
def test_output_dearer_than_input(model):
    """Har modelda output narxi input narxidan qimmat."""
    assert PRICING[model]["output"] > PRICING[model]["input"]
