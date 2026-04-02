import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import db as fb_db

from dependencies import get_current_user
from models.schemas import AIThreadMessage, AIThreadResponse, GroupAIReplyRequest
from services.groq_service import generate_group_reply, groq_enabled


router = APIRouter()
logger = logging.getLogger(__name__)


def _thread_messages_ref(uid: str, journey_id: str, coach_id: str):
    return fb_db.reference(f"ai_threads/{uid}/{journey_id}/{coach_id}/messages")


def _load_thread(uid: str, journey_id: str, coach_id: str) -> list[dict]:
    data = _thread_messages_ref(uid, journey_id, coach_id).get() or {}
    messages = []
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        messages.append({"id": key, **value})
    messages.sort(key=lambda item: item.get("timestamp", 0))
    return messages


def _serialize_thread(uid: str, journey_id: str, coach_id: str) -> AIThreadResponse:
    messages = [AIThreadMessage(**item) for item in _load_thread(uid, journey_id, coach_id)]
    return AIThreadResponse(messages=messages, journey_id=journey_id, coach_id=coach_id)


def _coach_passengers(journey_id: str, coach_id: str) -> list[dict]:
    coach_data = fb_db.reference(f"train_groups/{journey_id}/{coach_id}").get() or {}
    passengers = []
    for key, value in coach_data.items():
        if key in {"requests", "metadata"}:
            continue
        if not isinstance(value, dict) or not value.get("passenger_id"):
            continue
        passengers.append(
            {
                "uid": key,
                "passenger_id": value.get("passenger_id"),
                "coach": value.get("coach"),
                "berth": value.get("berth"),
                "joined_at": value.get("joined_at"),
            }
        )
    passengers.sort(key=lambda item: (item.get("coach") or "", item.get("berth") or ""))
    return passengers


def _requester_context(uid: str, journey_id: str, coach_id: str, fallback_email: str | None) -> dict:
    coach_entry = fb_db.reference(f"train_groups/{journey_id}/{coach_id}/{uid}").get() or {}
    user_journey = fb_db.reference(f"user_journeys/{uid}").get() or {}

    return {
        "uid": uid,
        "passenger_id": coach_entry.get("passenger_id") or user_journey.get("passenger_id") or fallback_email or "Current user",
        "berth": coach_entry.get("berth") or user_journey.get("berth") or "Unknown",
        "coach": coach_entry.get("coach") or user_journey.get("coach") or "Unknown",
    }


def _save_thread_message(
    uid: str,
    journey_id: str,
    coach_id: str,
    *,
    role: str,
    content: str,
    sender_label: str,
    is_ai: bool,
):
    message_ref = _thread_messages_ref(uid, journey_id, coach_id).push()
    message_ref.set(
        {
            "role": role,
            "content": content,
            "timestamp": int(time.time() * 1000),
            "sender_label": sender_label,
            "is_ai": is_ai,
        }
    )


async def _generate_private_reply(body: GroupAIReplyRequest, user: dict) -> AIThreadResponse:
    if not groq_enabled():
        raise HTTPException(status_code=503, detail="Groq API is not configured on the server")

    clean_message = (body.message or "").strip()
    if not clean_message:
        raise HTTPException(status_code=422, detail="AI message is required")

    uid = user["uid"]
    existing_thread = _load_thread(uid, body.journey_id, body.coach_id)
    coach_passengers = [
        passenger
        for passenger in _coach_passengers(body.journey_id, body.coach_id)
        if passenger.get("uid") != uid
    ]
    requester = _requester_context(uid, body.journey_id, body.coach_id, user.get("email"))

    payload = {
        **body.model_dump(),
        "message": clean_message,
        "coach_passengers": coach_passengers,
        "requester": requester,
        "thread_history": existing_thread,
    }

    try:
        reply_text = await generate_group_reply(payload)
    except Exception as exc:
        logger.exception("Groq private group reply failed")
        raise HTTPException(status_code=502, detail=f"Could not generate AI reply: {str(exc)}")

    _save_thread_message(
        uid,
        body.journey_id,
        body.coach_id,
        role="user",
        content=clean_message,
        sender_label=requester["passenger_id"],
        is_ai=False,
    )
    _save_thread_message(
        uid,
        body.journey_id,
        body.coach_id,
        role="assistant",
        content=reply_text,
        sender_label="JourneyGuard AI",
        is_ai=True,
    )

    return _serialize_thread(uid, body.journey_id, body.coach_id)


@router.get("/group-thread", response_model=AIThreadResponse)
async def get_group_thread(journey_id: str, coach_id: str, user: dict = Depends(get_current_user)):
    return _serialize_thread(user["uid"], journey_id, coach_id)


@router.post("/group-chat", response_model=AIThreadResponse)
async def create_private_group_chat(body: GroupAIReplyRequest, user: dict = Depends(get_current_user)):
    return await _generate_private_reply(body, user)


@router.post("/group-reply", response_model=AIThreadResponse)
async def create_group_reply(body: GroupAIReplyRequest, user: dict = Depends(get_current_user)):
    return await _generate_private_reply(body, user)
