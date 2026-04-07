from fastapi import APIRouter, Depends, HTTPException
from dependencies import get_current_user
from services.pnr_service_new import get_pnr_details
from models.schemas import PNRDetailsResponse, ClaimBerthRequest
from firebase_admin import db as fb_db
from datetime import datetime

router = APIRouter()


@router.get("/{pnr}", response_model=PNRDetailsResponse)
async def get_pnr(pnr: str, refresh: bool = False, current_user: dict = Depends(get_current_user)):
    """Get PNR details and store in Firebase. Use ?refresh=true to bypass cache."""
    if not pnr.isdigit() or len(pnr) != 10:
        raise HTTPException(status_code=422, detail="PNR must be exactly 10 digits")
    
    try:
        return await get_pnr_details(pnr, user_id=current_user.get("uid"), refresh=refresh)
    except Exception as e:
        error_msg = str(e)
        print(f"[PNR_ROUTER] Exception caught: {error_msg}")

        if "UPSTREAM_ERROR:" in error_msg:
            raise HTTPException(
                status_code=502,
                detail=error_msg.replace("UPSTREAM_ERROR:", "").strip() or "PNR provider is unavailable right now."
            )
        
        # Check if it's a no-booking error
        if "not found" in error_msg.lower() or "no booking" in error_msg.lower() or "flushed" in error_msg.lower():
            print(f"[PNR_ROUTER] Treating as 404 - no booking found")
            raise HTTPException(
                status_code=404, 
                detail=f"PNR {pnr} not found - no active booking."
            )
        
        # For any other error, return 500
        print(f"[PNR_ROUTER] Returning 500 error")
        raise HTTPException(status_code=500, detail=f"Error fetching PNR: {error_msg}")


@router.post("/{pnr}/claim-berth")
async def claim_berth(pnr: str, request: ClaimBerthRequest, current_user: dict = Depends(get_current_user)):
    """Claim/select a berth for a PNR"""
    if not pnr.isdigit() or len(pnr) != 10:
        raise HTTPException(status_code=422, detail="PNR must be exactly 10 digits")
    
    try:
        user_id = current_user.get("uid")
        berth_number = request.berth_number.strip()
        claims_ref = fb_db.reference(f"pnr_berth_claims/{pnr}/{berth_number}")
        claim_data = {
            "pnr": pnr,
            "berth_number": berth_number,
            "claimed_by": user_id,
            "claimed_at": datetime.now().isoformat(),
        }

        def claim_if_available(current):
            if current and current.get("claimed_by") not in (None, "", user_id):
                return current
            return claim_data

        final_claim = claims_ref.transaction(claim_if_available)
        if final_claim and final_claim.get("claimed_by") != user_id:
            raise HTTPException(
                status_code=409,
                detail=f"Berth {berth_number} is already selected by another user"
            )

        print(f"[PNR] User {user_id} claimed berth {berth_number} for PNR {pnr}")
        
        # Also store in user's journey data
        user_journey_ref = fb_db.reference(f"user_pnr/{user_id}/{pnr}")
        user_journey_ref.set({
            "pnr": pnr,
            "berth": berth_number,
            "claimed_at": datetime.now().isoformat(),
        })
        
        return {
            "status": "success",
            "message": f"Berth {berth_number} selected successfully",
            "pnr": pnr,
            "berth": berth_number,
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"[PNR_ROUTER] Error claiming berth: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error claiming berth: {str(e)}")
