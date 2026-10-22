"""Інтелектуальний відбір альтернатив реагування (підрозділ 2.5, процедура з README БД).

1. Профіль ситуації D (screening.build_profile).
2. Формальний скринінг критеріїв: incompatible вилучаються, needs_data лишаються з попередженням.
3. LLM отримує тільки дозволені методи й повертає 3–5 кодів з поясненнями (JSON).
4. Програмна перевірка: коди з дозволеної множини, без повторів, ранги 1..N,
   відсутність тверджень про підтверджену придатність. Одна повторна спроба.
5. Статус придатності та перелік відсутніх даних беруться зі скринінгу, а НЕ з тексту LLM.
За недоступності LLM набір не створюється (status=failed), якщо явно не ввімкнено
детермінований резервний режим STRATEGY_FALLBACK=deterministic.
"""
from __future__ import annotations

import os
from typing import Any

import llm
from screening import CATEGORY_CODES, build_profile, screen_methods

MAX_ALTERNATIVES = 5
MIN_ALTERNATIVES = 3
FORBIDDEN_PHRASES = ("підтверджена придатність", "придатність підтверджено", "гарантовано",
                     "гарантує", "обов'язково застосувати", "обов’язково застосувати")

# Пріоритети лише для резервного детермінованого режиму (не для LLM)
_FALLBACK_PRIORITY = {
    "low": ["MONITOR", "SOURCE", "LANDUSE"],
    "moderate": ["MONITOR", "SOURCE", "PHADJUST", "PHYTOSTAB", "IMMOB", "PHYTOEXT", "LANDUSE", "WASH", "EXCAV"],
    "high": ["SOURCE", "MONITOR", "IMMOB", "PHADJUST", "LANDUSE", "PHYTOSTAB", "PHYTOEXT", "WASH", "EXCAV"],
    "critical": ["SOURCE", "LANDUSE", "EXCAV", "IMMOB", "WASH", "MONITOR", "PHADJUST", "PHYTOSTAB", "PHYTOEXT"],
}

KEY_LABELS = {
    "contamination_confirmed": "підтвердження забруднення лабораторними даними",
    "measurement_uncertain": "оцінка невизначеності вимірювань",
    "plant_growth_suitable": "придатність умов для росту рослин",
    "bioavailability_assessed": "оцінка біодоступності металів",
    "soil_properties_known": "властивості ґрунту",
    "amendment_tested": "лабораторне випробування добавок",
    "grain_size_known": "гранулометричний склад",
    "washing_feasibility_tested": "випробування придатності промивання",
    "localized_extent_confirmed": "підтвердження локальних меж забруднення",
    "disposal_route_known": "шлях безпечного поводження з ґрунтом",
    "exposure_pathway_present": "наявність шляху експозиції людей",
    "source_status": "статус джерела забруднення",
    "ph_acidic": "кислотність ґрунту",
}


def validate(resp: Any, allowed_codes: set[str], min_n: int, max_n: int) -> tuple[list[dict], str | None]:
    items = resp.get("alternatives") if isinstance(resp, dict) else None
    if not isinstance(items, list):
        return [], "відсутній масив alternatives"
    if not (min_n <= len(items) <= max_n):
        return [], f"кількість альтернатив {len(items)}, очікується {min_n}–{max_n}"
    codes = [str(i.get("code", "")).upper() for i in items]
    bad = [c for c in codes if c not in allowed_codes]
    if bad:
        return [], f"недопустимі коди: {', '.join(bad)}"
    if len(set(codes)) != len(codes):
        return [], "повторювані коди"
    ranks = sorted(int(i.get("rank", 0)) for i in items)
    if ranks != list(range(1, len(items) + 1)):
        return [], "ранги мають бути 1..N без пропусків"
    for i in items:
        text = str(i.get("explanation", "")).strip()
        if len(text) < 20:
            return [], f"занадто коротке пояснення для {i.get('code')}"
        low = text.lower()
        if any(p in low for p in FORBIDDEN_PHRASES):
            return [], f"пояснення для {i.get('code')} стверджує підтверджену придатність або гарантію"
    out = sorted(({"code": c, "rank": int(i["rank"]), "explanation": str(i["explanation"]).strip()}
                  for c, i in zip(codes, items)), key=lambda x: x["rank"])
    return out, None


