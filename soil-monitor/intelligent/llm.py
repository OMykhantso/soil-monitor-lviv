"""Виклик зовнішньої LLM зі структурованою відповіддю (JSON).

Підтримувані провайдери (змінна LLM_PROVIDER): anthropic | openai.
LLM отримує ЛИШЕ профіль ситуації та допустимі методи — без облікових даних
користувачів (нефункціональна вимога 3.1).
"""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["alternatives"],
    "properties": {
        "alternatives": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["code", "rank", "explanation"],
                "properties": {
                    "code": {"type": "string"},
                    "rank": {"type": "integer"},
                    "explanation": {"type": "string"},
                },
            },
        }
    },
}

SYSTEM_PROMPT = (
    "Ти — модуль підтримки прийняття рішень інформаційної системи моніторингу забруднення "
    "ґрунтів Львівської області. Твоє завдання — вибрати та впорядкувати альтернативні "
    "підходи до реагування ТІЛЬКИ з переданого списку дозволених методів і пояснити "
    "українською мовою, чому кожен відповідає саме цій ситуації (показники, кратності ГДК, "
    "pH, антропогенне навантаження AP, категорія нечіткої оцінки, характеристики ділянки).\n"
    "Правила:\n"
    "1) Використовуй лише коди зі списку allowed_methods; не вигадуй нових методів.\n"
    "2) Поверни від {min_n} до {max_n} альтернатив без повторів; rank — 1..N без пропусків.\n"
    "3) Для методів зі статусом needs_data прямо назви, яких даних бракує.\n"
    "4) Не стверджуй, що придатність методу підтверджена, і не давай гарантій: це варіанти "
    "для фахового розгляду, остаточне рішення приймає користувач.\n"
    "5) Пояснення — 2–4 речення, конкретні, з посиланням на значення профілю.\n"
    "Відповідь — лише JSON за заданою схемою."
)


class LLMUnavailable(RuntimeError):
    pass


def configured() -> bool:
    provider = os.getenv("LLM_PROVIDER", "").lower()
    if provider == "anthropic":
        return bool(os.getenv("ANTHROPIC_API_KEY"))
    if provider == "openai":
        return bool(os.getenv("OPENAI_API_KEY"))
    return False


def model_name() -> str:
    provider = os.getenv("LLM_PROVIDER", "").lower()
    return os.getenv("LLM_MODEL") or ("claude-sonnet-4-5" if provider == "anthropic" else "gpt-4o-mini")


def _user_message(profile: dict, allowed: list[dict], feedback: str | None) -> str:
    payload = {"situation_profile": profile, "allowed_methods": allowed}
    msg = json.dumps(payload, ensure_ascii=False, indent=1)
    if feedback:
        msg += f"\n\nПопередня відповідь була відхилена перевіркою: {feedback}. Виправ її."
    return msg


def select_alternatives(profile: dict, allowed: list[dict], min_n: int, max_n: int,
                        feedback: str | None = None, timeout: float = 60.0) -> dict:
    """Повертає розібраний JSON {'alternatives': [...]} від LLM."""
    provider = os.getenv("LLM_PROVIDER", "").lower()
    system = SYSTEM_PROMPT.format(min_n=min_n, max_n=max_n)
    user = _user_message(profile, allowed, feedback)
    try:
        if provider == "anthropic":
            r = httpx.post(
                os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com") + "/v1/messages",
                headers={"x-api-key": os.environ["ANTHROPIC_API_KEY"],
                         "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": model_name(), "max_tokens": 2000, "system": system,
                      "messages": [{"role": "user", "content": user}],
                      "tools": [{"name": "submit_alternatives",
                                 "description": "Повернути впорядкований список альтернатив",
                                 "input_schema": RESPONSE_SCHEMA}],
                      "tool_choice": {"type": "tool", "name": "submit_alternatives"}},
                timeout=timeout)
            r.raise_for_status()
            for block in r.json().get("content", []):
                if block.get("type") == "tool_use":
                    return block["input"]
            raise LLMUnavailable("LLM не повернула структуровану відповідь")
        if provider == "openai":
            r = httpx.post(
                os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1") + "/chat/completions",
                headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"},
                json={"model": model_name(),
                      "messages": [{"role": "system", "content": system},
                                   {"role": "user", "content": user}],
                      "response_format": {"type": "json_schema",
                                          "json_schema": {"name": "alternatives", "strict": True,
                                                          "schema": RESPONSE_SCHEMA}}},
                timeout=timeout)
            r.raise_for_status()
            return json.loads(r.json()["choices"][0]["message"]["content"])
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise LLMUnavailable(f"Помилка звернення до LLM: {exc}") from exc
    raise LLMUnavailable("LLM не налаштована (LLM_PROVIDER та API-ключ)")
