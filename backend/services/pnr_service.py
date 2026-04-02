"""
PNR / IRCTC API service
Integrates with IRCTC API via RapidAPI
Stores journey details in Firebase
"""
import os
import httpx
from datetime import datetime, timedelta
from models.schemas import JourneyDetails
from firebase_admin import db as fb_db

# IRCTC RapidAPI Configuration
IRCTC_API_KEY = os.getenv("IRCTC_API_KEY", "68ad334fc9msh44bddffcf14f1acp17032bjsn61766b1ac602")
IRCTC_API_HOST = os.getenv("IRCTC_API_HOST", "irctc1.p.rapidapi.com")
IRCTC_API_BASE = os.getenv("IRCTC_API_BASE", f"https://{IRCTC_API_HOST}")

# Mock trains for fallback
_TRAINS = [
    ("12627", "Karnataka Express",    "New Delhi (NDLS)",      "Bangalore (SBC)",   "22:30", "04:30 +1"),
    ("12721", "Dakshin Express",      "Hazrat Nizamuddin (NZM)","Hyderabad (HYB)",  "23:55", "06:10 +1"),
    ("12727", "Hyderabad Express",    "Hyderabad (HYB)",       "Mumbai CST (CSTM)", "22:15", "08:45 +1"),
    ("17031", "Mumbai Express",       "Hyderabad (HYB)",       "Mumbai CST (CSTM)", "06:10", "22:00"),
    ("12163", "Chennai Express",      "Mumbai CST (CSTM)",     "Chennai Central (MAS)","21:40","14:30 +1"),
]
_COACHES = ["S1","S2","S3","S4","S5","S6","S7"]
_BERTH_TYPES = ["Lower","Middle","Upper","Side Lower","Side Upper"]
_STATUSES = ["CNF","CNF","CNF","RAC","WL/3"]


def _mock_journey(pnr: str) -> JourneyDetails:
    """Generate mock journey data as fallback."""
    import hashlib
    from datetime import date, timedelta
    
    h = int(hashlib.md5(pnr.encode()).hexdigest(), 16)
    train_idx = h % len(_TRAINS)
    coach_idx = (h >> 4) % len(_COACHES)
    berth_num = (h >> 8) % 72 + 1
    berth_type = _BERTH_TYPES[(h >> 12) % len(_BERTH_TYPES)]
    status = _STATUSES[(h >> 16) % len(_STATUSES)]
    
    journey_date = (date.today() + timedelta(days=1)).isoformat()
    t = _TRAINS[train_idx]
    
    journey_details = JourneyDetails(
        pnr=pnr,
        train_number=t[0],
        train_name=t[1],
        journey_date=journey_date,
        coach=_COACHES[coach_idx],
        berth=str(berth_num),
        berth_type=berth_type,
        from_station=t[2],
        to_station=t[3],
        departure=t[4],
        arrival=t[5],
        status=status,
    )
    
    print(f"[MOCK] Generated mock journey: {journey_details.dict()}")
    return journey_details


