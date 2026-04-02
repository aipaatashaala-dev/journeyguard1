#!/usr/bin/env python3
from datetime import datetime

def test_date_fix():
    """Test the stale date detection"""
    
    journey_date = "14-03-2026"
    today = datetime.now().date()
    
    parts = journey_date.split("-")
    day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
    date_obj = datetime(year, month, day)
    
    days_diff = (date_obj.date() - today).days
    
    print(f"Journey Date: {journey_date}")
    print(f"Today: {today}")
    print(f"Days Difference: {days_diff} days")
    print(f"Is stale (>5 days past)? {days_diff < -5}")
    
    if days_diff <= -5:
        fixed_date = today.strftime("%d-%m-%Y")
        print(f"✅ Fixed! New Date: {fixed_date}")
    else:
        print(f"❌ Date is valid, no fix needed")

if __name__ == "__main__":
    test_date_fix()
