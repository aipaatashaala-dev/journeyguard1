import re
import time
import threading
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from firebase_admin import db as fb_db
from dependencies import get_current_user
from models.schemas import JoinJourneyRequest, TrainInfoResponse
from services.email_service import send_journey_start_email, send_journey_end_email
from services.train_service import get_train_info
from services.location_service import expire_location_session, get_location_data

router = APIRouter()
_group_monitor_lock = threading.Lock()
_group_monitor_events: dict[str, threading.Event] = {}
_FALLBACK_GROUP_RETENTION_HOURS = 24


def _group_id(train: str, date: str) -> str:
    return f"{train}_{date}"


def _coach_id(coach: str) -> str:
    return f"coach_{coach}"


def _current_user_journey(uid: str) -> dict:
    return fb_db.reference(f"user_journeys/{uid}").get() or {}


def _safe_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_group_cleanup_time(journey_date: str, arrival_time: str | None, grace_hours: int = 1) -> int | None:
    if not arrival_time:
        return None

    try:
        clean = arrival_time.strip().upper()
        day_offset = 0
        if "+1" in clean:
            clean = clean.replace("+1", "").strip()
            day_offset = 1

        parsed_date = datetime.strptime(journey_date, "%Y-%m-%d")
        parsed_time = datetime.strptime(clean, "%H:%M")
        arrival_dt = parsed_date.replace(hour=parsed_time.hour, minute=parsed_time.minute, second=0, microsecond=0)
        arrival_dt += timedelta(days=day_offset, hours=grace_hours)
        return int(arrival_dt.timestamp() * 1000)
    except Exception:
        return None


def _metadata_fallback_cleanup_at(metadata: dict) -> int | None:
    journey_date = str(metadata.get("journey_date", "")).strip()
    arrival_hint = (
        metadata.get("expected_arrival")
        or metadata.get("scheduled_arrival")
        or metadata.get("arrival_time")
    )
    if not journey_date or not arrival_hint:
        return None

    return _parse_group_cleanup_time(
        journey_date,
        str(arrival_hint),
        grace_hours=_FALLBACK_GROUP_RETENTION_HOURS,
    )


def _parse_train_clock(journey_date: str, raw_value: str | None) -> datetime | None:
    if not raw_value:
        return None

    value = str(raw_value).strip().upper()
    value = re.sub(r"\s+", " ", value)
    parsed_date = None
    for pattern in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            parsed_date = datetime.strptime(journey_date, pattern)
            break
        except ValueError:
            continue
    if parsed_date is None:
        return None

    explicit_offset = 0
    offset_match = re.search(r"\+(\d+)", value)
    if offset_match:
        explicit_offset = int(offset_match.group(1))
        value = re.sub(r"\s*\+\d+\s*", " ", value).strip()

    time_match = re.search(r"(\d{1,2}):(\d{2})", value)
    if not time_match:
        return None

    hour = int(time_match.group(1))
    minute = int(time_match.group(2))
    if hour > 23 or minute > 59:
        return None

    return parsed_date.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=explicit_offset)


def _normalize_station(value: str | None) -> str:
    if not value:
        return ""
    cleaned = re.sub(r"\([^)]*\)", " ", str(value).upper())
    cleaned = re.sub(r"[^A-Z0-9]+", " ", cleaned)
    return " ".join(cleaned.split())


def _stations_match(left: str | None, right: str | None) -> bool:
    left_norm = _normalize_station(left)
    right_norm = _normalize_station(right)
    if not left_norm or not right_norm:
        return False
    return left_norm == right_norm or left_norm in right_norm or right_norm in left_norm


def _recent_location_signal(group_id: str, freshness_minutes: int = 90) -> tuple[dict | None, bool]:
    location_data = get_location_data(group_id)
    if not location_data:
        return None, False

    updated_at = location_data.get("updated_at")
    if not updated_at:
        return location_data, False

    age_ms = int(time.time() * 1000) - int(updated_at)
    return location_data, age_ms <= freshness_minutes * 60 * 1000


