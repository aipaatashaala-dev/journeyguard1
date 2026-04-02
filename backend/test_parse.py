#!/usr/bin/env python
# Test parsing the IRCTC API response
api_response = {
    "success": True,
    "data": {
        "pnr": "4754390316",
        "trainNumber": "12862",
        "trainName": "MBNR VSKP SF EXP",
        "journeyDate": "18-03-2026",
        "bookingDate": "06-03-2026",
        "source": "KCG",
        "destination": "TDD",
        "boardingPoint": "KCG",
        "class": "3E",
        "chartPrepared": True,
        "trainStatus": "Status not available",
        "departureTime": "17:55",
        "arrivalTime": "01:53",
        "duration": "7:58",
        "passengers": [
            {
                "number": 1,
                "bookingStatus": "GNWL  45",
                "currentStatus": "GNWL  14",
                "coach": "N/A",
                "berth": 14
            }
        ],
        "fare": {
            "bookingFare": "750",
            "ticketFare": "750"
        },
        "ratings": {
            "overall": 4.2,
            "food": 3.8,
            "punctuality": 4.4,
            "cleanliness": 4.3,
            "ratingCount": 2620
        },
        "hasPantry": False,
        "isCancelled": False
    }
}

# Parse like the service does
pnr = "4754390316"
irctc_data = api_response.get("data", {})

# Get coach from passengers if available
coach = "S1"
if irctc_data.get("passengers"):
    coach = irctc_data["passengers"][0].get("coach", "S1")

result = {
    "pnr": pnr,
    "train_number": irctc_data.get("trainNumber", "TBD"),
    "train_name": irctc_data.get("trainName", "Unknown Train"),
    "journey_date": irctc_data.get("journeyDate", "TBD"),
    "coach": coach,
    "from_station": irctc_data.get("source", irctc_data.get("boardingPoint", "TBD")),
    "to_station": irctc_data.get("destination", "TBD"),
    "departure": irctc_data.get("departureTime", "TBD"),
    "arrival": irctc_data.get("arrivalTime", "TBD"),
}

import json
print("PARSED RESULT:")
print(json.dumps(result, indent=2))