async def fetch_pnr_details(pnr: str, user_id: str = None) -> JourneyDetails:
    """
    Fetch PNR details with caching strategy:
    1. Check Firebase database for cached PNR data
    2. If found and not expired, return cached data
    3. If not found or expired, fetch from IRCTC API
    4. Store/update in Firebase
    5. Return data
    """
    print(f"\n[PNR] === Processing PNR: {pnr} ===")
    
    # Step 1: Check Firebase cache
    print(f"[PNR] Step 1: Checking Firebase cache for PNR {pnr}...")
    try:
        cached_data = fb_db.reference(f"pnr_lookups/{pnr}").get()
        
        if cached_data:
            cached_data_dict = cached_data if isinstance(cached_data, dict) else {}
            fetched_at = cached_data_dict.get("fetched_at", "")
            source = cached_data_dict.get("source", "unknown")
            
            # Check if cache is fresh (less than 24 hours old)
            if fetched_at:
                try:
                    fetch_time = datetime.fromisoformat(fetched_at)
                    age = datetime.now() - fetch_time
                    if age < timedelta(hours=24):
                        print(f"[PNR] ✓ Cache HIT! Found in Firebase (source: {source}, age: {age})")
                        print(f"[PNR] Returning cached data for PNR {pnr}")
                        
                        # Reconstruct JourneyDetails from cache
                        return JourneyDetails(
                            pnr=cached_data_dict.get("pnr", pnr),
                            train_number=cached_data_dict.get("train_number", "TBD"),
                            train_name=cached_data_dict.get("train_name", "Unknown"),
                            journey_date=cached_data_dict.get("journey_date", "TBD"),
                            coach=cached_data_dict.get("coach", "TBD"),
                            berth=str(cached_data_dict.get("berth", "TBD")),
                            berth_type=cached_data_dict.get("berth_type", "TBD"),
                            from_station=cached_data_dict.get("from_station", "TBD"),
                            to_station=cached_data_dict.get("to_station", "TBD"),
                            departure=cached_data_dict.get("departure", "TBD"),
                            arrival=cached_data_dict.get("arrival", "TBD"),
                            status=cached_data_dict.get("status", "TBD"),
                        )
                    else:
                        print(f"[PNR] Cache expired (age: {age}). Fetching fresh data from API...")
                except Exception as e:
                    print(f"[PNR] Error checking cache age: {e}. Using API...")
            else:
                print(f"[PNR] Cache found but no timestamp. Using API for fresh data...")
        else:
            print(f"[PNR] ✗ Cache MISS! No data found in Firebase for PNR {pnr}")
            
    except Exception as e:
        print(f"[PNR] Error checking cache: {e}")
    
    # Step 2: Fetch from IRCTC API
    print(f"[PNR] Step 2: Fetching from IRCTC API...")
    try:
        async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
            print(f"[PNR] Calling IRCTC API for {pnr}...")
            print(f"[PNR] API Endpoint: {IRCTC_API_BASE}/pnrStatus?pnr={pnr}")
            print(f"[PNR] API Host: {IRCTC_API_HOST}")
            
            resp = await client.get(
                f"{IRCTC_API_BASE}/pnrStatus",
                params={"pnr": pnr},
                headers={
                    "x-api-host": IRCTC_API_HOST,
                    "x-api-key": IRCTC_API_KEY,
                    "Content-Type": "application/json",
                    "x-rapidapi-host": IRCTC_API_HOST,
                    "x-rapidapi-key": IRCTC_API_KEY,
                },
            )
            
            print(f"[PNR] API Response Status: {resp.status_code}")
            print(f"[PNR] Response Headers: {resp.headers}")
            print(f"[PNR] Response Text (first 500 chars): {resp.text[:500]}")
            
            if resp.status_code == 200:
                data = resp.json()
                print(f"[PNR] ✓ Successfully received data from IRCTC API")
                print(f"[PNR] API Data: {data}")
                journey = _parse_irctc_response(pnr, data)
                
                # Step 3: Store in Firebase
                print(f"[PNR] Step 3: Storing in Firebase...")
                try:
                    journey_dict = journey.dict() if hasattr(journey, 'dict') else journey.__dict__
                    fb_db.reference(f"pnr_lookups/{pnr}").set({
                        **journey_dict,
                        "fetched_at": datetime.now().isoformat(),
                        "user_id": user_id,
                        "source": "irctc_api"
                    })
                    print(f"[PNR] ✓ Stored in Firebase successfully")
                except Exception as e:
                    print(f"[PNR] Warning: Could not store in Firebase: {e}")
                
                return journey
            else:
                print(f"[PNR] ✗ API error: {resp.status_code}")
                print(f"[PNR] Error response: {resp.text}")
                raise Exception(f"IRCTC API returned {resp.status_code}: {resp.text}")
                
    except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException) as e:
        print(f"[PNR] ✗ TIMEOUT ERROR: {type(e).__name__}: {e}")
        print(f"[PNR] Using mock data as fallback...")
        journey = _mock_journey(pnr)
        
        # Store mock data too
        try:
            journey_dict = journey.dict() if hasattr(journey, 'dict') else journey.__dict__
            fb_db.reference(f"pnr_lookups/{pnr}").set({
                **journey_dict,
                "fetched_at": datetime.now().isoformat(),
                "user_id": user_id,
                "source": "mock_fallback_timeout"
            })
        except Exception as err:
            print(f"[PNR] Warning: Could not store mock in Firebase: {err}")
        
        return journey
        
    except Exception as e:
        print(f"[PNR] ✗ GENERAL ERROR: {type(e).__name__}: {str(e)}")
        import traceback
        print(f"[PNR] Traceback: {traceback.format_exc()}")
        print(f"[PNR] Using mock data as fallback")
        return _mock_journey(pnr)


