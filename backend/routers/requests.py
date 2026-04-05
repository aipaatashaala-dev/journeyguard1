import time
from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import db as fb_db
from dependencies import get_current_user
from models.schemas import AssistanceRequestCreate, AssistanceRequestUpdate

router = APIRouter()


def _current_user_journey(uid: str) -> dict:
    return fb_db.reference(f"user_journeys/{uid}").get() or {}


def _require_group_access(uid: str, journey_id: str, coach_id: str | None = None) -> dict:
    journey = _current_user_journey(uid)
    if not journey:
        raise HTTPException(status_code=404, detail="No active journey")
    if journey.get("group_id") != journey_id:
        raise HTTPException(status_code=403, detail="Not your journey")
    if coach_id and journey.get("coach_id") != coach_id:
        raise HTTPException(status_code=403, detail="Not your coach group")
    return journey


@router.post("")
async def send_request(body: AssistanceRequestCreate, user: dict = Depends(get_current_user)):
    uid = user["uid"]
    journey = _require_group_access(uid, body.journey_id, body.coach_id)
    passenger_id = journey.get("passenger_id", f"Passenger-{uid[:4]}")

    if body.request_type == "EMERGENCY":
        path = f"train_groups/{body.journey_id}/emergency_alerts"
    else:
        path = f"train_groups/{body.journey_id}/{body.coach_id}/requests"

    payload = {
        "passenger_id": passenger_id,
        "type": body.request_type,
        "timestamp": int(time.time() * 1000),
        "uid": uid,
        "active": True,
    }

    for field in ("message", "location_link", "google_maps_url", "expires_at", "lat", "lng", "accuracy"):
        value = getattr(body, field)
        if value is not None:
            payload[field] = value

    new_ref = fb_db.reference(path).push()
    new_ref.set(payload)

    return {"message": "Request sent", "request_id": new_ref.key, "passenger_id": passenger_id}


@router.get("/{journey_id}/{coach_id}")
async def get_requests(journey_id: str, coach_id: str, user: dict = Depends(get_current_user)):
    _require_group_access(user["uid"], journey_id, coach_id)

    requests_ref = fb_db.reference(f"train_groups/{journey_id}/{coach_id}/requests")
    data = requests_ref.get() or {}
    now_ms = int(time.time() * 1000)
    requests = []

    for req_id, value in data.items():
        if not isinstance(value, dict):
            continue
        expires_at = value.get("expires_at")
        if expires_at and int(expires_at) <= now_ms:
            fb_db.reference(f"train_groups/{journey_id}/{coach_id}/requests/{req_id}").delete()
            continue
        requests.append({"id": req_id, **value})

    requests.sort(key=lambda item: item.get("timestamp", 0))
    return {"requests": requests, "count": len(requests)}


@router.put("/{journey_id}/{coach_id}/{request_id}")
async def update_request(
    journey_id: str,
    coach_id: str,
    request_id: str,
    body: AssistanceRequestUpdate,
    user: dict = Depends(get_current_user),
):
    _require_group_access(user["uid"], journey_id, coach_id)

    ref = fb_db.reference(f"train_groups/{journey_id}/{coach_id}/requests/{request_id}")
    data = ref.get()
    if not data:
        raise HTTPException(status_code=404, detail="Request not found")
    if data.get("uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your request")

    updates = {}
    for field in ("message", "location_link", "google_maps_url", "expires_at", "lat", "lng", "accuracy"):
        value = getattr(body, field)
        if value is not None:
            updates[field] = value

    if not updates:
        return {"message": "No changes"}

    ref.update(updates)
    return {"message": "Request updated", "request": {"id": request_id, **data, **updates}}


@router.delete("/{journey_id}/{coach_id}/{request_id}")
async def delete_request(
    journey_id: str,
    coach_id: str,
    request_id: str,
    user: dict = Depends(get_current_user),
):
    _require_group_access(user["uid"], journey_id, coach_id)

    ref = fb_db.reference(f"train_groups/{journey_id}/{coach_id}/requests/{request_id}")
    data = ref.get()
    if not data:
        return {"message": "Not found"}
    if data.get("uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your request")

    ref.delete()
    return {"message": "Request deleted"}
