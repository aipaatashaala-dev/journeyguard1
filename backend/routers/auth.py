from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import auth as fb_auth, db as fb_db
import time
from models.schemas import RegisterRequest, LoginRequest, UpdateUserProfileRequest, SetPasswordRequest
from dependencies import get_current_user

router = APIRouter()


def _normalize_display_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = " ".join(str(value).strip().split())[:40]
    return normalized or None


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
