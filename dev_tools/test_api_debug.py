"""Test the API with debug visualization."""

import os
import time
import requests
import subprocess
import signal

# Enable debug mode
os.environ['PREPROCESSOR_DEBUG'] = 'true'

print("Starting preprocessor service with DEBUG enabled...")
print("="*60)

# Start the server in a subprocess
server_process = subprocess.Popen(
    [
        r"C:/Users/knue/Documents/AntennaEducator/.venv/Scripts/python.exe",
        "-m", "backend.preprocessor.main"
    ],
    cwd=r"C:\Users\knue\Documents\AntennaEducator",
    env={**os.environ, 'PREPROCESSOR_DEBUG': 'true'}
)

# Wait for server to start
print("Waiting for server to start...")
time.sleep(3)

try:
    # Test 1: Basic dipole
    print("\n### Test 1: Creating basic dipole ###")
    response = requests.post(
        "http://localhost:8001/api/antenna/dipole",
        json={"length": 0.5, "segments": 5}
    )
    print(f"Response: {response.status_code}")
    
    time.sleep(1)
    
    # Test 2: Dipole with gap
    print("\n### Test 2: Creating dipole with gap ###")
    response = requests.post(
        "http://localhost:8001/api/antenna/dipole",
        json={
            "length": 1.0,
            "gap": 0.01,
            "segments": 7,
            "source": {
                "type": "voltage",
                "amplitude": {"real": 1.0, "imag": 0.0}
            }
        }
    )
    print(f"Response: {response.status_code}")
    
    time.sleep(1)
    
finally:
    print("\n" + "="*60)
    print("Stopping server...")
    server_process.terminate()
    server_process.wait(timeout=2)
    print("Done!")
