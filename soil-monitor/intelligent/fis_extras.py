"""Допоміжні функції для інтерфейсу: ступені належності входів, агрегована
вихідна функція та опис функцій належності.

Модуль НЕ змінює fuzzy_model.py (затверджена модель А) — лише повторно
використовує його константи та правила, щоб показати користувачу, як
сформувався бал. Бал і категорію завжди повертає SoilFuzzyModel.evaluate().
"""
from __future__ import annotations

from typing import Any

import numpy as np

from fuzzy_model import (INPUT_MFS, INPUT_NAMES, INPUT_RANGES, INPUT_TERMS, INPUTS,
                         OUTPUT_MFS, OUTPUT_TERMS, SoilFuzzyModel, membership)


def input_memberships(values: dict[str, float]) -> dict[str, dict[str, float]]:
    """Ступені належності кожного входу до його трьох термів."""
    out: dict[str, dict[str, float]] = {}
    for key, name, terms, mfs in zip(INPUTS, INPUT_NAMES, INPUT_TERMS, INPUT_MFS):
        out[name] = {t: round(float(membership(values[key], mf)), 6) for t, mf in zip(terms, mfs)}
    return out


def aggregate_curve(model: SoilFuzzyModel, values: dict[str, float], points: int = 201) -> dict[str, Any]:
    """Агрегована вихідна множина (min-імплікація, max-агрегація) для графіка.

    Обчислюється тим самим способом, що й у SoilFuzzyModel.evaluate, тому центроїд
    цієї кривої на повній сітці збігається з балом моделі.
    """
    vals = [float(values[k]) for k in INPUTS]
    fuzz = np.array([[float(membership(v, mf)) for mf in mfs] for v, mfs in zip(vals, INPUT_MFS)])
    heights = np.zeros(4)
    for rule in model.rules:
        alpha = min(fuzz[j, idx - 1] for j, idx in enumerate(rule.antecedent))
        if alpha > 0:
            heights[rule.consequent - 1] = max(heights[rule.consequent - 1], alpha)
    full = np.max(np.minimum(model.output_memberships, heights[:, None]), axis=0)
    step = max(1, (len(model.grid) - 1) // (points - 1))
    idx = np.arange(0, len(model.grid), step)
    return {
        "x": [round(float(x), 4) for x in model.grid[idx]],
        "aggregate": [round(float(y), 6) for y in full[idx]],
        "rule_strength_by_output": {OUTPUT_TERMS[i]: round(float(h), 6) for i, h in enumerate(heights)},
    }


def model_description() -> dict[str, Any]:
    """Параметри функцій належності — для побудови графіків у React."""
    return {
        "inputs": [
            {"key": k, "name": n, "range": list(r),
             "terms": [{"name": t, "params": list(p)} for t, p in zip(terms, mfs)]}
            for k, n, r, terms, mfs in zip(INPUTS, INPUT_NAMES, INPUT_RANGES, INPUT_TERMS, INPUT_MFS)
        ],
        "output": {"name": "R", "range": [0, 10],
                   "terms": [{"name": t, "params": list(p)} for t, p in zip(OUTPUT_TERMS, OUTPUT_MFS)]},
        "rule_count": 243,
    }
