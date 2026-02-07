"""Direct test of projects service to see error details."""
import os
import sys
import logging

# Set environment before importing
os.environ["DISABLE_AUTH"] = "true"

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Configure logging to see everything
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

from backend.projects.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

print("\n" + "="*80)
print("Testing GET /api/projects endpoint")
print("="*80)

try:
    response = client.get("/api/projects")
    print(f"\nStatus Code: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Content: {response.text}")
    
    if response.status_code != 200:
        print("\n⚠️ ERROR DETECTED!")
        print(f"Response: {response.json() if response.headers.get('content-type') == 'application/json' else response.text}")
except Exception as e:
    print(f"\n❌ EXCEPTION: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "="*80)
