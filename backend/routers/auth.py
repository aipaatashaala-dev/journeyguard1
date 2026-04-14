import base64
import hashlib
import hmac
import json
import os
import secrets

from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import auth as fb_auth, db as fb_db
import time
from models.schemas import (
    RegisterRequest,
    LoginRequest,
    UpdateUserProfileRequest,
    SetPasswordRequest,
    PasswordResetOtpRequest,
    PasswordResetOtpVerifyRequest,
    PasswordResetCompleteRequest,
)
from dependencies import get_current_user
from services.email_service import send_password_reset_otp_email, get_last_email_error

router = APIRouter()
PASSWORD_RESET_OTP_SECRET = os.getenv("PASSWORD_RESET_OTP_SECRET", os.getenv("ADMIN_OTP_SECRET", os.getenv("LOCATION_TOKEN_SECRET", "journeyguard-reset-secret")))
PASSWORD_RESET_OTP_TTL_SECONDS = int(os.getenv("PASSWORD_RESET_OTP_TTL_SECONDS", "600"))
PASSWORD_RESET_SESSION_TTL_SECONDS = int(os.getenv("PASSWORD_RESET_SESSION_TTL_SECONDS", "900"))


def _normalize_display_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(str(value).strip().split())[:40]
    return normalized or None


def _password_reset_ref(email: str):
    safe_key = email.replace(".", ",")
    return fb_db.reference(f"auth/password_reset/{safe_key}")


def _sign_password_reset_text(value: str) -> str:
    return hmac.new(PASSWORD_RESET_OTP_SECRET.encode(), value.encode(), hashlib.sha256).hexdigest()


def _issue_password_reset_token(email: str) -> dict:
    expires_at = int(time.time()) + PASSWORD_RESET_SESSION_TTL_SECONDS
    payload = {
        "email": email,
        "exp": expires_at,
        "type": "password-reset",
    }
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    signature = _sign_password_reset_text(encoded)
    return {
        "reset_token": f"{encoded}.{signature}",
        "expires_at": expires_at,
    }


def _verify_password_reset_token(email: str, token: str):
    try:
        encoded, signature = token.rsplit(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid reset token") from exc

    if not hmac.compare_digest(signature, _sign_password_reset_text(encoded)):
        raise HTTPException(status_code=401, detail="Invalid reset token signature")

    try:
        payload = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode())
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid reset token payload") from exc

    if payload.get("type") != "password-reset":
        raise HTTPException(status_code=401, detail="Invalid reset token type")
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Password reset session expired")
    if payload.get("email", "").strip().lower() != email.strip().lower():
        raise HTTPException(status_code=403, detail="Reset token email does not match")
    return payload


def _user_by_email(email: str):
    try:
        return fb_auth.get_user_by_email(email)
    except fb_auth.UserNotFoundError:
        return None


def _sync_active_journey_profile(uid: str, display_name: str | None = None):
    if not display_name:
        return

    journey_ref = fb_db.reference(f"user_journeys/{uid}")
    journey = journey_ref.get() or {}
    if not isinstance(journey, dict):
        return

    journey_ref.update({
        "display_name": display_name,
    })

    group_id = journey.get("group_id")
    if not group_id:
        return

    member_ref = fb_db.reference(f"train_groups/{group_id}/members/{uid}")
    member = member_ref.get() or {}
    if isinstance(member, dict) and member.get("passenger_id"):
        member_ref.update({
            "display_name": display_name,
        })


@router.post("/register")
async def register(body: RegisterRequest):
    """
    Creates a Firebase Auth user and stores profile in Realtime DB.
    Password hashing is handled entirely by Firebase Auth.
    """
    try:
        user = fb_auth.create_user(
            email=body.email,
            password=body.password,
            display_name=body.email.split("@")[0],
        )
    except fb_auth.EmailAlreadyExistsError:
        raise HTTPException(status_code=409, detail="Email already registered")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Store non-sensitive profile
    fb_db.reference(f"users/{user.uid}").set({
        "email"        : body.email,
        "display_name" : body.email.split("@")[0],
        "created_at"   : int(time.time() * 1000),
    })

    return {"uid": user.uid, "email": user.email, "message": "Account created"}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user's profile from Firebase DB."""
    uid  = current_user["uid"]
    data = fb_db.reference(f"users/{uid}").get() or {}
    return {"uid": uid, "email": current_user.get("email"), **data}


