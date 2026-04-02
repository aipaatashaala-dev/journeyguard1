import os
import json
from typing import Any

import httpx


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def groq_enabled() -> bool:
    return bool(GROQ_API_KEY)


def _system_prompt() -> str:
    return (
        "You are JourneyGuard AI, a warm private travel helper for one passenger inside a railway coach app. "
        "Your replies are visible only to the current user, not to the whole group. "
        "Reply like a helpful human teammate, not like a robotic support agent. "
        "Help with train questions, station context, likely arrival guidance, famous places, "
        "good hotel or hostel suggestions, and local food to try. "
        "If the user asks about berth or seat change, help them find the right person in the same coach. "
        "Use the available coach passenger list and berth numbers if provided. "
        "Do not invent age, gender, or preference. "
        "For berth change questions, prefer this structure: "
        "1) quick assessment, 2) likely people to ask from the coach list, 3) a short polite message the user can send. "
        "Be concise, practical, and friendly. "
        "If a fact is uncertain, say that clearly instead of guessing. "
        "Do not invent exact live train status if it is not provided in the context. "
        "Prefer short helpful paragraphs or compact bullet points."
    )


def _format_passengers(passengers: list[dict[str, Any]] | None) -> str:
    if not passengers:
        return "No coach passenger list provided."

    lines = []
    for item in passengers[:24]:
        passenger_id = item.get("passenger_id") or "Unknown passenger"
        berth = item.get("berth") or "Unknown berth"
        coach = item.get("coach") or "Unknown coach"
        lines.append(f"- {passenger_id} | coach {coach} | berth {berth}")
    return "\n".join(lines)


def _format_history(history: list[dict[str, Any]] | None) -> str:
    if not history:
        return "No previous private AI conversation."

    lines = []
    for item in history[-8:]:
        role = item.get("role", "user").upper()
        content = (item.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines) or "No previous private AI conversation."


def _user_prompt(payload: dict[str, Any]) -> str:
    requester = payload.get("requester") or {}
    context_lines = [
        f"Asking passenger: {requester.get('passenger_id') or 'Unknown'}",
        f"Asking passenger berth: {requester.get('berth') or 'Unknown'}",
        f"Asking passenger coach: {requester.get('coach') or 'Unknown'}",
        f"Train number: {payload.get('train_number') or 'Unknown'}",
        f"Train name: {payload.get('train_name') or 'Unknown'}",
        f"Journey date: {payload.get('journey_date') or 'Unknown'}",
        f"From station: {payload.get('from_station') or 'Unknown'}",
        f"To station: {payload.get('to_station') or 'Unknown'}",
        f"Current station: {payload.get('current_station') or 'Unknown'}",
        f"Next station: {payload.get('next_station_name') or 'Unknown'}",
        f"Expected arrival: {payload.get('expected_arrival') or 'Unknown'}",
        f"Train speed: {payload.get('speed') or 'Unknown'}",
        "",
        "Coach passengers available to reference:",
        _format_passengers(payload.get("coach_passengers")),
        "",
        "Recent private AI conversation:",
        _format_history(payload.get("thread_history")),
        "",
        f"User question: {payload.get('message') or ''}",
    ]
    return "\n".join(context_lines)


async def generate_group_reply(payload: dict[str, Any]) -> str:
    if not groq_enabled():
        raise RuntimeError("GROQ_API_KEY is not configured")

    request_payload = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _user_prompt(payload)},
        ],
        "temperature": 0.4,
        "max_tokens": 350,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{GROQ_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=request_payload,
        )
        if response.status_code >= 400:
            try:
                error_data = response.json()
                raise RuntimeError(json.dumps(error_data))
            except Exception:
                raise RuntimeError(response.text)
        data = response.json()

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Groq returned no choices")

    message = choices[0].get("message") or {}
    content = (message.get("content") or "").strip()
    if not content:
        raise RuntimeError("Groq returned an empty reply")

    return content
