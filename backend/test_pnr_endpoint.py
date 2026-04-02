#!/usr/bin/env python3
import asyncio
import httpx
import json
import os
import sys

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Test the no-booking PNR directly
async def test_no_booking_pnr():
    from services.pnr_service_new import get_pnr_details
    
    print("\n=== Testing get_pnr_details directly ===")
    try:
        result = await get_pnr_details("4754390311", user_id="test_user")
        print(f"Result: {result}")
    except Exception as e:
        print(f"Exception caught: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        error_msg = str(e).lower()
        print(f"Contains 'not found': {'not found' in error_msg}")
        print(f"Contains 'no booking': {'no booking' in error_msg}")

if __name__ == "__main__":
    asyncio.run(test_no_booking_pnr())
