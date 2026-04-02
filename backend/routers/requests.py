import time
from fastapi import APIRouter, Depends
from firebase_admin import db as fb_db
from dependencies import get_current_user
from models.schemas import AssistanceRequestCreate

router = APIRouter()


@router.post("")
async def send_request(body: AssistanceRequestCreate, user: dict = Depends(get_current_user)):
    uid        = user["uid"]
    journey    = fb_db.reference(f"user_journeys/{uid}").get() or {}
    passenger_id = journey.get("passenger_id", f"Passenger-{uid[:4]}")

    # Emergency alerts go to train-level; others to coach-level
    if body.request_type == "EMERGENCY":
        path = f"train_groups/{body.journey_id}/emergency_alerts"
    else:
        path = f"train_groups/{body.journey_id}/{body.coach_id}/requests"

    new_ref = fb_db.reference(path).push()
    new_ref.set({
        "passenger_id": passenger_id,
        "type"        : body.request_type,
        "timestamp"   : int(time.time() * 1000),
        "uid"         : uid,
        "active"      : True,
    })

    return {"message": "Request sent", "request_id": new_ref.key, "passenger_id": passenger_id}


@router.get("/{journey_id}/{coach_id}")
async def get_requests(journey_id: str, coach_id: str, _: dict = Depends(get_current_user)):
    data = fb_db.reference(f"train_groups/{journey_id}/{coach_id}/requests").get() or {}
    requests = [{"id": k, **v} for k, v in data.items() if isinstance(v, dict)]
    requests.sort(key=lambda x: x.get("timestamp", 0), reverse=True)
    return {"requests": requests, "count": len(requests)}


@router.delete("/{journey_id}/{coach_id}/{request_id}")
async def delete_request(
    journey_id: str, coach_id: str, request_id: str,
    user: dict = Depends(get_current_user)
):
    ref  = fb_db.reference(f"train_groups/{journey_id}/{coach_id}/requests/{request_id}")
    data = ref.get()
    if not data:
        return {"message": "Not found"}
    if data.get("uid") != user["uid"]:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not your request")
    ref.delete()
    return {"message": "Request deleted"}
