"""
Train lookup service for manual journey entry.

This is a best-effort wrapper around the same IRCTC RapidAPI provider already
used for PNR lookups. Different endpoints can expose slightly different field
names, so the parser normalizes the response into a stable shape for the UI.
"""
import os
import re
from html import unescape
from datetime import datetime

import httpx
from firebase_admin import db as fb_db

from models.schemas import TrainInfoResponse

IRCTC_API_KEY = os.getenv("IRCTC_API_KEY", "68ad334fc9msh44bddffcf14f1acp17032bjsn61766b1ac602")
IRCTC_API_HOST = os.getenv("IRCTC_API_HOST", "irctc1.p.rapidapi.com")
IRCTC_API_BASE = os.getenv("IRCTC_API_BASE", f"https://{IRCTC_API_HOST}")

_TRAIN_CATALOG = {
    "12724": {
        "train_name": "Telangana Express",
        "from_station": "New Delhi (NDLS)",
        "to_station": "Hyderabad Deccan Nampally (HYB)",
        "departure": "17:25",
        "arrival": "19:35 +1",
    },
    "12740": {
        "train_name": "Secunderabad - Visakhapatnam Garib Rath Express",
        "from_station": "Secunderabad Jn (SC)",
        "to_station": "Visakhapatnam Jn (VSKP)",
        "departure": "20:30",
        "arrival": "07:40 +1",
    },
    "12744": {
        "train_name": "Vikramsimhapuri Express",
        "from_station": "Vijayawada Jn (BZA)",
        "to_station": "Gudur Jn (GDR)",
        "departure": "18:00",
        "arrival": "22:45",
    },
    "12745": {
        "train_name": "SC MUGR SF EXP",
        "from_station": "Secunderabad Jn (SC)",
        "to_station": "Manuguru (MUGR)",
        "departure": "23:45",
        "arrival": "05:45 +1",
    },
    "12627": {
        "train_name": "Karnataka Express",
        "from_station": "New Delhi (NDLS)",
        "to_station": "KSR Bengaluru (SBC)",
        "departure": "19:20",
        "arrival": "12:40 +1",
    },
    "12721": {
        "train_name": "Dakshin Express",
        "from_station": "Hazrat Nizamuddin (NZM)",
        "to_station": "Hyderabad Deccan Nampally (HYB)",
        "departure": "23:00",
        "arrival": "04:55 +1",
    },
    "12727": {
        "train_name": "Godavari SF Express",
        "from_station": "Visakhapatnam Jn (VSKP)",
        "to_station": "Hyderabad Deccan Nampally (HYB)",
        "departure": "17:25",
        "arrival": "05:50 +1",
    },
    "17031": {
        "train_name": "Hyderabad - Mumbai Express",
        "from_station": "Hyderabad Deccan Nampally (HYB)",
        "to_station": "Chhatrapati Shivaji Maharaj Terminus (CSMT)",
        "departure": "08:05",
        "arrival": "22:45",
    },
    "12163": {
        "train_name": "LTT Chennai Express",
        "from_station": "Lokmanya Tilak Terminus (LTT)",
        "to_station": "MGR Chennai Central (MAS)",
        "departure": "22:30",
        "arrival": "21:45 +1",
    },
}


def _headers() -> dict:
    return {
        "x-api-key": IRCTC_API_KEY,
        "x-api-host": IRCTC_API_HOST,
        "x-rapidapi-key": IRCTC_API_KEY,
        "x-rapidapi-host": IRCTC_API_HOST,
        "Content-Type": "application/json",
    }


def _date_variants(journey_date: str) -> tuple[str, str]:
    try:
        parsed = datetime.strptime(journey_date, "%Y-%m-%d")
        return parsed.strftime("%d-%m-%Y"), parsed.strftime("%Y%m%d")
    except ValueError:
        return journey_date, journey_date.replace("-", "")


def _first_value(payload: dict, keys: list[str], default=None):
    for key in keys:
        value = payload.get(key)
        if value not in (None, "", [], {}):
            return value
    return default


def _normalize_payload(payload):
    if isinstance(payload, dict):
        return payload
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                return item
    return {}


def _find_nested_value(payload, keys: list[str], default=None):
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if value not in (None, "", [], {}):
                return value
        for value in payload.values():
            found = _find_nested_value(value, keys, default=None)
            if found not in (None, "", [], {}):
                return found
    elif isinstance(payload, list):
        for item in payload:
            found = _find_nested_value(item, keys, default=None)
            if found not in (None, "", [], {}):
                return found
    return default


