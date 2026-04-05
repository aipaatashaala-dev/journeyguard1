import time
from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import db as fb_db
from dependencies import get_current_user
from models.schemas import StartLocationRequest, UpdateLocationRequest, LocationLinkResponse
from services.location_service import (
    start_location_session,
    update_location_in_db,
    expire_location_session,
    tracking_link_for_token,
    get_location_data,
    verify_tracking_token,
)
from services.email_service import send_location_tracking_email

router = APIRouter()


def _public_location_payload(journey_id: str, data: dict) -> dict:
    token = data.get("token", journey_id)
    return {
        "journey_id": journey_id,
        "tracking_link": tracking_link_for_token(token),
        "expired": bool(data.get("expired")),
        "active": bool(data.get("active")),
        "lat": data.get("lat"),
        "lng": data.get("lng"),
        "accuracy": data.get("accuracy"),
        "updated_at": data.get("updated_at"),
        "passenger_id": data.get("passenger_id"),
        "train_number": data.get("train_number"),
        "journey_date": data.get("journey_date"),
    }


@router.post("/start", response_model=LocationLinkResponse)
async def start_tracking(body: StartLocationRequest, user: dict = Depends(get_current_user)):
    uid = user["uid"]

    meta = {
        "passenger_id": body.passenger_id,
        "train_number": body.train_number,
        "journey_date": body.journey_date,
        "uid"         : uid,
    }
    token = start_location_session(body.journey_id, uid, meta)
    link  = tracking_link_for_token(token)

    # Send email with the tracking link — non-blocking
    try:
        send_location_tracking_email(
            to_email     = body.user_email,
            passenger_id = body.passenger_id,
            train_number = body.train_number,
            journey_date = body.journey_date,
            tracking_link= link,
        )
    except Exception as e:
        # Log but don't fail the request
        import logging
        logging.getLogger(__name__).warning(f"Email send failed: {e}")

    return LocationLinkResponse(
        tracking_link=link,
        journey_id   =body.journey_id,
        expires_at   ="Journey end (auto-expiry)",
    )


@router.post("/update")
async def update_location(body: UpdateLocationRequest, user: dict = Depends(get_current_user)):
    # Validate the session belongs to this user
    data = get_location_data(body.journey_id)
    if not data:
        raise HTTPException(status_code=404, detail="No active location session for this journey")
    if data.get("uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your journey")
    if data.get("expired"):
        raise HTTPException(status_code=410, detail="Location session has expired")

    update_location_in_db(body.journey_id, body.lat, body.lng, body.accuracy)
    return {"message": "Location updated", "lat": body.lat, "lng": body.lng}


@router.post("/{journey_id}/stop")
async def stop_tracking(journey_id: str, user: dict = Depends(get_current_user)):
    data = get_location_data(journey_id)
    if data and data.get("uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your journey")
    expire_location_session(journey_id)
    return {"message": "Location tracking stopped. Link expired."}


@router.get("/public/{token}")
async def get_public_location(token: str):
    payload = verify_tracking_token(token)
    if not payload:
        raise HTTPException(status_code=404, detail="Tracking link is invalid or expired")

    journey_id = payload.get("j")
    data = get_location_data(journey_id)
    if not data or data.get("token") != token:
        raise HTTPException(status_code=404, detail="No location session found")

    return _public_location_payload(journey_id, data)


@router.get("/{journey_id}")
async def get_location_status(journey_id: str, user: dict = Depends(get_current_user)):
    data = get_location_data(journey_id)
    if not data:
        raise HTTPException(status_code=404, detail="No location session found")
    if data.get("uid") != user["uid"]:
        raise HTTPException(status_code=403, detail="Not your journey")
    return _public_location_payload(journey_id, data)


@router.get("/{journey_id}/link", response_model=LocationLinkResponse)
async def get_link(journey_id: str, user: dict = Depends(get_current_user)):
    data = get_location_data(journey_id)
    if not data:
        raise HTTPException(status_code=404, detail="No location session found")
    if data.get("expired"):
        raise HTTPException(status_code=410, detail="Location session expired")

    token = data.get("token", journey_id)
    return LocationLinkResponse(
        tracking_link=tracking_link_for_token(token),
        journey_id   =journey_id,
    )
