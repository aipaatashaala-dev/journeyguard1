import time
from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import db as fb_db
from dependencies import get_current_user
from models.schemas import AssistanceRequestCreate, AssistanceRequestUpdate, MessageReportRequest

router = APIRouter()
MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000
AUTO_BLOCK_REPORT_THRESHOLD = 5


def _current_user_journey(uid: str) -> dict:
    return fb_db.reference(f"user_journeys/{uid}").get() or {}


def _normalize_display_name(value) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().split())[:40]


def _fallback_display_name(uid: str, journey: dict, user: dict) -> str:
    display_name = _normalize_display_name(journey.get("display_name"))
    if display_name:
        return display_name

    profile = fb_db.reference(f"users/{uid}").get() or {}
    display_name = _normalize_display_name(profile.get("display_name") or user.get("name"))
    if display_name:
        return display_name

    email = str(profile.get("email") or user.get("email") or "").strip()
    if "@" in email:
        email = email.split("@", 1)[0]

    display_name = _normalize_display_name(email)
    return display_name or str(journey.get("passenger_id") or f"Passenger-{uid[:4]}")


def _require_group_access(uid: str, journey_id: str, coach_id: str | None = None) -> dict:
    journey = _current_user_journey(uid)
    if not journey:
        raise HTTPException(status_code=404, detail="No active journey")
    if journey.get("group_id") != journey_id:
        raise HTTPException(status_code=403, detail="Not your journey")
    return journey


def _blocked_group_ref(journey_id: str, uid: str):
    return fb_db.reference(f"train_groups/{journey_id}/blocked_users/{uid}")


def _report_target_ref(journey_id: str, target_uid: str):
    return fb_db.reference(f"train_groups/{journey_id}/reports/by_target/{target_uid}")


def _ensure_not_blocked(uid: str, journey_id: str):
    blocked_state = _blocked_group_ref(journey_id, uid).get() or {}
    if isinstance(blocked_state, dict) and blocked_state.get("blocked"):
        raise HTTPException(
            status_code=403,
            detail="You have been blocked from this train group after repeated reports.",
        )


def _all_group_messages(journey_id: str) -> list[tuple[str, dict, str]]:
    return _collect_requests(journey_id)


def _remove_user_from_group(journey_id: str, uid: str):
    fb_db.reference(f"train_groups/{journey_id}/members/{uid}").delete()
    group_data = fb_db.reference(f"train_groups/{journey_id}").get() or {}
    for coach_id, coach_data in group_data.items():
        if not isinstance(coach_data, dict):
            continue
        if coach_id.startswith("coach_") and uid in coach_data:
            fb_db.reference(f"train_groups/{journey_id}/{coach_id}/{uid}").delete()

    user_journey = fb_db.reference(f"user_journeys/{uid}").get() or {}
    if isinstance(user_journey, dict) and user_journey.get("group_id") == journey_id:
        fb_db.reference(f"user_journeys/{uid}").delete()


def _block_user_in_group(journey_id: str, target_uid: str, reason: str):
    now_ms = int(time.time() * 1000)
    _blocked_group_ref(journey_id, target_uid).set({
        "blocked": True,
        "blocked_at": now_ms,
        "reason": reason,
    })

    for req_id, value, path in _all_group_messages(journey_id):
        if value.get("uid") == target_uid:
            fb_db.reference(path).update({
                "active": False,
                "hidden_due_to_reports": True,
                "blocked_at": now_ms,
            })

    _remove_user_from_group(journey_id, target_uid)

    fb_db.reference(f"train_groups/{journey_id}/requests").push().set({
        "passenger_id": "JourneyGuard Updates",
        "display_name": "JourneyGuard Updates",
        "type": "SYSTEM",
        "message": "A passenger was removed from this group after repeated abuse reports.",
        "timestamp": now_ms,
        "uid": "journeyguard-system",
        "active": True,
        "is_system": True,
    })


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
    _ensure_not_blocked(uid, body.journey_id)
    passenger_id = journey.get("passenger_id", f"Passenger-{uid[:4]}")
    display_name = _fallback_display_name(uid, journey, user)

    if body.request_type == "EMERGENCY":
        path = f"train_groups/{body.journey_id}/emergency_alerts"
    else:
        path = _group_requests_path(body.journey_id)

    payload = {
        "passenger_id": passenger_id,
        "display_name": display_name,
        "type": body.request_type,
        "timestamp": int(time.time() * 1000),
        "uid": uid,
        "active": True,
        "coach": journey.get("coach") or "general",
        "berth": journey.get("berth") or "",
        "berth_status": journey.get("berth_status") or "",
    }

    for field in ("message", "location_link", "google_maps_url", "expires_at", "lat", "lng", "accuracy"):
        value = getattr(body, field)
        if value is not None:
            payload[field] = value

    new_ref = fb_db.reference(path).push()
    new_ref.set(payload)

    return {
        "message": "Request sent",
        "request_id": new_ref.key,
        "passenger_id": passenger_id,
        "display_name": display_name,
    }


