"""Quick test of the Solver REST API service."""

import requests
import json

# Service URL
BASE_URL = "http://localhost:8002"
API_PREFIX = "/api"

def test_health():
    """Test health endpoint."""
    response = requests.get(f"{BASE_URL}/health")
    print(f"✓ Health check: {response.json()['status']}")
    return response.status_code == 200

def test_status():
    """Test status endpoint."""
    response = requests.get(f"{BASE_URL}{API_PREFIX}/status")
    data = response.json()
    print(f"✓ Service: {data['service']} v{data['version']}")
    return response.status_code == 200

def test_materials():
    """Test materials info endpoint."""
    response = requests.get(f"{BASE_URL}{API_PREFIX}/info/materials")
    data = response.json()
    print(f"✓ Materials: {len(data['materials'])} materials available")
    return response.status_code == 200

def test_single_frequency():
    """Test single frequency solve."""
    request = {
        "nodes": [[0, 0, 0], [0, 0, 0.5]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "frequency": 100e6,
        "voltage_sources": [{
            "node_start": 1,
            "node_end": 0,
            "value": 1.0,
            "impedance": 50.0
        }]
    }
    
    response = requests.post(
        f"{BASE_URL}{API_PREFIX}/solve/single",
        json=request
    )
    
    if response.status_code == 200:
        result = response.json()
        Z_in = complex(result['input_impedance']['real'], result['input_impedance']['imag'])
        print(f"✓ Single frequency solve:")
        print(f"  Input impedance: {Z_in:.2f} Ω")
        print(f"  Solve time: {result['solve_time']:.3f} s")
        return True
    else:
        print(f"✗ Single frequency failed: {response.status_code}")
        print(f"  {response.text}")
        return False

def test_frequency_sweep():
    """Test frequency sweep."""
    request = {
        "nodes": [[0, 0, 0], [0, 0, 0.5]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "frequencies": [90e6, 100e6, 110e6],
        "voltage_sources": [{
            "node_start": 1,
            "node_end": 0,
            "value": 1.0,
            "impedance": 50.0
        }],
        "reference_impedance": 50.0
    }
    
    response = requests.post(
        f"{BASE_URL}{API_PREFIX}/solve/sweep",
        json=request
    )
    
    if response.status_code == 200:
        result = response.json()
        print(f"✓ Frequency sweep:")
        print(f"  Frequencies: {len(result['frequencies'])} points")
        print(f"  VSWR range: {min(result['vswr']):.2f} - {max(result['vswr']):.2f}")
        print(f"  Total time: {result['total_solve_time']:.3f} s")
        return True
    else:
        print(f"✗ Frequency sweep failed: {response.status_code}")
        print(f"  {response.text}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Testing Solver REST API Service")
    print("=" * 60)
    print()
    
    print("Note: Start the service first with:")
    print("  uvicorn backend.solver.main:app --port 8002")
    print()
    
    try:
        tests = [
            ("Health Check", test_health),
            ("Status", test_status),
            ("Materials Info", test_materials),
            ("Single Frequency", test_single_frequency),
            ("Frequency Sweep", test_frequency_sweep),
        ]
        
        results = []
        for name, test_func in tests:
            try:
                print(f"Testing {name}...")
                success = test_func()
                results.append((name, success))
                print()
            except requests.exceptions.ConnectionError:
                print(f"✗ Connection failed - is the service running?")
                print()
                results.append((name, False))
                break
            except Exception as e:
                print(f"✗ Error: {e}")
                print()
                results.append((name, False))
        
        # Summary
        print("=" * 60)
        print("Test Summary")
        print("=" * 60)
        for name, success in results:
            status = "✓ PASS" if success else "✗ FAIL"
            print(f"{status}: {name}")
        
        passed = sum(1 for _, s in results if s)
        total = len(results)
        print()
        print(f"Total: {passed}/{total} tests passed")
        
    except KeyboardInterrupt:
        print("\n\nTests interrupted by user")
