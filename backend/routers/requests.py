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
    return journey


def _group_requests_path(journey_id: str) -> str:
    return f"train_groups/{journey_id}/requests"


def _collect_requests(journey_id: str) -> list[tuple[str, dict, str]]:
    group_data = fb_db.reference(f"train_groups/{journey_id}").get() or {}
    collected: list[tuple[str, dict, str]] = []

    root_requests = group_data.get("requests")
    if isinstance(root_requests, dict):
        for req_id, value in root_requests.items():
            if isinstance(value, dict):
                collected.append((req_id, value, f"{_group_requests_path(journey_id)}/{req_id}"))

    for coach_id, coach_data in group_data.items():
        if not coach_id.startswith("coach_") or not isinstance(coach_data, dict):
            continue
        coach_requests = coach_data.get("requests")
        if not isinstance(coach_requests, dict):
            continue
        for req_id, value in coach_requests.items():
            if isinstance(value, dict):
                collected.append((req_id, value, f"train_groups/{journey_id}/{coach_id}/requests/{req_id}"))

    return collected


def _find_request_ref(journey_id: str, request_id: str):
    request_ref = fb_db.reference(f"{_group_requests_path(journey_id)}/{request_id}")
    data = request_ref.get()
    if isinstance(data, dict):
        return request_ref, data

    for _, _, path in _collect_requests(journey_id):
        if path.endswith(f"/{request_id}"):
            legacy_ref = fb_db.reference(path)
            legacy_data = legacy_ref.get()
            if isinstance(legacy_data, dict):
                return legacy_ref, legacy_data

    return None, None


@router.post("")
async def send_request(body: AssistanceRequestCreate, user: dict = Depends(get_current_user)):
    uid = user["uid"]
    journey = _require_group_access(uid, body.journey_id, body.coach_id)
    passenger_id = journey.get("passenger_id", f"Passenger-{uid[:4]}")

    if body.request_type == "EMERGENCY":
        path = f"train_groups/{body.journey_id}/emergency_alerts"
    else:
        path = _group_requests_path(body.journey_id)

    payload = {
        "passenger_id": passenger_id,
        "type": body.request_type,
        "timestamp": int(time.time() * 1000),
        "uid": uid,
        "active": True,
        "coach": journey.get("coach") or "general",
        "berth": journey.get("berth") or "",
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

    now_ms = int(time.time() * 1000)
    requests = []

    for req_id, value, path in _collect_requests(journey_id):
        expires_at = value.get("expires_at")
        if expires_at and int(expires_at) <= now_ms:
            fb_db.reference(path).delete()
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

    ref, data = _find_request_ref(journey_id, request_id)
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

    ref, data = _find_request_ref(journey_id, request_id)
    if not data:
        return {"message": "Not found"}
    if data.get("uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your request")

    ref.delete()
    return {"message": "Request deleted"}
