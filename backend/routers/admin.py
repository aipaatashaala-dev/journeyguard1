"""
Admin router for JourneyGuard backend
- OTP-based admin authentication
- Admin-only endpoints for system management
"""
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from firebase_admin import auth as fb_auth, db as fb_db

from models.schemas import (
    AdminAuthResponse,
    AdminOtpRequest,
    AdminOtpVerifyRequest,
    JourneyResponse,
    LocationResponse,
    RequestResponse,
    UserResponse,
)
from services.email_service import send_admin_otp_email

router = APIRouter(prefix="/admin", tags=["Admin"])
logger = logging.getLogger(__name__)

ADMIN_EMAIL = os.getenv("ADMIN_OTP_EMAIL", "journeyguard@zohomail.in").strip().lower()
ADMIN_OTP_SECRET = os.getenv("ADMIN_OTP_SECRET", os.getenv("LOCATION_TOKEN_SECRET", "journeyguard-admin-secret"))
OTP_TTL_SECONDS = int(os.getenv("ADMIN_OTP_TTL_SECONDS", "600"))
SESSION_TTL_SECONDS = int(os.getenv("ADMIN_SESSION_TTL_SECONDS", str(12 * 3600)))


def _otp_ref(email: str):
    safe_key = email.replace(".", ",")
    return fb_db.reference(f"admin_auth/otp_requests/{safe_key}")