@router.get("/{journey_id}/{coach_id}")
async def get_requests(journey_id: str, coach_id: str, user: dict = Depends(get_current_user)):
    _require_group_access(user["uid"], journey_id, coach_id)

    now_ms = int(time.time() * 1000)
    requests = []

    for req_id, value, path in _collect_requests(journey_id):
        if not value.get("active", True):
            continue
        if value.get("hidden_due_to_reports"):
            continue
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
    _ensure_not_blocked(user["uid"], journey_id)

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

    new_message = updates.get("message")
    message_changed = (
        new_message is not None and
        str(new_message).strip() != str(data.get("message") or "").strip()
    )
    if message_changed:
        age_ms = int(time.time() * 1000) - int(data.get("timestamp") or 0)
        if age_ms > MESSAGE_EDIT_WINDOW_MS:
            raise HTTPException(
                status_code=403,
                detail="Messages can be edited only within 5 minutes of sending",
            )
        updates["edited_at"] = int(time.time() * 1000)

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
    _ensure_not_blocked(user["uid"], journey_id)

    ref, data = _find_request_ref(journey_id, request_id)
    if not data:
        return {"message": "Not found"}
    if data.get("uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your request")

    ref.delete()
    return {"message": "Request deleted"}


@router.post("/{journey_id}/{coach_id}/{request_id}/report")
async def report_request(
    journey_id: str,
    coach_id: str,
    request_id: str,
    body: MessageReportRequest,
    user: dict = Depends(get_current_user),
):
    reporter_uid = user["uid"]
    _require_group_access(reporter_uid, journey_id, coach_id)

    _, data = _find_request_ref(journey_id, request_id)
    if not data:
        raise HTTPException(status_code=404, detail="Message not found")

    target_uid = str(data.get("uid") or "").strip()
    if not target_uid:
        raise HTTPException(status_code=400, detail="This message cannot be reported")
    if target_uid == reporter_uid:
        raise HTTPException(status_code=400, detail="You cannot report your own message")
    if data.get("is_system") or data.get("type") == "SYSTEM":
        raise HTTPException(status_code=400, detail="System updates cannot be reported")

    blocked_state = _blocked_group_ref(journey_id, target_uid).get() or {}
    if isinstance(blocked_state, dict) and blocked_state.get("blocked"):
        return {
            "message": "This passenger is already blocked from the group",
            "blocked": True,
            "report_count": AUTO_BLOCK_REPORT_THRESHOLD,
        }

    report_root = _report_target_ref(journey_id, target_uid)
    report_root.child("reports").child(reporter_uid).set({
        "request_id": request_id,
        "reason": str(body.reason or "").strip()[:240],
        "reported_at": int(time.time() * 1000),
        "reporter_uid": reporter_uid,
    })

    reports = report_root.child("reports").get() or {}
    report_count = len([value for value in reports.values() if isinstance(value, dict)])
    report_root.update({
        "target_uid": target_uid,
        "last_request_id": request_id,
        "last_reported_at": int(time.time() * 1000),
        "report_count": report_count,
    })

    blocked = report_count >= AUTO_BLOCK_REPORT_THRESHOLD
    if blocked:
        _block_user_in_group(
            journey_id,
            target_uid,
            reason="auto_block_after_reports",
        )

    return {
        "message": "Report submitted",
        "blocked": blocked,
        "report_count": report_count,
        "reports_remaining": max(0, AUTO_BLOCK_REPORT_THRESHOLD - report_count),
    }
