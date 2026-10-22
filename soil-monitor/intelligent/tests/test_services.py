import numpy as np
from fastapi.testclient import TestClient

import llm
import strategies
from api import app, get_model
from fuzzy_model import INPUTS
from screening import classify

client = TestClient(app)
METHODS_SQL_LIKE = [
    {"id": 1, "code": "MONITOR", "name": "Повторний моніторинг", "category": "monitoring", "purpose": "Уточнення концентрацій",
     "application_conditions": "-", "advantages": "-", "limitations": "-",
     "criteria": [{"condition_key": "measurement_uncertain", "operator": "equals", "expected_value": "true", "is_required": False}]},
    {"id": 2, "code": "SOURCE", "name": "Контроль джерела", "category": "prevention", "purpose": "Запобігання надходженню",
     "application_conditions": "-", "advantages": "-", "limitations": "-",
     "criteria": [{"condition_key": "source_status", "operator": "in", "expected_value": "suspected,confirmed", "is_required": True}]},
    {"id": 3, "code": "IMMOB", "name": "Іммобілізація", "category": "remediation", "purpose": "Зменшення рухомості",
     "application_conditions": "-", "advantages": "-", "limitations": "-",
     "criteria": [{"condition_key": "contamination_confirmed", "operator": "equals", "expected_value": "true", "is_required": True},
                  {"condition_key": "soil_properties_known", "operator": "equals", "expected_value": "true", "is_required": True}]},
    {"id": 4, "code": "PHADJUST", "name": "Регулювання кислотності", "category": "remediation", "purpose": "Коригування pH",
     "application_conditions": "-", "advantages": "-", "limitations": "-",
     "criteria": [{"condition_key": "ph_acidic", "operator": "equals", "expected_value": "true", "is_required": True}]},
]
MEAS = {"pb": 9, "cd": 0.98, "zn": 12, "ph": 5.1, "ap": 8}


def payload():
    ev = client.post("/evaluate", json=MEAS).json()
    return {"measurement": MEAS, "assessment": ev, "location": {"land_use": "industrial", "source_status": "suspected"},
            "site": {"contamination_confirmed": True}, "methods": METHODS_SQL_LIKE}


def test_evaluate_curve_matches_score():
    r = client.post("/evaluate", json=MEAS)
    assert r.status_code == 200
    body = r.json()
    assert set(body["input_memberships"]) == {"Pb", "Cd", "Zn", "pH", "AP"}
    x, y = np.array(body["curve"]["x"]), np.array(body["curve"]["aggregate"])
    assert abs((x * y).sum() / y.sum() - body["score"]) < 0.05


def test_model_description():
    d = client.get("/model").json()
    assert len(d["inputs"]) == 5 and len(d["output"]["terms"]) == 4


def test_classify_three_states():
    crit = METHODS_SQL_LIKE[2]["criteria"]
    assert classify(crit, {"contamination_confirmed": True, "soil_properties_known": True})["status"] == "potentially_suitable"
    assert classify(crit, {"contamination_confirmed": True})["status"] == "needs_data"
    assert classify(crit, {"contamination_confirmed": False, "soil_properties_known": True})["status"] == "incompatible"


def test_strategies_without_llm_fail_safely(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("STRATEGY_FALLBACK", "off")
    body = client.post("/strategies", json=payload()).json()
    assert body["status"] == "failed" and body["alternatives"] == []
    assert len(body["screening"]) == 4


def test_strategies_fallback(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("STRATEGY_FALLBACK", "deterministic")
    body = client.post("/strategies", json=payload()).json()
    assert body["status"] == "generated" and body["selection_engine"] == "deterministic_fallback_v1"
    assert 3 <= len(body["alternatives"]) <= 4


def test_strategies_llm_validated(monkeypatch):
    monkeypatch.setattr(llm, "configured", lambda: True)
    calls = []
    def fake(profile, allowed, min_n, max_n, feedback=None, timeout=60):
        calls.append(feedback)
        if len(calls) == 1:  # перша відповідь з недопустимим кодом -> повтор
            return {"alternatives": [{"code": "WASH", "rank": 1, "explanation": "x" * 30}]}
        return {"alternatives": [
            {"code": "SOURCE", "rank": 1, "explanation": "Ймовірне джерело (suspected) та AP=8 потребують перевірки джерела."},
            {"code": "PHADJUST", "rank": 2, "explanation": "pH 5,1 — кислий терм домінує, рухомість Cd вища."},
            {"code": "IMMOB", "rank": 3, "explanation": "Бракує даних про властивості ґрунту та випробування добавок."}]}
    monkeypatch.setattr(llm, "select_alternatives", fake)
    body = client.post("/strategies", json=payload()).json()
    assert body["status"] == "generated" and len(calls) == 2
    imm = [a for a in body["alternatives"] if a["code"] == "IMMOB"][0]
    assert imm["suitability_status"] == "needs_data" and "soil_properties_known" in imm["missing_data"]


def test_low_category_excludes_remediation(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.setenv("STRATEGY_FALLBACK", "deterministic")
    m = {"pb": 1, "cd": .15, "zn": 1, "ph": 6.8, "ap": 1}
    ev = client.post("/evaluate", json=m).json()
    assert ev["category"] == "низький"
    p = {**payload(), "measurement": m, "assessment": ev}
    body = client.post("/strategies", json=p).json()
    assert all(a["code"] in ("MONITOR", "SOURCE") for a in body["alternatives"])


def test_incomplete_measurement_rejected():
    p = payload(); p["measurement"] = {**MEAS, "ap": None}
    assert client.post("/strategies", json=p).status_code == 422