@router.put("/profile")
async def update_profile(body: UpdateUserProfileRequest, current_user: dict = Depends(get_current_user)):
    """Update user profile information."""
    uid = current_user["uid"]
    
    # Build update data - only include non-None fields
    updates = {}
    if body.email:
        updates["email"] = body.email
    display_name = _normalize_display_name(body.display_name)
    if display_name:
        updates["display_name"] = display_name
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = int(time.time() * 1000)
    
    try:
        # Update Firebase DB
        fb_db.reference(f"users/{uid}").update(updates)
        
        # If email changed, also update Firebase Auth
        if body.email and body.email != current_user.get("email"):
            fb_auth.update_user(uid, email=body.email)
        if display_name:
            fb_auth.update_user(uid, display_name=display_name)
            _sync_active_journey_profile(uid, display_name)
        
        return {
            "message": "Profile updated successfully",
            "updated_fields": list(updates.keys()),
            **updates
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update profile: {str(e)}")


@router.put("/set-password")
async def set_password(body: SetPasswordRequest, current_user: dict = Depends(get_current_user)):
    """Set password for users who registered via Google."""
    uid = current_user["uid"]
    
    try:
        # Update password in Firebase Auth
        fb_auth.update_user(uid, password=body.password)
        
        # Mark that password is set in DB
        fb_db.reference(f"users/{uid}").update({
            "password_set": True,
            "updated_at": int(time.time() * 1000),
        })
        
        return {"message": "Password set successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to set password: {str(e)}")


@router.post("/forgot-password/request-otp")
async def request_password_reset_otp(body: PasswordResetOtpRequest):
    email = body.email.strip().lower()
    user = _user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="No account found for this email")

    otp = f"{secrets.randbelow(1000000):06d}"
    now = int(time.time())
    _password_reset_ref(email).set({
        "otp_hash": _sign_password_reset_text(f"{email}:{otp}"),
        "requested_at": now,
        "expires_at": now + PASSWORD_RESET_OTP_TTL_SECONDS,
        "attempts": 0,
        "uid": user.uid,
    })

    sent = send_password_reset_otp_email(
        to_email=email,
        otp=otp,
        expires_minutes=max(1, PASSWORD_RESET_OTP_TTL_SECONDS // 60),
    )
    if not sent:
        detail = get_last_email_error() or "Could not send OTP email"
        raise HTTPException(status_code=500, detail=f"Could not send OTP email: {detail}")

    return {"message": f"OTP sent to {email}", "expires_in": PASSWORD_RESET_OTP_TTL_SECONDS}


@router.post("/forgot-password/verify-otp")
async def verify_password_reset_otp(body: PasswordResetOtpVerifyRequest):
    email = body.email.strip().lower()
    otp = body.otp.strip()
    otp_data = _password_reset_ref(email).get() or {}
    if not otp_data:
        raise HTTPException(status_code=404, detail="No OTP request found. Request a new one.")

    if int(otp_data.get("expires_at", 0)) < int(time.time()):
        _password_reset_ref(email).delete()
        raise HTTPException(status_code=410, detail="OTP has expired. Request a new one.")

    attempts = int(otp_data.get("attempts", 0)) + 1
    if attempts > 5:
        _password_reset_ref(email).delete()
        raise HTTPException(status_code=429, detail="Too many invalid OTP attempts")

    expected_hash = otp_data.get("otp_hash", "")
    if not hmac.compare_digest(expected_hash, _sign_password_reset_text(f"{email}:{otp}")):
        _password_reset_ref(email).update({"attempts": attempts})
        raise HTTPException(status_code=401, detail="Invalid OTP")

    token_payload = _issue_password_reset_token(email)
    _password_reset_ref(email).update({
        "verified_at": int(time.time()),
        "reset_token_hash": _sign_password_reset_text(token_payload["reset_token"]),
        "reset_token_expires_at": token_payload["expires_at"],
        "attempts": attempts,
    })
    return {
        "message": "OTP verified",
        **token_payload,
    }


@router.post("/forgot-password/reset")
async def reset_password_with_otp(body: PasswordResetCompleteRequest):
    email = body.email.strip().lower()
    reset_state = _password_reset_ref(email).get() or {}
    if not reset_state:
        raise HTTPException(status_code=404, detail="No reset session found. Verify OTP again.")

    _verify_password_reset_token(email, body.reset_token)

    stored_token_hash = str(reset_state.get("reset_token_hash") or "")
    if not stored_token_hash or not hmac.compare_digest(stored_token_hash, _sign_password_reset_text(body.reset_token)):
        raise HTTPException(status_code=401, detail="Reset token is no longer valid")

    if int(reset_state.get("reset_token_expires_at", 0)) < int(time.time()):
        _password_reset_ref(email).delete()
        raise HTTPException(status_code=410, detail="Reset session expired. Verify OTP again.")

    user = _user_by_email(email)
    if not user:
        _password_reset_ref(email).delete()
        raise HTTPException(status_code=404, detail="No account found for this email")

    try:
        fb_auth.update_user(user.uid, password=body.password)
        fb_db.reference(f"users/{user.uid}").update({
            "password_set": True,
            "updated_at": int(time.time() * 1000),
        })
        _password_reset_ref(email).delete()
        return {"message": "Password reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to reset password: {str(e)}")
