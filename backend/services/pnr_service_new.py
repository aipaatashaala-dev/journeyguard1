"""
PNR service - simplified
- Fetches real PNR data from IRCTC API
- Stores PNR details in Firebase
- No berth selection - just display PNR info
"""
import hashlib
import os
from datetime import datetime, timedelta, date
from firebase_admin import db as fb_db
from models.schemas import PNRDetailsResponse
from services.http_pool import get_shared_http_client
from services.runtime_controls import AsyncSingleFlight, TTLCache

# IRCTC RapidAPI Configuration
IRCTC_API_KEY = os.getenv("IRCTC_API_KEY", "68ad334fc9msh44bddffcf14f1acp17032bjsn61766b1ac602")
IRCTC_API_HOST = os.getenv("IRCTC_API_HOST", "irctc1.p.rapidapi.com")
IRCTC_API_BASE = os.getenv("IRCTC_API_BASE", f"https://{IRCTC_API_HOST}")
_LOCAL_PNR_CACHE = TTLCache(max_size=1024)
_PNR_SINGLE_FLIGHT = AsyncSingleFlight()


# ── Helper Functions ────────────────────────────────────────────────────────
def _fix_journey_date(journey_date: str) -> str:
    """
    Fix stale/cached journey dates from IRCTC API.
    If date is significantly in the past, use today's date instead.
    Format: "DD-MM-YYYY"
    """
    try:
        parts = journey_date.split("-")
        if len(parts) != 3:
            return journey_date
        
        day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        date_obj = datetime(year, month, day)
        today = datetime.now().date()
        
        # If date is 5 or more days in the past, assume it's cached/wrong
        # and use today's date instead
        days_diff = (date_obj.date() - today).days
        
        if days_diff <= -5:
            print(f"[PNR] Detected stale journey date {journey_date}, using today instead")
            return today.strftime("%d-%m-%Y")
        
        return journey_date
    except Exception as e:
        print(f"[PNR] Could not fix journey date {journey_date}: {str(e)}")
        return journey_date


def _normalize_journey_date(journey_date: str) -> str:
    raw = str(journey_date or "").strip()
    if not raw:
        return raw

    fixed = _fix_journey_date(raw)
    parts = fixed.split("-")
    if len(parts) != 3:
        return fixed

    try:
        if len(parts[0]) == 4:
            parsed = datetime(int(parts[0]), int(parts[1]), int(parts[2]))
        else:
            parsed = datetime(int(parts[2]), int(parts[1]), int(parts[0]))
        return parsed.strftime("%Y-%m-%d")
    except Exception:
        return fixed


async def get_pnr_details(pnr: str, user_id: str = None, refresh: bool = False) -> PNRDetailsResponse:
    """
    Get PNR details and store in Firebase.
    1. Check Firebase cache (unless refresh=True)
    2. Try IRCTC API for real data
    3. Return error if no booking found
    Returns PNR details or error.
    """
    print(f"\n[PNR] Processing PNR: {pnr} (refresh={refresh})")

    if not refresh:
        local_cached = _LOCAL_PNR_CACHE.get(pnr)
        if local_cached:
            if local_cached.get("status") == "no_booking":
                raise Exception(f"PNR {pnr} not found - no booking available")
            if local_cached.get("status") == "provider_error":
                raise Exception(local_cached.get("error_message") or "UPSTREAM_ERROR: PNR provider unavailable")
            return _format_pnr_response(local_cached)

    async def load():
        result = await _get_pnr_details_uncached(pnr, refresh=refresh)
        _LOCAL_PNR_CACHE.set(
            pnr,
            result,
            ttl_seconds=30 if refresh else 90,
        )
        if result.get("status") == "no_booking":
            raise Exception(f"PNR {pnr} not found - no booking available")
        if result.get("status") == "provider_error":
            raise Exception(result.get("error_message") or "UPSTREAM_ERROR: PNR provider unavailable")
        return _format_pnr_response(result)

    if refresh:
        return await load()
    return await _PNR_SINGLE_FLIGHT.run(f"pnr:{pnr}", load)