def _compute_delay_minutes(journey_date: str, scheduled_arrival: str | None, expected_arrival: str | None) -> int:
    scheduled_dt = _parse_train_clock(journey_date, scheduled_arrival)
    expected_dt = _parse_train_clock(journey_date, expected_arrival)
    if not scheduled_dt or not expected_dt:
        return 0
    return max(0, int((expected_dt - scheduled_dt).total_seconds() // 60))


def _group_coach_ids(group_id: str) -> list[str]:
    group_data = fb_db.reference(f"train_groups/{group_id}").get() or {}
    return [
        key for key, value in group_data.items()
        if key.startswith("coach_") and isinstance(value, dict)
    ]


def _post_system_message(group_id: str, message_key: str, message_text: str, timestamp_ms: int | None = None):
    timestamp_ms = timestamp_ms or int(time.time() * 1000)
    for coach_id in _group_coach_ids(group_id):
        message_ref = fb_db.reference(f"train_groups/{group_id}/{coach_id}/requests/{message_key}")
        existing = message_ref.get() or {}
        message_ref.set({
            "passenger_id": "JourneyGuard Updates",
            "type": "SYSTEM",
            "message": message_text,
            "timestamp": existing.get("timestamp", timestamp_ms),
            "uid": "journeyguard-system",
            "active": True,
            "is_system": True,
        })


def _clear_group_user_journeys(group_id: str):
    try:
        user_journeys = fb_db.reference("user_journeys").get() or {}
    except Exception:
        return

    for uid, journey in user_journeys.items():
        if isinstance(journey, dict) and journey.get("group_id") == group_id:
            fb_db.reference(f"user_journeys/{uid}").delete()


def _delete_expired_group_if_needed(group_id: str, metadata: dict, now_ms: int | None = None) -> bool:
    now_ms = now_ms or int(time.time() * 1000)

    cleanup_at = _safe_int(metadata.get("cleanup_at"))
    if cleanup_at and now_ms >= cleanup_at:
        _delete_group_and_chats(group_id)
        return True

    fallback_cleanup_at = _safe_int(metadata.get("fallback_cleanup_at")) or _metadata_fallback_cleanup_at(metadata)
    if fallback_cleanup_at and now_ms >= fallback_cleanup_at:
        _delete_group_and_chats(group_id)
        return True

    return False


def _mark_group_arrived(group_id: str, metadata: dict, train_info: TrainInfoResponse | None = None):
    now_ms = int(time.time() * 1000)
    cleanup_at = now_ms + 60 * 60 * 1000

    current_station = None
    expected_arrival = None
    if train_info:
        current_station = train_info.current_station
        expected_arrival = train_info.expected_arrival or train_info.arrival

    fb_db.reference(f"train_groups/{group_id}/metadata").update({
        "status": "arrived",
        "arrived_at": now_ms,
        "cleanup_at": cleanup_at,
        "current_station": current_station,
        "expected_arrival": expected_arrival,
        "cleanup_reason": "destination_reached",
    })

    destination = metadata.get("to_station") or (train_info.to_station if train_info else None) or "the final station"
    _post_system_message(
        group_id,
        "system_arrival_notice",
        f"Train has reached {destination}. This group will be deleted automatically in 1 hour.",
        timestamp_ms=now_ms,
    )


def _train_reached_destination(group_id: str, metadata: dict, train_info: TrainInfoResponse | None) -> bool:
    if not train_info:
        return False

    destination = metadata.get("to_station") or train_info.to_station
    status_text = " ".join(
        part for part in [
            train_info.current_status,
            train_info.api_message,
        ] if part
    ).lower()

    if _stations_match(train_info.current_station, destination):
        return True

    if any(token in status_text for token in ["reached destination", "terminated", "arrived", "destination"]):
        return True

    location_data, location_recent = _recent_location_signal(group_id)
    expected_arrival_dt = _parse_train_clock(metadata.get("journey_date") or train_info.journey_date, train_info.expected_arrival or train_info.arrival)
    if expected_arrival_dt and datetime.now() >= expected_arrival_dt + timedelta(minutes=15):
        if not location_data or location_data.get("expired") or not location_recent:
            return True

    return False


def _announce_delay_milestones(group_id: str, metadata: dict, train_info: TrainInfoResponse):
    delay_minutes = _compute_delay_minutes(
        metadata.get("journey_date") or train_info.journey_date,
        metadata.get("scheduled_arrival") or metadata.get("arrival_time"),
        train_info.expected_arrival or train_info.arrival,
    )
    if delay_minutes < 60:
        return

    metadata_ref = fb_db.reference(f"train_groups/{group_id}/metadata")
    thresholds = [(1, 60), (2, 120), (3, 180)]
    hours = delay_minutes // 60
    mins = delay_minutes % 60
    delay_label = f"{hours} hour{'s' if hours != 1 else ''}"
    if mins:
        delay_label = f"{delay_label} {mins} min"

    for threshold_hours, threshold_minutes in thresholds:
        key = f"delay_{threshold_hours}h_announced"
        if delay_minutes >= threshold_minutes and not metadata.get(key):
            _post_system_message(
                group_id,
                f"system_delay_{threshold_hours}h",
                (
                    f"Train is currently running about {delay_label} late. "
                    f"JourneyGuard will keep this group active until 1 hour after the train reaches the last station."
                ),
            )
            metadata_ref.update({
                key: True,
                "delay_minutes": delay_minutes,
                "expected_arrival": train_info.expected_arrival or train_info.arrival,
                "current_station": train_info.current_station,
                "current_status": train_info.current_status,
            })


def _run_group_monitor(group_id: str, stop_event: threading.Event):
    while not stop_event.is_set():
        try:
            metadata = fb_db.reference(f"train_groups/{group_id}/metadata").get() or {}
            if not metadata:
                break

            now_ms = int(time.time() * 1000)
            if _delete_expired_group_if_needed(group_id, metadata, now_ms):
                break

            status = metadata.get("status", "active")

            train_number = str(metadata.get("train_number", "")).strip()
            journey_date = str(metadata.get("journey_date", "")).strip()
            if not train_number or not journey_date:
                stop_event.wait(600)
                continue

            train_info = None
            try:
                import asyncio
                train_info = asyncio.run(get_train_info(train_number, journey_date, refresh=True))
            except Exception:
                train_info = None

            if train_info:
                fallback_cleanup_at = _parse_group_cleanup_time(
                    metadata.get("journey_date") or train_info.journey_date,
                    train_info.expected_arrival or train_info.arrival,
                    grace_hours=_FALLBACK_GROUP_RETENTION_HOURS,
                )
                live_metadata = {
                    "to_station": train_info.to_station,
                    "from_station": train_info.from_station,
                    "scheduled_arrival": train_info.arrival,
                    "expected_arrival": train_info.expected_arrival or train_info.arrival,
                    "current_station": train_info.current_station,
                    "current_status": train_info.current_status,
                    "last_train_poll_at": now_ms,
                }
                if fallback_cleanup_at:
                    live_metadata["fallback_cleanup_at"] = fallback_cleanup_at
                fb_db.reference(f"train_groups/{group_id}/metadata").update(live_metadata)
                metadata = {**metadata, **live_metadata}

                if status != "arrived":
                    _announce_delay_milestones(group_id, metadata, train_info)

                if status != "arrived" and _train_reached_destination(group_id, metadata, train_info):
                    _mark_group_arrived(group_id, metadata, train_info)

            stop_event.wait(600)
        except Exception as exc:
            print(f"[GROUP_MONITOR] Error monitoring {group_id}: {exc}")
            stop_event.wait(180)

    with _group_monitor_lock:
        _group_monitor_events.pop(group_id, None)


def _ensure_group_monitor(group_id: str):
    with _group_monitor_lock:
        existing = _group_monitor_events.get(group_id)
        if existing and not existing.is_set():
            return

        stop_event = threading.Event()
        _group_monitor_events[group_id] = stop_event
        thread = threading.Thread(
            target=_run_group_monitor,
            args=(group_id, stop_event),
            daemon=True,
            name=f"journeyguard-monitor-{group_id}",
        )
        thread.start()


def _stop_group_monitor(group_id: str):
    with _group_monitor_lock:
        event = _group_monitor_events.get(group_id)
        if event:
            event.set()


def resume_active_group_monitors():
    try:
        groups = fb_db.reference("train_groups").get() or {}
    except Exception as exc:
        print(f"[GROUP_MONITOR] Could not resume active groups: {exc}")
        return

    now_ms = int(time.time() * 1000)
    for group_id, group_data in groups.items():
        if not isinstance(group_data, dict):
            continue
        metadata = group_data.get("metadata")
        if not isinstance(metadata, dict):
            continue
        if _delete_expired_group_if_needed(group_id, metadata, now_ms):
            continue
        _ensure_group_monitor(group_id)


@router.get("/train-info/{train_number}", response_model=TrainInfoResponse)
async def fetch_train_info(
    train_number: str,
    journey_date: str,
    refresh: bool = False,
    _: dict = Depends(get_current_user),
):
    if not train_number.strip():
        raise HTTPException(status_code=422, detail="Train number is required")
    if not journey_date.strip():
        raise HTTPException(status_code=422, detail="Journey date is required")

    try:
        return await get_train_info(train_number.strip(), journey_date.strip(), refresh=refresh)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not fetch train details: {str(exc)}")


@router.get("/current")
async def get_current_journey(user: dict = Depends(get_current_user)):
    uid = user["uid"]
    journey = _current_user_journey(uid)
    if not journey:
        return {"journey": None}

    group_id = journey.get("group_id")
    coach_id = journey.get("coach_id")
    if not group_id or not coach_id:
        return {"journey": None}

    membership = fb_db.reference(f"train_groups/{group_id}/{coach_id}/{uid}").get()
    if not membership:
        fb_db.reference(f"user_journeys/{uid}").delete()
        return {"journey": None}

    return {
        "journey": {
            **journey,
            "group_id": group_id,
            "coach_id": coach_id,
            "seat": journey.get("berth", ""),
        }
    }


def _delete_group_and_chats(group_id: str):
    """Delete group and all associated chats after journey completion"""
    try:
        _stop_group_monitor(group_id)
        # Expire any linked location session before removing group metadata.
        expire_location_session(group_id)
        _clear_group_user_journeys(group_id)

        # Delete the entire group
        fb_db.reference(f"train_groups/{group_id}").delete()
        
        # Delete all chat messages for this group
        fb_db.reference(f"group_chats/{group_id}").delete()
        
        print(f"✓ Deleted group {group_id} and all its chats")
    except Exception as e:
        print(f"✗ Error deleting group {group_id}: {str(e)}")


@router.post("/join")
async def join_journey(body: JoinJourneyRequest, user: dict = Depends(get_current_user), background_tasks: BackgroundTasks = None):
    uid        = user["uid"]
    email      = user.get("email", "")
    group_id   = _group_id(body.train_number, body.journey_date)
    coach_id   = _coach_id(body.coach)
    passenger_id = f"Passenger {body.coach}-{body.berth}"
    fallback_cleanup_at = _parse_group_cleanup_time(
        body.journey_date,
        body.arrival_time,
        grace_hours=_FALLBACK_GROUP_RETENTION_HOURS,
    )

    # Remove from any previous group
    existing = fb_db.reference(f"user_journeys/{uid}").get()
    if existing:
        old_group = existing.get("group_id")
        old_coach = existing.get("coach_id")
        if old_group and old_coach:
            fb_db.reference(f"train_groups/{old_group}/{old_coach}/{uid}").delete()

    # Join new group — anonymous record only
    fb_db.reference(f"train_groups/{group_id}/{coach_id}/{uid}").set({
        "passenger_id": passenger_id,
        "coach"       : body.coach,
        "berth"       : body.berth,
        "joined_at"   : int(time.time() * 1000),
    })

    # Store journey mapping for the user (private node)
    join_time = int(time.time() * 1000)
    fb_db.reference(f"user_journeys/{uid}").set({
        "group_id"    : group_id,
        "coach_id"    : coach_id,
        "passenger_id": passenger_id,
        "train_number": body.train_number,
        "journey_date": body.journey_date,
        "coach"       : body.coach,
        "berth"       : body.berth,
        "started_at"  : join_time,
        "arrival_time": body.arrival_time,
        "cleanup_at"  : None,
    })

    # Track group metadata for cleanup scheduling
    metadata_ref = fb_db.reference(f"train_groups/{group_id}/metadata")
    metadata = metadata_ref.get() or {}

    if not metadata:
        # First person to join - initialize group metadata
        metadata_ref.set({
            "created_at": join_time,
            "train_number": body.train_number,
            "journey_date": body.journey_date,
            "arrival_time": body.arrival_time,
            "scheduled_arrival": body.arrival_time,
            "cleanup_at": None,
            "fallback_cleanup_at": fallback_cleanup_at,
            "status": "active",
        })
    else:
        metadata_ref.update({
            "train_number": body.train_number,
            "journey_date": body.journey_date,
            "arrival_time": body.arrival_time or metadata.get("arrival_time"),
            "scheduled_arrival": metadata.get("scheduled_arrival") or body.arrival_time,
            "cleanup_at": metadata.get("cleanup_at"),
            "fallback_cleanup_at": metadata.get("fallback_cleanup_at") or fallback_cleanup_at,
            "status": metadata.get("status", "active"),
        })

    _ensure_group_monitor(group_id)

    # Send welcome email (non-blocking – fire and forget)
    try:
        send_journey_start_email(email, passenger_id, body.train_number, body.coach, body.journey_date)
    except Exception:
        pass

    return {
        "group_id"    : group_id,
        "coach_id"    : coach_id,
        "passenger_id": passenger_id,
        "message"     : "Joined journey group",
    }


@router.post("/{journey_id}/leave")
async def leave_journey(journey_id: str, user: dict = Depends(get_current_user)):
    uid   = user["uid"]
    email = user.get("email", "")

    journey = fb_db.reference(f"user_journeys/{uid}").get()
    if not journey:
        raise HTTPException(status_code=404, detail="No active journey")

    coach_id = journey.get("coach_id")
    train    = journey.get("train_number", "")

    # Remove from group
    fb_db.reference(f"train_groups/{journey_id}/{coach_id}/{uid}").delete()

    remaining_nodes = fb_db.reference(f"train_groups/{journey_id}/{coach_id}").get() or {}
    remaining_passengers = [
        info for key, info in remaining_nodes.items()
        if key != "requests" and isinstance(info, dict) and info.get("passenger_id")
    ]
    if not remaining_passengers:
        _delete_group_and_chats(journey_id)

    # Clear user journey
    fb_db.reference(f"user_journeys/{uid}").delete()

    # Expire personal location sharing for the journey if it was active.
    expire_location_session(journey_id)

    # Send end email
    try:
        passenger_id = journey.get("passenger_id", "Traveler")
        send_journey_end_email(email, passenger_id, train)
    except Exception:
        pass

    return {"message": "Left journey group. Location link expired."}


@router.post("/{journey_id}/complete")
async def complete_journey(journey_id: str, user: dict = Depends(get_current_user)):
    """Mark journey as completed and schedule group cleanup after 1 hour"""
    uid = user["uid"]
    
    journey = fb_db.reference(f"user_journeys/{uid}").get()
    if not journey:
        raise HTTPException(status_code=404, detail="No active journey")
    
    group_id = journey.get("group_id")
    coach_id = journey.get("coach_id")
    train = journey.get("train_number", "")
    email = user.get("email", "")
    
    # Mark journey as completed
    fb_db.reference(f"user_journeys/{uid}").update({
        "status": "completed",
        "completed_at": int(time.time() * 1000),
    })
    
    completion_time = int(time.time() * 1000)
    fb_db.reference(f"train_groups/{group_id}/metadata").update({
        "status": "arrived",
        "completed_at": completion_time,
        "arrived_at": completion_time,
        "cleanup_at": completion_time + 60 * 60 * 1000,
        "cleanup_reason": "manual_complete",
    })
    _post_system_message(
        group_id,
        "system_arrival_notice",
        "Journey marked complete. This group will be deleted automatically in 1 hour.",
        timestamp_ms=completion_time,
    )
    
    # Send completion email
    try:
        passenger_id = journey.get("passenger_id", "Traveler")
        send_journey_end_email(email, passenger_id, train)
    except Exception:
        pass
    
    return {
        "message": "Journey marked as completed. Group will be deleted in 1 hour.",
        "group_id": group_id,
    }


@router.get("/{journey_id}/coach/{coach_id}")
async def get_coach_group(journey_id: str, coach_id: str, user: dict = Depends(get_current_user)):
    journey = _current_user_journey(user["uid"])
    if not journey:
        raise HTTPException(status_code=404, detail="No active journey")
    if journey.get("group_id") != journey_id or journey.get("coach_id") != coach_id:
        raise HTTPException(status_code=403, detail="Not your coach group")

    _ensure_group_monitor(journey_id)
    data = fb_db.reference(f"train_groups/{journey_id}/{coach_id}").get() or {}
    passengers = [
        {"uid": uid, **info}
        for uid, info in data.items()
        if uid != "requests" and isinstance(info, dict)
    ]
    return {"journey_id": journey_id, "coach_id": coach_id, "passengers": passengers}
