from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str

    @field_validator("password")
    @classmethod
    def pw_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, info):
        if v != info.data.get("password"):
            raise ValueError("Passwords do not match")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SetPasswordRequest(BaseModel):
    password: str
    confirm_password: str

    @field_validator("password")
    @classmethod
    def pw_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, info):
        if v != info.data.get("password"):
            raise ValueError("Passwords do not match")
        return v


class UpdateUserProfileRequest(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None

    @field_validator("email")
    @classmethod
    def valid_email(cls, v):
        if v and "@" not in v:
            raise ValueError("Invalid email format")
        return v

    @field_validator("display_name")
    @classmethod
    def valid_display_name(cls, v):
        if v is None:
            return None
        value = str(v).strip()
        if not value:
            raise ValueError("Display name cannot be empty")
        if len(value) > 40:
            raise ValueError("Display name must be 40 characters or fewer")
        return value


class JoinJourneyRequest(BaseModel):
    train_number: str
    journey_date: str          # YYYY-MM-DD
    run_date: Optional[str] = None
    coach: str
    berth: str
    arrival_time: Optional[str] = None
    berth_status: Optional[str] = None
    join_mode: Optional[str] = None

    @field_validator("berth_status")
    @classmethod
    def valid_berth_status(cls, v):
        if v is None or str(v).strip() == "":
            return None
        value = str(v).strip().upper()
        allowed = {"CONFIRMED", "RAC"}
        if value not in allowed:
            raise ValueError(f"berth_status must be one of {allowed}")
        return value

    @field_validator("join_mode")
    @classmethod
    def valid_join_mode(cls, v):
        if v is None or str(v).strip() == "":
            return None
        value = str(v).strip().lower()
        allowed = {"manual", "pnr", "general", "pnr_fallback"}
        if value not in allowed:
            raise ValueError(f"join_mode must be one of {allowed}")
        return value


class TrainInfoResponse(BaseModel):
    train_exists: bool
    train_number: str
    journey_date: str
    run_date: Optional[str] = None
    requested_journey_date: Optional[str] = None
    train_name: Optional[str] = None
    from_station: Optional[str] = None
    to_station: Optional[str] = None
    departure: Optional[str] = None
    arrival: Optional[str] = None
    current_status: Optional[str] = None
    current_station: Optional[str] = None
    next_station_name: Optional[str] = None
    expected_arrival: Optional[str] = None
    speed: Optional[str] = None
    cancelled: bool = False
    route_changed: bool = False
    api_message: Optional[str] = None
    route_stations: Optional[List["TrainRouteStation"]] = None
    requires_run_date_selection: bool = False
    run_date_options: Optional[List[str]] = None


class TrainRouteStation(BaseModel):
    index: int
    name: str
    code: Optional[str] = None
    arrival: Optional[str] = None
    departure: Optional[str] = None
    platform: Optional[str] = None
    distance_km: Optional[str] = None


# ── PNR Multi-Berth ─────────────────────────────────────────────────────────
class BerthSlot(BaseModel):
    berth_number: str
    berth_type: str
    passenger_name: Optional[str] = None
    status: str  # CNF | RAC | WL | AVAILABLE | CLAIMED
    claimed_by: Optional[str] = None
    claimed_at: Optional[int] = None


class PNRDetailsResponse(BaseModel):
    pnr: str
    train_number: str
    train_name: str
    journey_date: str
    run_date: Optional[str] = None
    current_status: Optional[str] = None
    cancelled: bool = False
    selected_berth: Optional[str] = None
    coach: str
    from_station: str
    to_station: str
    departure: str
    arrival: str
    berth: Optional[str] = None  # Passenger's booked berth from API
    all_berths: Optional[List[BerthSlot]] = None  # All berths for this PNR
    available_berths: Optional[List[str]] = None  # List of available berth numbers


class ClaimBerthRequest(BaseModel):
    berth_number: str


# ── Assistance Requests ──────────────────────────────────────────────────────
class AssistanceRequestCreate(BaseModel):
    journey_id: str
    coach_id: str
    request_type: str
    message: Optional[str] = None
    location_link: Optional[str] = None
    google_maps_url: Optional[str] = None
    expires_at: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None

    @field_validator("request_type")
    @classmethod
    def valid_type(cls, v):
        allowed = {"MEDICAL", "FOOD", "FOOD_NEED", "FOOD_HAS", "BERTH", "EMERGENCY", "LOCATION", "CHAT"}
        if v.upper() not in allowed:
            raise ValueError(f"request_type must be one of {allowed}")
        return v.upper()


class AssistanceRequestUpdate(BaseModel):
    message: Optional[str] = None
    location_link: Optional[str] = None
    google_maps_url: Optional[str] = None
    expires_at: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None


class StartLocationRequest(BaseModel):
    journey_id: str
    passenger_id: str
    train_number: str
    journey_date: str
    user_email: Optional[str] = None


class UpdateLocationRequest(BaseModel):
    journey_id: str
    lat: float
    lng: float
    accuracy: Optional[float] = None


class LocationLinkResponse(BaseModel):
    tracking_link: str
    journey_id: str
    expires_at: Optional[str] = None


class GroupAIReplyRequest(BaseModel):
    journey_id: str
    coach_id: str
    message: str
    train_number: Optional[str] = None
    journey_date: Optional[str] = None
    train_name: Optional[str] = None
    from_station: Optional[str] = None
    to_station: Optional[str] = None
    current_station: Optional[str] = None
    next_station_name: Optional[str] = None
    expected_arrival: Optional[str] = None
    speed: Optional[str] = None


class AIThreadMessage(BaseModel):
    id: str
    role: str
    content: str
    timestamp: int
    sender_label: Optional[str] = None
    is_ai: bool = False


class AIThreadResponse(BaseModel):
    messages: List[AIThreadMessage]
    journey_id: str
    coach_id: str


# ── Journey Details ────────────────────────────────────────────────────────────
class JourneyDetails(BaseModel):
    pnr: str
    train_number: str
    train_name: str
    journey_date: str
    coach: str
    berth: str
    berth_type: str
    from_station: str
    to_station: str
    departure: str
    arrival: str
    status: str


class AdminOtpRequest(BaseModel):
    email: EmailStr


class AdminOtpVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class AdminAuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    admin_email: EmailStr
    expires_at: int


class UserResponse(BaseModel):
    uid: str
    email: str
    mobile_number: Optional[str] = ""
    created_at: Optional[int] = 0
    active_group_id: Optional[str] = ""
    active_coach_id: Optional[str] = ""
    passenger_id: Optional[str] = ""


class JourneyResponse(BaseModel):
    group_id: str
    train_number: str
    date: str
    passenger_count: int
    coach_count: int
    status: Optional[str] = "active"
    cleanup_at: Optional[int] = None


class LocationResponse(BaseModel):
    id: str
    passenger_id: str
    train_number: str
    coach: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None
    updated_at: Optional[int] = 0


class RequestResponse(BaseModel):
    id: str
    group_id: str
    passenger_id: str
    type: str
    timestamp: int


class ProtectionCommandRequest(BaseModel):
    location_enabled: bool = False
    source: str = "remote-dashboard"


class ProtectionLocationUpdateRequest(BaseModel):
    lat: float
    lng: float
    accuracy: Optional[float] = None
    location_enabled: bool = True
    source: str = "remote-dashboard"


class ProtectionStateResponse(BaseModel):
    active: bool = False
    location_enabled: bool = False
    email: Optional[str] = None
    updated_at: Optional[int] = 0
    started_at: Optional[int] = 0
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None
    source: Optional[str] = None
    ring_requested_at: Optional[int] = 0
    ring_stop_requested_at: Optional[int] = 0