def _fallback(profile: dict, allowed: list[dict], max_n: int) -> list[dict]:
    order = _FALLBACK_PRIORITY.get(CATEGORY_CODES.get(profile["category"], "moderate"), [])
    def key(m):
        status_w = 0 if m["status"] == "potentially_suitable" else 1
        pos = order.index(m["code"]) if m["code"] in order else 99
        return (status_w, pos)
    chosen = sorted(allowed, key=key)[:max_n]
    res = []
    mult = profile.get("multiples_gdk") or {}
    mtxt = ", ".join(f"{k.capitalize()} {v:.2f}×ГДК" for k, v in mult.items())
    for rank, m in enumerate(chosen, 1):
        parts = [f"Категорія нечіткої оцінки «{profile['category']}» (R = {profile['R']:.2f}); {mtxt}."]
        parts.append(f"Призначення методу: {m['purpose'].rstrip('.')}.")
        if m["status"] == "needs_data":
            parts.append("Перед розглядом потрібні дані: "
                         + "; ".join(KEY_LABELS.get(k, k) for k in m["missing_data"]) + ".")
        else:
            parts.append("Обов'язкові критерії бази знань виконано; рішення потребує фахової оцінки.")
        res.append({"code": m["code"], "rank": rank, "explanation": " ".join(parts)})
    return res


def select_strategies(payload: dict) -> dict:
    profile = build_profile(payload["measurement"], payload["assessment"],
                            payload["location"], payload.get("site") or {})
    methods = [m for m in payload["methods"] if m.get("active", True)]
    screening = screen_methods(methods, profile)
    by_code = {m["code"]: m for m in methods}
    allowed = [
        {"code": s["code"], "name": s["name"], "category": s["category"], "status": s["status"],
         "missing_data": s["missing_data"], "purpose": by_code[s["code"]]["purpose"],
         "application_conditions": by_code[s["code"]]["application_conditions"],
         "advantages": by_code[s["code"]]["advantages"], "limitations": by_code[s["code"]]["limitations"]}
        for s in screening if s["status"] != "incompatible"
    ]
    base = {"profile": profile, "screening": screening}
    if not allowed:
        return {**base, "status": "failed", "selection_engine": "none", "llm_model": None,
                "alternatives": [], "error": "Жоден метод бази знань не пройшов скринінг"}

    max_n = min(MAX_ALTERNATIVES, len(allowed))
    min_n = min(MIN_ALTERNATIVES, len(allowed))
    allowed_codes = {a["code"] for a in allowed}
    status_by_code = {s["code"]: s for s in screening}
    llm_profile = {k: v for k, v in profile.items()}  # без даних користувачів

    picked: list[dict] = []
    engine, model, error = "llm_structured_v1", llm.model_name(), None
    if llm.configured():
        feedback = None
        for _ in range(2):
            try:
                raw = llm.select_alternatives(llm_profile, allowed, min_n, max_n, feedback)
            except llm.LLMUnavailable as exc:
                error = str(exc)
                break
            picked, feedback = validate(raw, allowed_codes, min_n, max_n)
            if picked:
                error = None
                break
            error = f"Відповідь LLM не пройшла перевірку: {feedback}"
    else:
        error = "LLM не налаштована (LLM_PROVIDER, API-ключ)"

    if not picked and os.getenv("STRATEGY_FALLBACK", "off").lower() == "deterministic":
        picked = _fallback(profile, allowed, max_n)
        engine, model = "deterministic_fallback_v1", None
        error = f"Резервний режим без LLM. Причина: {error}" if error else None

    if not picked:
        return {**base, "status": "failed", "selection_engine": engine, "llm_model": model,
                "alternatives": [], "error": error}

    alternatives = [{
        "code": p["code"], "method_id": status_by_code[p["code"]]["method_id"], "rank": p["rank"],
        "suitability_status": status_by_code[p["code"]]["status"],
        "missing_data": status_by_code[p["code"]]["missing_data"], "explanation": p["explanation"],
    } for p in picked]
    return {**base, "status": "generated", "selection_engine": engine, "llm_model": model,
            "alternatives": alternatives, "error": error}
