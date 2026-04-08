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

# PNR RapidAPI Configuration
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


def _extract_pnr_current_status(payload: dict) -> str | None:
    for key in [
        "trainStatus",
        "TrainStatus",
        "currentStatus",
        "CurrentStatus",
        "current_status",
        "status",
        "chartStatus",
        "ChartStatus",
    ]:
        value = payload.get(key)
        if value not in (None, "", [], {}):
            return str(value).strip()

    passengers = _extract_passenger_rows(payload)
    if passengers:
        first_passenger = passengers[0] if isinstance(passengers[0], dict) else {}
        for key in ["currentStatus", "CurrentStatus", "current_status", "bookingStatus", "BookingStatus", "currentStatusDetails"]:
            value = first_passenger.get(key)
            if value not in (None, "", [], {}):
                return str(value).strip()

    return None


def _extract_pnr_cancelled(payload: dict, current_status: str | None) -> bool:
    status_text = str(current_status or "").strip().lower()
    raw_value = (
        payload.get("isCancelled")
        or payload.get("IsCancelled")
        or payload.get("cancelled")
        or payload.get("trainCancelled")
        or payload.get("TrainCancelledFlag")
        or payload.get("cancelStatus")
    )

    if isinstance(raw_value, bool):
        return raw_value
    if isinstance(raw_value, (int, float)):
        return bool(raw_value)
    if isinstance(raw_value, str) and raw_value.strip():
        normalized = raw_value.strip().lower()
        if normalized in {"true", "yes", "1", "cancelled", "canceled"}:
            return True

    return "cancel" in status_text