def _sign_text(value: str) -> str:
    return hmac.new(ADMIN_OTP_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


def _issue_admin_token(email: str) -> AdminAuthResponse:
    expires_at = int(time.time()) + SESSION_TTL_SECONDS
    payload = {
        "email": email,
        "exp": expires_at,
        "type": "admin",
    }
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    signature = _sign_text(encoded)
    return AdminAuthResponse(
        access_token=f"{encoded}.{signature}",
        admin_email=email,
        expires_at=expires_at,
    )


def _verify_admin_token(token: str) -> dict:
    try:
        encoded, signature = token.rsplit(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token") from exc

    if not hmac.compare_digest(signature, _sign_text(encoded)):
        raise HTTPException(status_code=401, detail="Invalid admin token signature")

    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode())
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid admin token payload") from exc

    if payload.get("type") != "admin":
        raise HTTPException(status_code=401, detail="Invalid admin token type")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Admin session expired")
    if payload.get("email", "").strip().lower() != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access denied")
    return payload


def require_admin(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin bearer token")
    return _verify_admin_token(authorization.split(" ", 1)[1].strip())


def _collect_group_members(group_data: dict) -> list[dict]:
    members: dict[str, dict] = {}

    members_node = group_data.get("members")
    if isinstance(members_node, dict):
        for uid, value in members_node.items():
            if isinstance(value, dict) and value.get("passenger_id"):
                members[uid] = {"uid": uid, **value}

    for coach_id, coach_data in group_data.items():
        if not coach_id.startswith("coach_") or not isinstance(coach_data, dict):
            continue
        for uid, value in coach_data.items():
            if uid == "requests" or uid in members:
                continue
            if isinstance(value, dict) and value.get("passenger_id"):
                members[uid] = {"uid": uid, **value}

    return list(members.values())


def _coach_count(group_data: dict, members: list[dict]) -> int:
    coaches = {
        str(member.get("coach") or "").strip().upper()
        for member in members
        if str(member.get("coach") or "").strip()
    }
    if coaches:
        return len(coaches)
    return sum(
        1
        for coach_id, coach_data in group_data.items()
        if coach_id.startswith("coach_") and isinstance(coach_data, dict)
    )


def _collect_group_requests(group_id: str, group_data: dict) -> list[tuple[str, dict, str]]:
    requests: list[tuple[str, dict, str]] = []

    root_requests = group_data.get("requests")
    if isinstance(root_requests, dict):
        for req_id, req_data in root_requests.items():
            if isinstance(req_data, dict):
                requests.append((req_id, req_data, f"train_groups/{group_id}/requests/{req_id}"))

    for coach_id, coach_data in group_data.items():
        if not isinstance(coach_data, dict):
            continue
        if coach_id.startswith("coach_"):
            coach_requests = coach_data.get("requests")
            if not isinstance(coach_requests, dict):
                continue
            for req_id, req_data in coach_requests.items():
                if isinstance(req_data, dict):
                    requests.append((req_id, req_data, f"train_groups/{group_id}/{coach_id}/requests/{req_id}"))
        elif coach_id == "emergency_alerts":
            for req_id, req_data in coach_data.items():
                if isinstance(req_data, dict):
                    requests.append((req_id, req_data, f"train_groups/{group_id}/emergency_alerts/{req_id}"))

    return requests


@router.post("/request-otp")
async def request_admin_otp(body: AdminOtpRequest):
    email = body.email.strip().lower()
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="This email is not authorized for admin OTP")

    otp = f"{secrets.randbelow(1000000):06d}"
    now = int(time.time())
    payload = {
        "otp_hash": _sign_text(f"{email}:{otp}"),
        "requested_at": now,
        "expires_at": now + OTP_TTL_SECONDS,
        "attempts": 0,
    }
    _otp_ref(email).set(payload)

    sent = send_admin_otp_email(to_email=ADMIN_EMAIL, otp=otp, expires_minutes=max(1, OTP_TTL_SECONDS // 60))
    if not sent:
        raise HTTPException(status_code=500, detail="Could not send OTP email")

    return {"message": f"OTP sent to {ADMIN_EMAIL}", "expires_in": OTP_TTL_SECONDS}


@router.post("/verify-otp", response_model=AdminAuthResponse)
async def verify_admin_otp(body: AdminOtpVerifyRequest):
    email = body.email.strip().lower()
    otp = body.otp.strip()

    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="This email is not authorized for admin OTP")

    otp_data = _otp_ref(email).get() or {}
    if not otp_data:
        raise HTTPException(status_code=404, detail="No OTP request found. Request a new OTP.")

    if int(otp_data.get("expires_at", 0)) < int(time.time()):
        _otp_ref(email).delete()
        raise HTTPException(status_code=410, detail="OTP has expired. Request a new one.")

    attempts = int(otp_data.get("attempts", 0)) + 1
    if attempts > 5:
        _otp_ref(email).delete()
        raise HTTPException(status_code=429, detail="Too many invalid OTP attempts")

    expected_hash = otp_data.get("otp_hash", "")
    if not hmac.compare_digest(expected_hash, _sign_text(f"{email}:{otp}")):
        _otp_ref(email).update({"attempts": attempts})
        raise HTTPException(status_code=401, detail="Invalid OTP")

    _otp_ref(email).delete()
    return _issue_admin_token(email)


@router.get("/session")
async def get_admin_session(admin: dict = Depends(require_admin)):
    return {"admin_email": admin.get("email"), "expires_at": admin.get("exp")}


@router.get("/users", response_model=list[UserResponse])
async def get_all_users(_: dict = Depends(require_admin)):
    try:
        users_ref = fb_db.reference("users")
        users_data = users_ref.get() or {}
        user_journeys = fb_db.reference("user_journeys").get() or {}
        return [
            UserResponse(
                uid=uid,
                email=data.get("email", ""),
                mobile_number=data.get("mobile_number", ""),
                created_at=data.get("created_at", 0),
                active_group_id=(user_journeys.get(uid) or {}).get("group_id", ""),
                active_coach_id=(user_journeys.get(uid) or {}).get("coach_id", ""),
                passenger_id=(user_journeys.get(uid) or {}).get("passenger_id", ""),
            )
            for uid, data in users_data.items()
        ]
    except Exception as exc:
        logger.error("Admin get users error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch users")


@router.delete("/users/{uid}")
async def delete_user(uid: str, _: dict = Depends(require_admin)):
    try:
        fb_auth.delete_user(uid)
        fb_db.reference(f"users/{uid}").delete()
        fb_db.reference(f"user_journeys/{uid}").delete()
        groups = fb_db.reference("train_groups").get() or {}
        for group_id, group_data in groups.items():
            if not isinstance(group_data, dict):
                continue
            fb_db.reference(f"train_groups/{group_id}/members/{uid}").delete()
            for coach_id, coach_data in group_data.items():
                if coach_id == "metadata" or not isinstance(coach_data, dict):
                    continue
                if uid in coach_data:
                    fb_db.reference(f"train_groups/{group_id}/{coach_id}/{uid}").delete()
        return {"message": "User deleted successfully"}
    except Exception as exc:
        logger.error("Admin delete user error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete user")


@router.get("/journeys", response_model=list[JourneyResponse])
async def get_all_journeys(_: dict = Depends(require_admin)):
    try:
        journeys_data = fb_db.reference("train_groups").get() or {}
        journeys = []
        for group_id, group_data in journeys_data.items():
            if not isinstance(group_data, dict) or "_" not in group_id:
                continue
            train_num, date = group_id.split("_", 1)
            metadata = group_data.get("metadata", {}) if isinstance(group_data.get("metadata"), dict) else {}
            passenger_count = 0
            coach_count = 0
            for coach_id, coach_data in group_data.items():
                if coach_id == "metadata" or not isinstance(coach_data, dict):
                    continue
                coach_count += 1
                passenger_count += sum(
                    1 for key, value in coach_data.items()
                    if key != "requests" and isinstance(value, dict) and value.get("passenger_id")
                )
            journeys.append(
                JourneyResponse(
                    group_id=group_id,
                    train_number=train_num,
                    date=date,
                    passenger_count=passenger_count,
                    coach_count=coach_count,
                    status=metadata.get("status", "active"),
                    cleanup_at=metadata.get("cleanup_at"),
                )
            )
        return journeys
    except Exception as exc:
        logger.error("Admin get journeys error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch journeys")


@router.delete("/journeys/{group_id}")
async def delete_journey_group(group_id: str, _: dict = Depends(require_admin)):
    try:
        group_data = fb_db.reference(f"train_groups/{group_id}").get()
        if not group_data:
            raise HTTPException(status_code=404, detail="Journey group not found")

        user_journeys = fb_db.reference("user_journeys").get() or {}
        for uid, journey in user_journeys.items():
            if isinstance(journey, dict) and journey.get("group_id") == group_id:
                fb_db.reference(f"user_journeys/{uid}").delete()

        fb_db.reference(f"locations/{group_id}").delete()
        fb_db.reference(f"group_chats/{group_id}").delete()
        fb_db.reference(f"train_groups/{group_id}").delete()
        return {"message": "Journey group deleted successfully", "group_id": group_id}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Admin delete journey error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete journey group")


@router.get("/locations", response_model=list[LocationResponse])
async def get_all_locations(_: dict = Depends(require_admin)):
    try:
        locations_data = fb_db.reference("locations").get() or {}
        locations = []
        for loc_id, loc_data in locations_data.items():
            if loc_data.get("active"):
                coach = loc_data.get("coach")
                if not coach:
                    passenger_id = loc_data.get("passenger_id", "")
                    if "-" in passenger_id:
                        coach = passenger_id.replace("Passenger ", "").split("-", 1)[0]
                locations.append(
                    LocationResponse(
                        id=loc_id,
                        passenger_id=loc_data.get("passenger_id", ""),
                        train_number=loc_data.get("train_number", ""),
                        coach=coach or "",
                        lat=loc_data.get("lat"),
                        lng=loc_data.get("lng"),
                        accuracy=loc_data.get("accuracy"),
                        updated_at=loc_data.get("updated_at", 0),
                    )
                )
        return locations
    except Exception as exc:
        logger.error("Admin get locations error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch locations")


@router.delete("/locations/{location_id}")
async def stop_location_tracking(location_id: str, _: dict = Depends(require_admin)):
    try:
        fb_db.reference(f"locations/{location_id}").update({"active": False, "expired": True})
        return {"message": "Location tracking stopped"}
    except Exception as exc:
        logger.error("Admin stop location error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to stop tracking")


@router.get("/requests", response_model=list[RequestResponse])
async def get_all_requests(_: dict = Depends(require_admin)):
    try:
        requests = []
        groups_data = fb_db.reference("train_groups").get() or {}
        for group_id, group_data in groups_data.items():
            if not isinstance(group_data, dict):
                continue
            for coach_id, coach_data in group_data.items():
                if not isinstance(coach_data, dict):
                    continue
                coach_requests = coach_data.get("requests", {}) if coach_id.startswith("coach_") else {}
                if coach_id == "emergency_alerts":
                    coach_requests = coach_data
                for req_id, req_data in coach_requests.items():
                    if not isinstance(req_data, dict):
                        continue
                    requests.append(
                        RequestResponse(
                            id=req_id,
                            group_id=group_id,
                            passenger_id=req_data.get("passenger_id", ""),
                            type=req_data.get("type", ""),
                            timestamp=req_data.get("timestamp", 0),
                        )
                    )
        requests.sort(key=lambda item: item.timestamp, reverse=True)
        return requests
    except Exception as exc:
        logger.error("Admin get requests error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch requests")


@router.delete("/requests/{group_id}/{request_id}")
async def resolve_request(group_id: str, request_id: str, _: dict = Depends(require_admin)):
    try:
        group_data = fb_db.reference(f"train_groups/{group_id}").get() or {}
        removed = False
        for coach_id, coach_data in group_data.items():
            if not isinstance(coach_data, dict):
                continue
            if coach_id.startswith("coach_") and isinstance(coach_data.get("requests"), dict) and request_id in coach_data["requests"]:
                fb_db.reference(f"train_groups/{group_id}/{coach_id}/requests/{request_id}").delete()
                removed = True
            if coach_id == "emergency_alerts" and request_id in coach_data:
                fb_db.reference(f"train_groups/{group_id}/emergency_alerts/{request_id}").delete()
                removed = True
        if not removed:
            raise HTTPException(status_code=404, detail="Request not found")
        return {"message": "Request resolved"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Admin resolve request error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to resolve request")


@router.get("/stats")
async def get_system_stats(_: dict = Depends(require_admin)):
    try:
        users_count = len(fb_db.reference("users").get() or {})
        groups_data = fb_db.reference("train_groups").get() or {}
        journeys_count = len(groups_data)
        locations_data = fb_db.reference("locations").get() or {}
        active_locations = sum(1 for loc in locations_data.values() if isinstance(loc, dict) and loc.get("active"))

        requests_count = 0
        for group_data in groups_data.values():
            if not isinstance(group_data, dict):
                continue
            for coach_id, coach_data in group_data.items():
                if not isinstance(coach_data, dict):
                    continue
                if coach_id.startswith("coach_"):
                    requests_count += len(coach_data.get("requests", {}) or {})
                elif coach_id == "emergency_alerts":
                    requests_count += len(coach_data or {})

        return {
            "total_users": users_count,
            "active_journeys": journeys_count,
            "active_locations": active_locations,
            "pending_requests": requests_count,
            "system_health": "Good",
        }
    except Exception as exc:
        logger.error("Admin stats error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch stats")