def _extract_route_summary(payload):
    if isinstance(payload, dict):
        for key in ["route", "routes", "stations", "station_list", "trainRoute", "stops"]:
            route = payload.get(key)
            if isinstance(route, list) and route:
                dict_stops = [item for item in route if isinstance(item, dict)]
                if dict_stops:
                    first_stop = dict_stops[0]
                    last_stop = dict_stops[-1]
                    return {
                        "from_station": _find_nested_value(
                            first_stop,
                            ["stationName", "station_name", "name", "source", "fromStation", "stnName"],
                        ),
                        "to_station": _find_nested_value(
                            last_stop,
                            ["stationName", "station_name", "name", "destination", "toStation", "stnName"],
                        ),
                        "departure": _find_nested_value(
                            first_stop,
                            ["departureTime", "departure", "depTime", "std", "sourceDepartureTime"],
                        ),
                        "arrival": _find_nested_value(
                            last_stop,
                            ["arrivalTime", "arrival", "arrTime", "sta", "destinationArrivalTime"],
                        ),
                    }
        for value in payload.values():
            route_summary = _extract_route_summary(value)
            if route_summary:
                return route_summary
    elif isinstance(payload, list):
        for item in payload:
            route_summary = _extract_route_summary(item)
            if route_summary:
                return route_summary
    return None


def _lookup_cached_train_details(train_number: str):
    try:
        pnr_data = fb_db.reference("pnr_data").get() or {}
        for item in pnr_data.values():
            if isinstance(item, dict) and str(item.get("train_number", "")).strip() == train_number:
                return {
                    "train_name": item.get("train_name"),
                    "from_station": item.get("from_station"),
                    "to_station": item.get("to_station"),
                    "departure": item.get("departure"),
                    "arrival": item.get("arrival"),
                }
    except Exception:
        pass
    return None


def _load_train_number_cache(train_number: str):
    try:
        cached = fb_db.reference(f"train_master/{train_number}").get()
        if isinstance(cached, dict):
            return cached
    except Exception:
        pass
    return None


def _store_train_cache(parsed: TrainInfoResponse, source: str):
    now_iso = datetime.now().isoformat()
    train_number = str(parsed.train_number).strip()
    journey_date = str(parsed.journey_date).strip()

    date_payload = {
        **parsed.model_dump(),
        "fetched_at": now_iso,
        "cache_source": source,
    }
    fb_db.reference(f"train_info/{train_number}_{journey_date}").set(date_payload)

    # Train-level cache is shared across all users and reused for later dates.
    master_ref = fb_db.reference(f"train_master/{train_number}")
    master_payload = {
        "train_number": train_number,
        "train_name": parsed.train_name,
        "from_station": parsed.from_station,
        "to_station": parsed.to_station,
        "departure": parsed.departure,
        "arrival": parsed.arrival,
        "current_status": parsed.current_status,
        "current_station": parsed.current_station,
        "next_station_name": parsed.next_station_name,
        "expected_arrival": parsed.expected_arrival,
        "speed": parsed.speed,
        "cancelled": parsed.cancelled,
        "route_changed": parsed.route_changed,
        "api_message": parsed.api_message,
        "fetched_at": now_iso,
        "last_journey_date": journey_date,
        "cache_source": source,
    }
    master_ref.update(master_payload)
    master_ref.child("requested_dates").child(journey_date).set({
        "seen": True,
        "last_seen_at": now_iso,
    })


def _lookup_catalog_train_details(train_number: str):
    return _TRAIN_CATALOG.get(str(train_number).strip())


def _clean_text(value: str | None) -> str | None:
    if not value:
        return None
    text = unescape(value)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def _extract_confirmtkt_train(html: str, train_number: str):
    text = _clean_text(html) or ""

    name_match = re.search(rf"{re.escape(train_number)}\s*-\s*([A-Za-z0-9 .&()/-]+?)\s+(?:Change|Train Route)", text, re.IGNORECASE)
    route_match = re.search(
        rf"Train\s+{re.escape(train_number)}\s+.*?\s+runs\s+from\s+(.+?)\s*\([A-Z]+\)\s+to\s+(.+?)\s*\([A-Z]+\)",
        text,
        re.IGNORECASE,
    )
    timing_match = re.search(
        r"departs from .*? at ([0-9]{1,2}:[0-9]{2}) and reaches .*? at ([0-9]{1,2}:[0-9]{2})",
        text,
        re.IGNORECASE,
    )

    if not route_match:
        route_match = re.search(rf"{re.escape(train_number)}\s*-\s*.*?\s+([A-Za-z .()]+?)\s+to\s+([A-Za-z .()]+?)\s+Running Days", text, re.IGNORECASE)

    train_name = _clean_text(name_match.group(1)) if name_match else None
    from_station = _clean_text(route_match.group(1)) if route_match else None
    to_station = _clean_text(route_match.group(2)) if route_match else None
    departure = timing_match.group(1) if timing_match else None
    arrival = timing_match.group(2) if timing_match else None

    if train_name or from_station or to_station:
        return {
            "train_name": train_name,
            "from_station": from_station,
            "to_station": to_station,
            "departure": departure,
            "arrival": arrival,
        }

    return None