async def _get_pnr_details_uncached(pnr: str, refresh: bool = False) -> dict:
    pnr_ref = fb_db.reference(f"pnr_data/{pnr}")
    existing_pnr = pnr_ref.get()
    has_cached_payload = bool(
        existing_pnr
        and existing_pnr.get("train_number")
        and existing_pnr.get("journey_date")
    )

    if not refresh and existing_pnr and existing_pnr.get("fetched_at"):
        fetched_time = datetime.fromisoformat(existing_pnr.get("fetched_at", ""))
        cache_age = (datetime.now() - fetched_time).total_seconds()
        if cache_age < 7200:
            print(f"[PNR] Found recent cached PNR data (age: {cache_age/60:.1f} minutes)")
            return existing_pnr
        print(f"[PNR] Cache expired (age: {cache_age/3600:.1f} hours), fetching fresh data")
    elif not refresh and has_cached_payload:
        print("[PNR] Found cached PNR data without fetched_at, using stored database payload")
        return existing_pnr
    elif refresh:
        print(f"[PNR] Force refresh requested, fetching fresh data from IRCTC")

    print(f"[PNR] Fetching from IRCTC API...")
    pnr_data = await _fetch_from_irctc(pnr)

    if not pnr_data:
        if has_cached_payload:
            print("[PNR] IRCTC returned no data, falling back to stored database payload")
            return existing_pnr
        print(f"[PNR] IRCTC API returned no data - PNR not found")
        not_found_payload = {
            "pnr": pnr,
            "status": "no_booking",
            "created_at": datetime.now().isoformat(),
            "fetched_at": datetime.now().isoformat(),
        }
        try:
            pnr_ref.set(not_found_payload)
        except Exception as fb_error:
            print(f"[PNR] Warning: Could not cache no_booking status to Firebase: {str(fb_error)}")
        return not_found_payload

    if pnr_data.get("status") == "provider_error":
        if has_cached_payload:
            print("[PNR] Provider error, falling back to stored database payload")
            return existing_pnr
        pnr_data["fetched_at"] = datetime.now().isoformat()
        try:
            pnr_ref.set(pnr_data)
        except Exception as fb_error:
            print(f"[PNR] Warning: Could not cache provider error to Firebase: {str(fb_error)}")
        return pnr_data

    pnr_data["status"] = "confirmed"
    pnr_data["created_at"] = datetime.now().isoformat()
    pnr_data["fetched_at"] = datetime.now().isoformat()

    pnr_ref.set(pnr_data)
    print(f"[PNR] Stored PNR data in Firebase")
    return pnr_data


async def _fetch_from_irctc(pnr: str) -> dict:
    """Fetch real PNR data from IRCTC API."""
    try:
        headers = {
            'x-api-key': IRCTC_API_KEY,
            'x-api-host': IRCTC_API_HOST,
            'x-rapidapi-key': IRCTC_API_KEY,
            'x-rapidapi-host': IRCTC_API_HOST,
            'Content-Type': 'application/json'
        }

        client = await get_shared_http_client()
        response = await client.get(
            f"{IRCTC_API_BASE}/pnrStatus",
            params={"pnr": pnr},
            headers=headers
        )

        if response.status_code == 200:
            data = response.json()
            print(f"[IRCTC] Successfully fetched PNR data: {data}")

            if data.get("success"):
                irctc_data = data.get("data", {})
                coach = "S1"
                berth = None
                all_berths = []

                if irctc_data.get("passengers"):
                    for idx, passenger in enumerate(irctc_data["passengers"]):
                        current_status = passenger.get("currentStatus", "")
                        status_parts = current_status.split()

                        berth_type = status_parts[0] if status_parts else "WL"
                        coach_from_status = status_parts[1] if len(status_parts) > 1 else "S1"
                        berth_num = status_parts[2] if len(status_parts) > 2 else f"WL{idx+1}"

                        if not berth_num or berth_num.startswith("WL"):
                            berth_num = str(passenger.get("berth")) if passenger.get("berth") else f"WL{idx+1}"

                        berth_data = {
                            "berth_number": str(berth_num),
                            "berth_type": berth_type,
                            "passenger_name": passenger.get("name", f"Passenger {idx+1}"),
                            "status": berth_type,
                            "claimed_by": None,
                            "claimed_at": None
                        }
                        all_berths.append(berth_data)

                        print(f"[IRCTC] Parsed passenger {idx+1}: berth={berth_num}, coach={coach_from_status}, status={berth_type}")

                    first_passenger = irctc_data["passengers"][0]
                    first_status = first_passenger.get("currentStatus", "")
                    first_parts = first_status.split()
                    coach = first_parts[1] if len(first_parts) > 1 else first_passenger.get("coach", "S1")
                    berth = first_parts[2] if len(first_parts) > 2 else str(first_passenger.get("berth")) if first_passenger.get("berth") else None

                result = {
                    "pnr": pnr,
                    "train_number": irctc_data.get("trainNumber", "TBD"),
                    "train_name": irctc_data.get("trainName", "Unknown Train"),
                    "journey_date": _normalize_journey_date(irctc_data.get("journeyDate", "TBD")),
                    "coach": coach,
                    "berth": berth,
                    "from_station": irctc_data.get("source", irctc_data.get("boardingPoint", "TBD")),
                    "to_station": irctc_data.get("destination", "TBD"),
                    "departure": irctc_data.get("departureTime", "TBD"),
                    "arrival": irctc_data.get("arrivalTime", "TBD"),
                    "all_berths": all_berths,
                }
                print(f"[IRCTC] Parsed result with {len(all_berths)} berths: {result}")
                return result

            provider_message = (
                data.get("message")
                or data.get("error")
                or data.get("msg")
                or "PNR provider returned no booking data"
            )
            print(f"[IRCTC] API returned success=false: {provider_message}")
            if "not found" in provider_message.lower() or "no booking" in provider_message.lower() or "flushed" in provider_message.lower():
                return None
            return {
                "pnr": pnr,
                "status": "provider_error",
                "error_message": f"UPSTREAM_ERROR: {provider_message}",
            }

        body_preview = response.text[:300]
        print(f"[IRCTC] API returned status {response.status_code}, body: {body_preview}")
        return {
            "pnr": pnr,
            "status": "provider_error",
            "error_message": f"UPSTREAM_ERROR: PNR API returned {response.status_code}",
        }
    except Exception as e:
        print(f"[IRCTC] Error fetching PNR: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "pnr": pnr,
            "status": "provider_error",
            "error_message": f"UPSTREAM_ERROR: {str(e)}",
        }


