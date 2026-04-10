import time
from fastapi import APIRouter, Depends
from firebase_admin import db as fb_db

from dependencies import get_current_user
from models.schemas import (
    ProtectionCommandRequest,
    ProtectionLocationUpdateRequest,
    ProtectionStateResponse,
)

router = APIRouter()


def _protection_ref(uid: str):
    return fb_db.reference(f"protection_sessions/{uid}")


def _default_state(user: dict) -> dict:
    return {
        "active": False,
        "location_enabled": False,
        "email": user.get("email"),
        "updated_at": 0,
        "started_at": 0,
        "lat": None,
        "lng": None,
        "accuracy": None,
        "source": "remote-dashboard",
        "ring_requested_at": 0,
        "ring_stop_requested_at": 0,
    }


def _load_state(user: dict) -> dict:
    uid = user["uid"]
    data = _protection_ref(uid).get() or {}
    return {**_default_state(user), **data}


@router.get("/state", response_model=ProtectionStateResponse)
async def get_protection_state(user: dict = Depends(get_current_user)):
    return ProtectionStateResponse(**_load_state(user))


@router.post("/start", response_model=ProtectionStateResponse)
async def start_protection(
    body: ProtectionCommandRequest,
    user: dict = Depends(get_current_user),
):
    uid = user["uid"]
    now = int(time.time() * 1000)
    current = _load_state(user)

    updates = {
        "active": True,
        "location_enabled": body.location_enabled,
        "email": user.get("email"),
        "updated_at": now,
        "source": body.source or "remote-dashboard",
    }
    if not current.get("started_at"):
        updates["started_at"] = now

    _protection_ref(uid).update(updates)
    return ProtectionStateResponse(**_load_state(user))


@router.post("/ring/start", response_model=ProtectionStateResponse)
async def start_ring(
    body: ProtectionCommandRequest | None = None,
    user: dict = Depends(get_current_user),
):
    uid = user["uid"]
    now = int(time.time() * 1000)
    _protection_ref(uid).update(
        {
            "updated_at": now,
            "source": (body.source if body else None) or "remote-dashboard",
            "ring_requested_at": now,
        }
    )
    return ProtectionStateResponse(**_load_state(user))


@router.post("/ring/stop", response_model=ProtectionStateResponse)
async def stop_ring(
    body: ProtectionCommandRequest | None = None,
    user: dict = Depends(get_current_user),
):
    uid = user["uid"]
    now = int(time.time() * 1000)
    _protection_ref(uid).update(
        {
            "updated_at": now,
            "source": (body.source if body else None) or "remote-dashboard",
            "ring_stop_requested_at": now,
        }
    )
    return ProtectionStateResponse(**_load_state(user))


@router.post("/stop", response_model=ProtectionStateResponse)
async def stop_protection(
    body: ProtectionCommandRequest | None = None,
    user: dict = Depends(get_current_user),
):
    uid = user["uid"]
    now = int(time.time() * 1000)
    _protection_ref(uid).update(
        {
            "active": False,
            "updated_at": now,
            "source": (body.source if body else None) or "remote-dashboard",
        }
    )
    return ProtectionStateResponse(**_load_state(user))


@router.post("/location", response_model=ProtectionStateResponse)
async def update_protection_location(
    body: ProtectionLocationUpdateRequest,
    user: dict = Depends(get_current_user),
):
    uid = user["uid"]
    now = int(time.time() * 1000)
    current = _load_state(user)

    updates = {
        "active": current.get("active", False),
        "location_enabled": body.location_enabled,
        "email": user.get("email"),
        "updated_at": now,
        "lat": body.lat,
        "lng": body.lng,
        "accuracy": body.accuracy,
        "source": body.source or current.get("source") or "remote-dashboard",
    }

    if current.get("started_at"):
        updates["started_at"] = current["started_at"]

    _protection_ref(uid).update(updates)
    return ProtectionStateResponse(**_load_state(user))