async def _scrape_train_metadata(train_number: str):
    sources = [
        ("confirmtkt", f"https://www.confirmtkt.com/train-schedule/{train_number}"),
        ("erail", f"https://erail.in/train-enquiry/{train_number}"),
    ]

    async with httpx.AsyncClient(timeout=12, follow_redirects=True) as client:
        for source_name, url in sources:
            try:
                response = await client.get(
                    url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                )
                if response.status_code != 200:
                    continue

                html = response.text
                if source_name == "confirmtkt":
                    parsed = _extract_confirmtkt_train(html, train_number)
                else:
                    parsed = None

                if parsed and any(parsed.values()):
                    return parsed, f"scraped_{source_name}"
            except Exception:
                continue

    return None, None


def _to_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"true", "yes", "1", "cancelled", "canceled", "diverted", "changed"}
    return False


def _parse_train_info(train_number: str, journey_date: str, payload: dict, endpoint_name: str) -> TrainInfoResponse:
    data = payload.get("data", payload) or {}
    normalized = _normalize_payload(data)
    route_summary = _extract_route_summary(data) or {}

    train_name = _find_nested_value(normalized, ["trainName", "name", "train_name", "trainFullName"])
    from_station = _find_nested_value(
        normalized,
        ["source", "fromStation", "sourceStation", "boardingPoint", "from", "sourceStationName"],
    ) or route_summary.get("from_station")
    to_station = _find_nested_value(
        normalized,
        ["destination", "toStation", "destinationStation", "to", "destinationStationName"],
    ) or route_summary.get("to_station")
    departure = _find_nested_value(
        normalized,
        ["departureTime", "fromStd", "departure", "sourceDepartureTime", "depTime", "std"],
    ) or route_summary.get("departure")
    arrival = _find_nested_value(
        normalized,
        ["arrivalTime", "toStd", "arrival", "destinationArrivalTime", "arrTime", "sta"],
    ) or route_summary.get("arrival")
    current_status = _first_value(
        normalized,
        ["currentStatus", "status", "statusMessage", "runningStatus", "trainStatus"],
        "Scheduled",
    )
    current_station = _find_nested_value(
        normalized,
        ["currentStation", "current_station", "currentStationName", "current_station_name", "lastLocation"],
    )
    next_station_name = _find_nested_value(
        normalized,
        ["nextStation", "next_station", "nextStationName", "upcomingStation", "upcoming_station"],
    )
    expected_arrival = _find_nested_value(
        normalized,
        ["expectedArrival", "eta", "expected_arrival", "nextStationEta", "upcomingStationEta"],
    )
    speed = _find_nested_value(
        normalized,
        ["speed", "trainSpeed", "currentSpeed", "avgSpeed"],
    )

    raw_cancelled = _find_nested_value(normalized, ["isCancelled", "cancelled", "trainCancelled", "cancelStatus"], False)
    raw_route_changed = _find_nested_value(
        normalized,
        ["routeChanged", "isRouteChanged", "diverted", "route_change", "route_changed"],
        False,
    )

    cancelled = _to_bool(raw_cancelled) or "cancel" in str(current_status).lower()
    route_changed = _to_bool(raw_route_changed) or any(
        token in str(current_status).lower() for token in ["divert", "route changed", "rescheduled"]
    )

    train_exists = bool(
        train_name
        or from_station
        or to_station
        or _find_nested_value(normalized, ["trainNumber", "trainNo", "number", "train_number"])
    )

    return TrainInfoResponse(
        train_exists=train_exists,
        train_number=train_number,
        journey_date=journey_date,
        train_name=train_name,
        from_station=from_station,
        to_station=to_station,
        departure=departure,
        arrival=arrival,
        current_status=current_status,
        current_station=current_station,
        next_station_name=next_station_name,
        expected_arrival=expected_arrival,
        speed=str(speed) if speed not in (None, "") else None,
        cancelled=cancelled,
        route_changed=route_changed,
        api_message=f"Fetched from {endpoint_name}",
    )