def _parse_irctc_response(pnr: str, data: dict) -> JourneyDetails:
    """Parse IRCTC API response into our JourneyDetails schema.
    
    Actual API response structure:
    {
      "success": true,
      "data": {
        "pnr": "...",
        "trainNumber": "...",
        "trainName": "...",
        "journeyDate": "DD-MM-YYYY",
        "source": "...",
        "destination": "...",
        "departureTime": "HH:MM",
        "arrivalTime": "HH:MM",
        "passengers": [{"bookingStatus": "...", "coach": "...", "berth": ...}],
        ...
      }
    }
    """
    try:
        # Check if response has nested "data" field
        if "data" in data:
            api_data = data.get("data", {})
        else:
            api_data = data
        
        # Get passenger info (if available)
        passengers = api_data.get("passengers", [{}])
        first_passenger = passengers[0] if passengers else {}
        
        # Convert journeyDate from DD-MM-YYYY to YYYY-MM-DD format
        journey_date_raw = api_data.get("journeyDate", "")
        if journey_date_raw and "-" in journey_date_raw:
            parts = journey_date_raw.split("-")
            if len(parts) == 3:
                journey_date = f"{parts[2]}-{parts[1]}-{parts[0]}"  # YYYY-MM-DD
            else:
                journey_date = journey_date_raw
        else:
            journey_date = journey_date_raw or "TBD"
        
        journey_details = JourneyDetails(
            pnr=pnr,
            train_number=str(api_data.get("trainNumber", "")).strip() or "TBD",
            train_name=api_data.get("trainName", "").strip() or "Unknown Train",
            journey_date=journey_date,
            coach=str(first_passenger.get("coach", "")).strip() or "TBD",
            berth=str(first_passenger.get("berth", "")).strip() or "TBD",
            berth_type=api_data.get("class", "3A").strip()[:2] or "3A",  # Use class as berth type
            from_station=api_data.get("source", "").strip() or api_data.get("boardingPoint", "").strip() or "TBD",
            to_station=api_data.get("destination", "").strip() or "TBD",
            departure=api_data.get("departureTime", "").strip() or "TBD",
            arrival=api_data.get("arrivalTime", "").strip() or "TBD",
            status=first_passenger.get("bookingStatus", "").strip() or "TBD",
        )
        
        print(f"[API] Successfully parsed IRCTC response:")
        print(f"      Train: {journey_details.train_number} - {journey_details.train_name}")
        print(f"      Date: {journey_details.journey_date}")
        print(f"      From: {journey_details.from_station} ({journey_details.departure})")
        print(f"      To: {journey_details.to_station} ({journey_details.arrival})")
        print(f"      Coach: {journey_details.coach}, Berth: {journey_details.berth} ({journey_details.berth_type})")
        print(f"      Status: {journey_details.status}")
        
        return journey_details
        
    except Exception as e:
        print(f"[ERROR] Error parsing IRCTC response: {e}")
        print(f"[ERROR] Raw data: {data}")
        raise
