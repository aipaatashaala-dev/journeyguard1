from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import auth as fb_auth, db as fb_db
import time
from models.schemas import RegisterRequest, LoginRequest, UpdateUserProfileRequest, SetPasswordRequest
from dependencies import get_current_user

router = APIRouter()


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
    """Update user profile information (email)."""
    uid = current_user["uid"]
    
    # Build update data - only include non-None fields
    updates = {}
    if body.email:
        updates["email"] = body.email
    
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    
    try:
        # Update Firebase DB
        fb_db.reference(f"users/{uid}").update(updates)
        
        # If email changed, also update Firebase Auth
        if body.email and body.email != current_user.get("email"):
            fb_auth.update_user(uid, email=body.email)
        
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
