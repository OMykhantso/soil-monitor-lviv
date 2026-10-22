"""Формалізований скринінг методів за таблицею method_criteria (підрозділ 2.5).

Логіка класифікації — з screening_example.py стартового комплекту БД:
  incompatible          — порушено обов'язкову умову;
  needs_data            — обов'язкове поле відсутнє (None);
  potentially_suitable  — немає порушень і пропусків обов'язкових полів.
Необов'язкові критерії не блокують метод.
"""
from __future__ import annotations

from typing import Any, Mapping

from fis_extras import input_memberships

CATEGORY_CODES = {"низький": "low", "помірний": "moderate", "високий": "high", "критичний": "critical"}

# Ключі ділянки, які вводить фахівець (site_characteristics). None = невідомо.
SITE_KEYS = (
    "contamination_confirmed", "measurement_uncertain", "plant_growth_suitable",
    "bioavailability_assessed", "soil_properties_known", "amendment_tested",
    "grain_size_known", "washing_feasibility_tested", "localized_extent_confirmed",
    "disposal_route_known", "exposure_pathway_present",
)


def _norm(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value).strip().lower()


def classify(criteria: list[Mapping[str, Any]], profile: Mapping[str, Any]) -> dict[str, Any]:
    missing: list[str] = []
    failed: list[str] = []
    for c in criteria:
        actual = profile.get(c["condition_key"])
        if actual is None:
            if c["is_required"]:
                missing.append(c["condition_key"])
            continue
        expected = [e.strip().lower() for e in c["expected_value"].split(",")] \
            if c["operator"] == "in" else [c["expected_value"].strip().lower()]
        if _norm(actual) not in expected and c["is_required"]:
            failed.append(c["condition_key"])
    if failed:
        return {"status": "incompatible", "missing_data": missing, "failed": failed}
    if missing:
        return {"status": "needs_data", "missing_data": missing, "failed": []}
    return {"status": "potentially_suitable", "missing_data": [], "failed": []}


def build_profile(measurement: Mapping[str, Any], assessment: Mapping[str, Any],
                  location: Mapping[str, Any], site: Mapping[str, Any]) -> dict[str, Any]:
    """Профіль ситуації D: Pb, Cd, Zn, pH, AP, R, кратності ГДК і контекст ділянки.

    ph_acidic визначається за домінуючим термом pH моделі Мамдані (дозволено для
    демо-режиму за README БД); основа визначення зберігається в профілі.
    Решта ознак береться ТІЛЬКИ з site_characteristics — з бала R вони не виводяться.
    """
    values = {k: float(measurement[k]) for k in ("pb", "cd", "zn", "ph", "ap")}
    ph_terms = input_memberships(values)["pH"]
    dominant = max(ph_terms, key=ph_terms.get)
    ranked = sorted(ph_terms.values(), reverse=True)
    tie = abs(ranked[0] - ranked[1]) < 1e-9
    # Рівність ступенів (напр. pH 6,0 між «кислий» і «близький до нейтрального») — невизначеність:
    # ph_acidic = None → для PHADJUST статус needs_data, а не довільне рішення.
    ph_acidic = None if tie else dominant == "кислий"
    profile: dict[str, Any] = {
        **values,
        "R": float(assessment["score"]),
        "category": assessment["category"],
        "multiples_gdk": assessment.get("multiples_gdk") or {},
        "land_use": location.get("land_use"),
        "source_status": location.get("source_status") or "unknown",
        "ph_acidic": ph_acidic,
        "ph_acidic_basis": ("рівні ступені належності термів pH — кислотність невизначена; "
                            if tie else f"домінуючий терм pH моделі А: «{dominant}» ({ph_terms[dominant]:.2f}); ")
                           + f"метод визначення pH: {measurement.get('ph_method') or 'не вказано'}",
    }
    for key in SITE_KEYS:
        profile[key] = site.get(key)
    return profile


def screen_methods(methods: list[Mapping[str, Any]], profile: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Скринінг усіх активних методів. Для категорії «низький» ремедіаційні методи
    не розглядаються (проєктне правило: при низькому рівні доречні лише моніторинг
    і превентивні заходи)."""
    out = []
    low = CATEGORY_CODES.get(profile["category"], profile["category"]) == "low"
    for m in methods:
        res = classify(m.get("criteria", []), profile)
        if low and m["category"] == "remediation":
            res = {"status": "incompatible", "missing_data": [], "failed": ["category_low"]}
        out.append({"method_id": m["id"], "code": m["code"], "name": m["name"],
                    "category": m["category"], **res})
    return out
