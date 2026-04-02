# 🚂 JourneyGuard — Railway Group Travel Platform

React JS + FastAPI + Firebase · Indian Railways · Group Journey Management

---

## 📁 Project Structure

```
journeyguard/
├── frontend/                   # React JS app
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.js         # Public marketing page
│   │   │   ├── AuthPage.js            # Register / Login
│   │   │   ├── DashboardPage.js       # Main hub
│   │   │   ├── JourneyPage.js         # PNR entry + group join
│   │   │   ├── GroupPage.js           # Coach group + requests
│   │   │   └── SettingsPage.js        # User settings
│   │   ├── components/
│   │   │   ├── MainLayout.js
│   │   │   ├── Sidebar.js
│   │   │   ├── Navbar.js
│   │   │   └── BerthSelectionModal.js
│   │   ├── context/
│   │   │   └── AuthContext.js         # Firebase Auth context
│   │   ├── utils/
│   │   │   └── api.js                 # Axios wrapper → FastAPI
│   │   ├── firebase.js
│   │   └── App.js
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
│
├── backend/                    # FastAPI app
│   ├── main.py                        # App entry + CORS
│   ├── dependencies.py                # Firebase JWT verification
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── models/
│   │   └── schemas.py                 # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py                    # /auth/register, /auth/me
│   │   ├── pnr.py                     # /pnr/{pnr}
│   │   ├── journey.py                 # /journey/join, /leave
│   │   └── requests.py                # /requests (assistance CRUD)
│   └── services/
│       ├── pnr_service.py             # Railway API + mock fallback
│       └── email_service.py           # SMTP email templates
│
├── firebase-database-rules.json
├── docker-compose.yml
└── README.md
```

---

## 🚀 Quick Start

### 1. Firebase Setup

1. Go to https://console.firebase.google.com
2. Create project `journeyguard`
3. Enable **Authentication → Email/Password**
4. Enable **Realtime Database** → start in test mode
5. Set database URL: `https://journeyguard-default-rtdb.firebaseio.com/`
6. Paste `firebase-database-rules.json` → Database → Rules
7. Download **Service Account JSON**:
   Project Settings → Service Accounts → Generate New Private Key
   → save file contents to an env variable for deployment, or as `backend/firebase-credentials.json` for local dev
   - Preferred: set `FIREBASE_CREDENTIALS_JSON` in `backend/.env`
   - Fallback: set `FIREBASE_CREDENTIALS_PATH` (e.g. `firebase-credentials.json`)
8. Copy **Web App config** from Project Settings → Web Apps
   → fill into `frontend/.env`

### 2. Backend Setup

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Place your firebase-credentials.json here
cp ~/Downloads/your-service-account.json firebase-credentials.json

uvicorn main:app --reload --port 8000
# API Docs: http://localhost:8000/docs
```

### 3. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Fill in Firebase web config values from Firebase Console

npm start
# Opens http://localhost:3000
```

### 4. Docker (Full Stack)

```bash
# From project root
docker-compose up --build
# Frontend: http://localhost:3000
# Backend:  http://localhost:8000
```

---

## 🔑 Key Features

### Journey Groups
| Feature | Description |
|---------|-------------|
| PNR Lookup | Enter PNR to get train/coach/berth details |
| Join Group | Join group by train number + date + coach + berth |
| Group Chat | Real-time messages with coach group members |
| Assistance Requests | MEDICAL, FOOD, BERTH, EMERGENCY request types |

### Firebase Database Structure

```
train_groups/
  {train}_{date}/
    coach_{coach}/
      {uid}/
        passenger_id: "Passenger S5-23"
        coach: "S5"
        berth: "23"
        joined_at: 1234567890000
      requests/
        {reqId}/
          type: "MEDICAL" | "FOOD" | "BERTH" | "EMERGENCY"
          passenger_id: "Passenger S5-23"
          timestamp: 1234567890000
          uid: "{userId}"
          active: true

user_journeys/
  {uid}/
    group_id: "12727_2026-03-20"
    coach_id: "coach_S5"
    train_number: "12727"
    coach: "S5"
    berth: "23"
    started_at: 1234567890000
```

---

## 🌐 API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | ✗ | Create account |
| GET | `/auth/me` | ✓ | Get profile |
| GET | `/pnr/{pnr}` | ✓ | Fetch journey by PNR |
| POST | `/pnr/{pnr}/claim-berth` | ✓ | Select berth for PNR |
| POST | `/journey/join` | ✓ | Join train group |
| POST | `/journey/{id}/leave` | ✓ | Leave journey group |
| POST | `/requests` | ✓ | Send assistance request |
| GET | `/requests/{jid}/{cid}` | ✓ | List coach requests |
| DELETE | `/requests/{jid}/{cid}/{rid}` | ✓ | Delete own request |

All protected routes require `Authorization: Bearer <Firebase ID Token>`

---

## 🔒 Privacy & Security

- Passengers appear only as `Passenger S5-23` — no name, no phone shared
- Firebase Auth handles password hashing (bcrypt) — never stored in DB
- Database rules enforce per-user write access only to own journey data
- Groups auto-expire after journey completion

---

## 💬 How It Works

### Join a Journey
1. User logs in
2. Enters PNR number → fetches train + coach + berth from IRCTC
3. Selects their berth
4. Joins the group for that train/date/coach
5. Now part of the coach group chat + can send assistance requests

### Send Assistance Request
1. User in active journey/group
2. Selects request type: MEDICAL, FOOD, BERTH, or EMERGENCY
3. Request sent to `/requests` endpoint
4. Appears in real-time for all members of that coach/train
5. Can be deleted by requester or coach staff

### Leave Journey
1. User clicks "Leave Journey"
2. Removed from group
3. User journey metadata cleared
4. Group auto-expires after last member leaves or 1 hour timeout

---

## 📦 Dependencies

### Backend
- FastAPI 0.110.0
- Firebase Admin SDK 6.4.0
- Pydantic 2.6.3
- HTTPx 0.27.0 (for IRCTC API calls)
- Python 3.9+

### Frontend
- React 18.2.0
- Axios 1.6.7
- Firebase 10.8.0
- React Router 6.22.0
- Leaflet 1.9.4 (no longer used - kept for reference)
- Framer Motion 11.0.6
- React Hot Toast 2.4.1

---

## 🎯 What Was Removed

This is a **simplified version** with only core railway group functionality:
- ❌ Sensor-based protection mode (motion detection, charger detection)
- ❌ Live location tracking and sharing
- ❌ Admin dashboard and admin-only endpoints
- ❌ IMEI tracking
- ❌ Protection/tracking UI pages
- ❌ Public location share links

---

## 📝 License

MIT