def _extract_passenger_rows(payload: dict) -> list[dict]:
    passengers = payload.get("passengers") or payload.get("passengerStatus") or payload.get("PassengerStatus") or []
    if isinstance(passengers, dict):
        rows = []
        for key in sorted(passengers.keys(), key=lambda item: int(item) if str(item).isdigit() else str(item)):
            value = passengers.get(key)
            if isinstance(value, dict):
                rows.append(value)
        return rows
    if isinstance(passengers, list):
        return [item for item in passengers if isinstance(item, dict)]
    return []


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
            payload = {**local_cached, "request_user_id": user_id}
            return _format_pnr_response(payload)

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
        return _format_pnr_response({**result, "request_user_id": user_id})

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
        client = await get_shared_http_client()
        candidate_requests = [
            (
                "irctc1-pnrStatus",
                "https://irctc1.p.rapidapi.com",
                "irctc1.p.rapidapi.com",
                "/pnrStatus",
                {"pnr": pnr},
            ),
            (
                "irctc1-v3-pnr",
                "https://irctc1.p.rapidapi.com",
                "irctc1.p.rapidapi.com",
                "/api/v3/getPNRStatus",
                {"pnr": pnr},
            ),
            (
                "rapidapi-pnr-status",
                "https://pnr_status-pnr-status-indian-railways-v1.p.rapidapi.com",
                "pnr_status-pnr-status-indian-railways-v1.p.rapidapi.com",
                "/pnr",
                {"pnr": pnr},
            ),
        ]
        last_provider_error = None

        for request_name, api_base, api_host, api_path, params in candidate_requests:
            try:
                headers = {
                    "x-api-key": IRCTC_API_KEY,
                    "x-api-host": api_host,
                    "x-rapidapi-key": IRCTC_API_KEY,
                    "x-rapidapi-host": api_host,
                    "Content-Type": "application/json",
                }
                response = await client.get(
                    f"{api_base}{api_path}",
                    params=params,
                    headers=headers,
                )
                print(f"[IRCTC] Tried {request_name}: status={response.status_code}")

                if response.status_code != 200:
                    body_preview = response.text[:300]
                    last_provider_error = f"PNR API returned {response.status_code}"
                    print(f"[IRCTC] {request_name} failed: {body_preview}")
                    continue

                data = response.json()
                print(f"[IRCTC] Successfully fetched PNR data via {request_name}: {data}")

                payload = data.get("data") if isinstance(data.get("data"), dict) else data
                success = data.get("success")
                if success is None:
                    success = bool(payload)

                if not success:
                    provider_message = (
                        data.get("message")
                        or data.get("error")
                        or data.get("msg")
                        or data.get("status")
                        or "PNR provider returned no booking data"
                    )
                    print(f"[IRCTC] {request_name} returned success=false: {provider_message}")
                    if "not found" in provider_message.lower() or "no booking" in provider_message.lower() or "flushed" in provider_message.lower():
                        return None
                    last_provider_error = provider_message
                    continue

                irctc_data = payload if isinstance(payload, dict) else {}
                current_status = _extract_pnr_current_status(irctc_data)
                cancelled = _extract_pnr_cancelled(irctc_data, current_status)
                coach = "S1"
                berth = None
                all_berths = []

                passengers = _extract_passenger_rows(irctc_data)

                if passengers:
                    for idx, passenger in enumerate(passengers):
                        current_status = (
                            passenger.get("currentStatus")
                            or passenger.get("CurrentStatus")
                            or passenger.get("current_status")
                            or passenger.get("bookingStatus")
                            or passenger.get("BookingStatus")
                            or passenger.get("currentStatusDetails")
                            or ""
                        )
                        status_parts = current_status.split()

                        berth_type = status_parts[0] if status_parts else "WL"
                        coach_from_status = (
                            status_parts[1] if len(status_parts) > 1 else str(passenger.get("coach") or passenger.get("Coach") or passenger.get("coachNo") or passenger.get("CurrentCoachId") or "S1")
                        )
                        berth_num = (
                            status_parts[2] if len(status_parts) > 2 else str(passenger.get("berth") or passenger.get("Berth") or passenger.get("berthNumber") or passenger.get("CurrentBerthNo") or f"WL{idx+1}")
                        )

                        if not berth_num or berth_num.startswith("WL"):
                            berth_num = str(passenger.get("berth") or passenger.get("Berth") or passenger.get("berthNumber") or passenger.get("CurrentBerthNo")) if (passenger.get("berth") or passenger.get("Berth") or passenger.get("berthNumber") or passenger.get("CurrentBerthNo")) else f"WL{idx+1}"

                        berth_data = {
                            "berth_number": str(berth_num),
                            "berth_type": passenger.get("CurrentBerthCode") or passenger.get("BookingBerthCode") or berth_type,
                            "passenger_name": passenger.get("name") or passenger.get("Name") or passenger.get("passengerName") or f"Passenger {idx+1}",
                            "status": berth_type or "CNF",
                            "claimed_by": None,
                            "claimed_at": None,
                        }
                        all_berths.append(berth_data)

                        print(f"[IRCTC] Parsed passenger {idx+1}: berth={berth_num}, coach={coach_from_status}, status={berth_type}")

                    first_passenger = passengers[0]
                    first_status = (
                        first_passenger.get("currentStatus")
                        or first_passenger.get("CurrentStatus")
                        or first_passenger.get("current_status")
                        or first_passenger.get("bookingStatus")
                        or first_passenger.get("BookingStatus")
                        or first_passenger.get("currentStatusDetails")
                        or ""
                    )
                    first_parts = first_status.split()
                    coach = first_parts[1] if len(first_parts) > 1 else str(first_passenger.get("coach") or first_passenger.get("Coach") or first_passenger.get("coachNo") or first_passenger.get("CurrentCoachId") or "S1")
                    berth = first_parts[2] if len(first_parts) > 2 else str(first_passenger.get("berth") or first_passenger.get("Berth") or first_passenger.get("berthNumber") or first_passenger.get("CurrentBerthNo")) if (first_passenger.get("berth") or first_passenger.get("Berth") or first_passenger.get("berthNumber") or first_passenger.get("CurrentBerthNo")) else None

                result = {
                    "pnr": pnr,
                    "train_number": irctc_data.get("trainNumber") or irctc_data.get("TrainNo") or irctc_data.get("trainNo") or "TBD",
                    "train_name": irctc_data.get("trainName") or irctc_data.get("TrainName") or irctc_data.get("train_name") or "Unknown Train",
                    "journey_date": _normalize_journey_date(irctc_data.get("journeyDate") or irctc_data.get("JourneyDate") or irctc_data.get("Doj") or irctc_data.get("doj") or "TBD"),
                    "current_status": current_status,
                    "cancelled": cancelled,
                    "coach": coach,
                    "berth": berth,
                    "from_station": irctc_data.get("source") or irctc_data.get("Source") or irctc_data.get("boardingPoint") or irctc_data.get("BoardingPoint") or irctc_data.get("fromStation") or irctc_data.get("From") or "TBD",
                    "to_station": irctc_data.get("destination") or irctc_data.get("Destination") or irctc_data.get("toStation") or irctc_data.get("To") or "TBD",
                    "departure": irctc_data.get("departureTime") or irctc_data.get("DepartureTime") or irctc_data.get("departure") or "TBD",
                    "arrival": irctc_data.get("arrivalTime") or irctc_data.get("ArrivalTime") or irctc_data.get("arrival") or "TBD",
                    "all_berths": all_berths,
                }
                print(f"[IRCTC] Parsed result with {len(all_berths)} berths via {request_name}: {result}")
                return result
            except Exception as request_error:
                last_provider_error = str(request_error)
                print(f"[IRCTC] {request_name} exception: {request_error}")
                continue

        return {
            "pnr": pnr,
            "status": "provider_error",
            "error_message": f"UPSTREAM_ERROR: {last_provider_error or 'PNR provider unavailable'}",
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
    user_id = pnr_data.get("request_user_id")
    selected_berth = None

    # Get claimed berths from Firebase
    claimed_berths = _get_claimed_berths(pnr_data.get("pnr"))

    # Calculate available berths, but keep the current user's own berth visible/selectable.
    available_berths = []
    normalized_all_berths = []
    for berth in all_berths:
        berth_number = str(berth.get("berth_number") or "").strip()
        claim_info = claimed_berths.get(berth_number)
        claimed_by = claim_info.get("claimed_by") if isinstance(claim_info, dict) else None
        claimed_at = claim_info.get("claimed_at") if isinstance(claim_info, dict) else None
        claimed_by_current_user = bool(user_id and claimed_by == user_id)

        berth_payload = {
            **berth,
            "berth_number": berth_number,
            "claimed_by": claimed_by,
            "claimed_at": claimed_at,
        }

        if claimed_by_current_user:
            selected_berth = berth_number
            berth_payload["status"] = "SELECTED"
            available_berths.append(berth_number)
        elif claim_info:
            berth_payload["status"] = "CLAIMED"
        else:
            available_berths.append(berth_number)

        normalized_all_berths.append(berth_payload)
    
    return PNRDetailsResponse(
        pnr=pnr_data.get("pnr"),
        train_number=pnr_data.get("train_number"),
        train_name=pnr_data.get("train_name"),
        journey_date=pnr_data.get("journey_date"),
        run_date=pnr_data.get("journey_date"),
        current_status=pnr_data.get("current_status"),
        cancelled=bool(pnr_data.get("cancelled", False)),
        selected_berth=selected_berth,
        coach=pnr_data.get("coach"),
        berth=pnr_data.get("berth"),
        from_station=pnr_data.get("from_station"),
        to_station=pnr_data.get("to_station"),
        departure=pnr_data.get("departure"),
        arrival=pnr_data.get("arrival"),
        all_berths=normalized_all_berths,
        available_berths=available_berths,
    )


def _get_claimed_berths(pnr: str) -> dict:
    """Get all berth claims for this PNR keyed by berth number."""
    try:
        claims_ref = fb_db.reference(f"pnr_berth_claims/{pnr}")
        claims_data = claims_ref.get()
        if isinstance(claims_data, dict):
            return claims_data
        return {}
    except Exception as e:
        print(f"[PNR] Warning: Could not get claimed berths: {str(e)}")
        return {}
