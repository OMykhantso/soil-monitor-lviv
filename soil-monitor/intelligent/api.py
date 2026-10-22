"""Python/FastAPI сервіс: модель А (FIS Мамдані, 243 правила) + відбір стратегій.

Внутрішні маршрути (викликає лише Node/Express, не користувач):
  GET  /health          стан сервісу
  GET  /model           параметри функцій належності (для графіків)
  POST /assess          оцінювання (оригінальний контракт моделі А)
  POST /evaluate        оцінювання + ступені належності + агрегована крива
  POST /strategies      скринінг бази знань + LLM-відбір 3–5 альтернатив
Запуск: uvicorn api:app --host 0.0.0.0 --port 8000
"""
from functools import lru_cache
from typing import Annotated, Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field

import llm
from fis_extras import aggregate_curve, input_memberships, model_description
from fuzzy_model import SoilFuzzyModel
from strategies import select_strategies

app = FastAPI(title="Lviv Soil Fuzzy Assessment API", version="1.1.0")


class AssessmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pb: Annotated[float, Field(ge=0, le=30, description="Pb mobile form, mg/kg")]
    cd: Annotated[float, Field(ge=0, le=3.5, description="Cd mobile form, mg/kg")]
    zn: Annotated[float, Field(ge=0, le=115, description="Zn mobile form, mg/kg")]
    ph: Annotated[float, Field(ge=3, le=10, description="pH according to agreed lab extraction method")]
    ap: Annotated[int, Field(ge=0, le=10, description="Expert AP total, 5 criteria × 0..2")]


@lru_cache(maxsize=1)
def get_model() -> SoilFuzzyModel:
    return SoilFuzzyModel(sample_points=1001)


@app.get("/health")
def health():
    return {"status": "ok", "model": "MKR-A-2.3-1.0", "rule_count": 243,
            "llm_configured": llm.configured(), "llm_model": llm.model_name() if llm.configured() else None}


@app.get("/model")
def model():
    return model_description()


@app.post("/assess")
def assess(request: AssessmentInput):
    try:
        return get_model().evaluate(**request.model_dump())
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/evaluate")
def evaluate(request: AssessmentInput):
    values = request.model_dump()
    try:
        result = get_model().evaluate(**values, top_rules=10)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    result["input_memberships"] = input_memberships(values)
    result["curve"] = aggregate_curve(get_model(), values)
    return result


class Criterion(BaseModel):
    condition_key: str
    operator: str
    expected_value: str
    is_required: bool
    explanation: Optional[str] = None


class Method(BaseModel):
    id: int
    code: str
    name: str
    category: str
    purpose: str
    application_conditions: str
    advantages: str
    limitations: str
    active: bool = True
    criteria: list[Criterion] = []


class StrategyRequest(BaseModel):
    measurement: dict[str, Any]
    assessment: dict[str, Any]
    location: dict[str, Any]
    site: dict[str, Any] = {}
    methods: list[Method]


@app.post("/strategies")
def strategies(req: StrategyRequest):
    for k in ("pb", "cd", "zn", "ph", "ap"):
        if req.measurement.get(k) is None:
            raise HTTPException(422, f"Неповне спостереження: відсутнє {k}")
    for k in ("score", "category"):
        if k not in req.assessment:
            raise HTTPException(422, f"Відсутній результат FIS: {k}")
    payload = req.model_dump()
    payload["methods"] = [m.model_dump() for m in req.methods]
    return select_strategies(payload)
