import http.client
import json

conn = http.client.HTTPSConnection("irctc1.p.rapidapi.com")

headers = {
    'x-api-key': "68ad334fc9msh44bddffcf14f1acp17032bjsn61766b1ac602",
    'x-api-host': "irctc1.p.rapidapi.com",
    'x-rapidapi-key': "68ad334fc9msh44bddffcf14f1acp17032bjsn61766b1ac602",
    'x-rapidapi-host': "irctc1.p.rapidapi.com",
    'Content-Type': "application/json"
}

# Test with your PNR
pnr = "4754390314"
print(f"\n=== Testing IRCTC API for PNR: {pnr} ===\n")

conn.request("GET", f"/pnrStatus?pnr={pnr}", headers=headers)

res = conn.getresponse()
data = res.read()

print(f"Status Code: {res.status}")
print(f"\nRaw Response:")
response_str = data.decode("utf-8")
print(response_str)

# Try to parse as JSON if status is 200
if res.status == 200:
    try:
        json_data = json.loads(response_str)
        print(f"\nParsed JSON (Pretty):")
        print(json.dumps(json_data, indent=2))
    except:
        print("Could not parse as JSON")