async def get_train_info(train_number: str, journey_date: str, refresh: bool = False) -> TrainInfoResponse:
    cache_key = f"{train_number}_{journey_date}"
    cache_ref = fb_db.reference(f"train_info/{cache_key}")
    cached = cache_ref.get()

    if not refresh and cached and cached.get("fetched_at"):
        try:
            fetched_at = datetime.fromisoformat(cached["fetched_at"])
            if (datetime.now() - fetched_at).total_seconds() < 900:
                return TrainInfoResponse(**{k: v for k, v in cached.items() if k != "fetched_at"})
        except Exception:
            pass

    if not refresh:
        shared_cached = _load_train_number_cache(train_number)
        if shared_cached and shared_cached.get("fetched_at"):
            try:
                parsed = TrainInfoResponse(
                    train_exists=True,
                    train_number=train_number,
                    journey_date=journey_date,
                    train_name=shared_cached.get("train_name"),
                    from_station=shared_cached.get("from_station"),
                    to_station=shared_cached.get("to_station"),
                    departure=shared_cached.get("departure"),
                    arrival=shared_cached.get("arrival"),
                    current_status=shared_cached.get("current_status"),
                    current_station=shared_cached.get("current_station"),
                    next_station_name=shared_cached.get("next_station_name"),
                    expected_arrival=shared_cached.get("expected_arrival"),
                    speed=shared_cached.get("speed"),
                    cancelled=bool(shared_cached.get("cancelled", False)),
                    route_changed=bool(shared_cached.get("route_changed", False)),
                    api_message="Fetched from shared train database cache",
                )
                _store_train_cache(parsed, source="shared_train_cache")
                return parsed
            except Exception:
                pass

    date_ddmmyyyy, date_compact = _date_variants(journey_date)
    candidate_requests = [
        ("liveTrainStatus", {"trainNo": train_number, "date": date_ddmmyyyy}),
        ("liveTrainStatus", {"trainNo": train_number, "startDay": 1, "date": date_ddmmyyyy}),
        ("liveTrainStatus", {"train_number": train_number, "date": date_ddmmyyyy}),
        ("trainSchedule", {"trainNo": train_number}),
        ("trainSchedule", {"train_number": train_number}),
        ("trainRoute", {"trainNo": train_number}),
        ("trainRoute", {"train_number": train_number}),
        ("trainInfo", {"trainNo": train_number}),
        ("trainInfo", {"train_number": train_number}),
        ("trainStatus", {"trainNo": train_number, "doj": date_compact}),
    ]

    async with httpx.AsyncClient(timeout=12) as client:
        for endpoint_name, params in candidate_requests:
            try:
                response = await client.get(
                    f"{IRCTC_API_BASE}/{endpoint_name}",
                    params=params,
                    headers=_headers(),
                )
                if response.status_code != 200:
                    continue

                payload = response.json()
                if payload.get("success") is False and not payload.get("data"):
                    continue

                parsed = _parse_train_info(train_number, journey_date, payload, endpoint_name)
                if parsed.train_exists:
                    _store_train_cache(parsed, source=endpoint_name)
                    return parsed
            except Exception:
                continue

    cached_train = _lookup_cached_train_details(train_number)
    if cached_train and any(cached_train.values()):
        parsed = TrainInfoResponse(
            train_exists=True,
            train_number=train_number,
            journey_date=journey_date,
            train_name=cached_train.get("train_name"),
            from_station=cached_train.get("from_station"),
            to_station=cached_train.get("to_station"),
            departure=cached_train.get("departure"),
            arrival=cached_train.get("arrival"),
            current_status="Cached details",
            current_station=None,
            next_station_name=None,
            expected_arrival=cached_train.get("arrival"),
            speed=None,
            cancelled=False,
            route_changed=False,
            api_message="Fetched from cached PNR details",
        )
        _store_train_cache(parsed, source="cached_pnr_details")
        return parsed

    catalog_train = _lookup_catalog_train_details(train_number)
    if catalog_train:
        parsed = TrainInfoResponse(
            train_exists=True,
            train_number=train_number,
            journey_date=journey_date,
            train_name=catalog_train.get("train_name"),
            from_station=catalog_train.get("from_station"),
            to_station=catalog_train.get("to_station"),
            departure=catalog_train.get("departure"),
            arrival=catalog_train.get("arrival"),
            current_status="Catalog fallback",
            current_station=None,
            next_station_name=None,
            expected_arrival=catalog_train.get("arrival"),
            speed=None,
            cancelled=False,
            route_changed=False,
            api_message="Fetched from local fallback catalog",
        )
        _store_train_cache(parsed, source="local_catalog")
        return parsed

    scraped_train, scraped_source = await _scrape_train_metadata(train_number)
    if scraped_train:
        parsed = TrainInfoResponse(
            train_exists=True,
            train_number=train_number,
            journey_date=journey_date,
            train_name=scraped_train.get("train_name"),
            from_station=scraped_train.get("from_station"),
            to_station=scraped_train.get("to_station"),
            departure=scraped_train.get("departure"),
            arrival=scraped_train.get("arrival"),
            current_status="Scraped metadata",
            current_station=None,
            next_station_name=None,
            expected_arrival=scraped_train.get("arrival"),
            speed=None,
            cancelled=False,
            route_changed=False,
            api_message="Fetched from public train schedule page",
        )
        _store_train_cache(parsed, source=scraped_source or "scraped_metadata")
        return parsed

    raise ValueError(f"Train {train_number} was not found for {journey_date}")