def _generate_mock_pnr(pnr: str) -> dict:
    """
    Generate mock PNR data for TESTING ONLY.
    
    ⚠️ IMPORTANT: This function should NOT be used for real PNR lookups.
    If IRCTC API returns no booking data, we should return an error to the user
    instead of generating fake booking data.
    
    This function is kept only for unit testing purposes.
    """
    mock_trains = [
        ("12627", "Karnataka Express", "New Delhi (NDLS)", "Bangalore (SBC)", "22:30", "04:30 +1"),
        ("12721", "Dakshin Express", "Hazrat Nizamuddin (NZM)", "Hyderabad (HYB)", "23:55", "06:10 +1"),
        ("12727", "Hyderabad Express", "Hyderabad (HYB)", "Mumbai CST (CSTM)", "22:15", "08:45 +1"),
        ("17031", "Mumbai Express", "Hyderabad (HYB)", "Mumbai CST (CSTM)", "06:10", "22:00"),
        ("12163", "Chennai Express", "Mumbai CST (CSTM)", "Chennai Central (MAS)", "21:40", "14:30 +1"),
    ]
    
    h = int(hashlib.md5(pnr.encode()).hexdigest(), 16)
    train_idx = h % len(mock_trains)
    train = mock_trains[train_idx]
    berth = str((h >> 8) % 72 + 1)  # Generate a berth number between 1-72
    journey_date = (date.today() + timedelta(days=1)).isoformat()
    
    print(f"[MOCK] Generated mock journey for PNR {pnr}")
    return {
        "pnr": pnr,
        "train_number": train[0],
        "train_name": train[1],
        "journey_date": journey_date,
        "coach": "S1",
        "berth": berth,
        "from_station": train[2],
        "to_station": train[3],
        "departure": train[4],
        "arrival": train[5],
    }


def _format_pnr_response(pnr_data: dict) -> PNRDetailsResponse:
    """Format PNR data into response model and get available berths."""
    # Get all berths from PNR data
    all_berths = pnr_data.get("all_berths", [])
    
    # Get claimed berths from Firebase
    claimed_berths = _get_claimed_berths(pnr_data.get("pnr"))
    
    # Calculate available berths (all API berths that haven't been claimed by users)
    available_berths = []
    for berth in all_berths:
        if berth["berth_number"] not in claimed_berths:
            available_berths.append(berth["berth_number"])
    
    return PNRDetailsResponse(
        pnr=pnr_data.get("pnr"),
        train_number=pnr_data.get("train_number"),
        train_name=pnr_data.get("train_name"),
        journey_date=pnr_data.get("journey_date"),
        run_date=pnr_data.get("journey_date"),
        coach=pnr_data.get("coach"),
        berth=pnr_data.get("berth"),
        from_station=pnr_data.get("from_station"),
        to_station=pnr_data.get("to_station"),
        departure=pnr_data.get("departure"),
        arrival=pnr_data.get("arrival"),
        all_berths=all_berths,
        available_berths=available_berths,
    )


def _get_claimed_berths(pnr: str) -> set:
    """Get all berths that have been claimed by users for this PNR."""
    try:
        claims_ref = fb_db.reference(f"pnr_berth_claims/{pnr}")
        claims_data = claims_ref.get()
        if claims_data:
            return set(claims_data.keys())
        return set()
    except Exception as e:
        print(f"[PNR] Warning: Could not get claimed berths: {str(e)}")
        return set()
