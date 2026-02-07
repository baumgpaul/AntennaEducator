"""
Integration test for preprocessor → solver pipeline.

Tests the complete workflow from antenna geometry generation through electromagnetic solving.
"""

import pytest
import requests
import time
import numpy as np
from typing import Dict, Any


# Service URLs
PREPROCESSOR_URL = "http://localhost:8001"
SOLVER_URL = "http://localhost:8002"
API_PREFIX = "/api"


def extract_mesh_from_preprocessor_response(response):
    """Extract mesh data from preprocessor response."""
    data = response.json()
    return data["mesh"]


def parse_complex(value):
    """Parse complex number from API response (can be string or dict)."""
    if isinstance(value, str):
        # Parse string format like "(50-10j)"
        return complex(value.replace('(', '').replace(')', ''))
    elif isinstance(value, dict):
        # Parse dict format like {"real": 50, "imag": -10}
        return complex(value["real"], value["imag"])
    elif isinstance(value, (int, float, complex)):
        return complex(value)
    else:
        raise ValueError(f"Cannot parse complex from {type(value)}: {value}")


class TestPreprocessorSolverPipeline:
    """Integration tests for the complete antenna analysis pipeline."""
    
    @pytest.fixture(scope="class", autouse=True)
    def check_services_running(self):
        """Verify both services are running before tests."""
        services = [
            ("Preprocessor", PREPROCESSOR_URL),
            ("Solver", SOLVER_URL)
        ]
        
        for name, url in services:
            try:
                response = requests.get(f"{url}/health", timeout=2)
                assert response.status_code == 200, f"{name} health check failed"
            except requests.exceptions.RequestException as e:
                pytest.skip(f"{name} service not running at {url}: {e}")
    
    def test_dipole_complete_analysis(self):
        """
        Test complete dipole antenna analysis through both services.
        
        Flow:
        1. Generate dipole geometry (preprocessor)
        2. Solve at single frequency (solver)
        3. Validate results
        """
        # Step 1: Generate dipole geometry
        dipole_request = {
            "length": 1.5,  # meters
            "wire_radius": 0.001,  # 1mm wire
            "gap": 0.001,  # 1mm feed gap
            "segments": 10  # segments per half
        }
        
        response = requests.post(
            f"{PREPROCESSOR_URL}{API_PREFIX}/antenna/dipole",
            json=dipole_request
        )
        assert response.status_code == 200, f"Preprocessor failed: {response.text}"
        geometry = extract_mesh_from_preprocessor_response(response)
        
        # Validate preprocessor output
        assert "nodes" in geometry
        assert "edges" in geometry
        assert "radii" in geometry
        assert len(geometry["nodes"]) == 22  # 2*(segments+1) for two halves
        assert len(geometry["edges"]) == 20  # 2*segments
        assert len(geometry["radii"]) == 20
        
        # Step 2: Solve at resonant frequency
        # Feed is at gap (1-based indexing: node 1 of upper half, node 12 of lower half)
        solver_request = {
            "nodes": geometry["nodes"],
            "edges": geometry["edges"],
            "radii": geometry["radii"],
            "frequency": 100e6,  # 100 MHz
            "voltage_sources": [{
                "node_start": 1,  # first node of upper half (1-based)
                "node_end": 12,  # first node of lower half (1-based)
                "value": 1.0,
                "impedance": 50.0
            }]
        }
        
        response = requests.post(
            f"{SOLVER_URL}/api/solve/single",
            json=solver_request
        )
        assert response.status_code == 200, f"Solver failed: {response.text}"
        result = response.json()
        
        # Validate solver output structure
        assert "frequency" in result
        assert "input_impedance" in result
        assert "branch_currents" in result
        
        # Validate physical results
        Z_in = parse_complex(result["input_impedance"])
        assert abs(Z_in) > 0, "Input impedance should be non-zero"
        assert abs(Z_in) < 10000, "Input impedance seems unreasonably high"
        
        # Check currents are non-zero
        branch_currents = [parse_complex(c) for c in result["branch_currents"]]
        assert any(abs(c) > 1e-6 for c in branch_currents), "Branch currents should be non-zero"
        
        print(f"\n✓ Dipole analysis complete:")
        print(f"  Input impedance: {Z_in:.2f} Ω")
        print(f"  Max current: {max(abs(c) for c in branch_currents):.6f} A")
    
    def test_dipole_frequency_sweep(self):
        """
        Test frequency sweep analysis through both services.
        
        Tests VSWR calculation and multi-frequency response.
        """
        # Generate geometry
        dipole_request = {
            "length": 1.5,
            "wire_radius": 0.001,
            "gap": 0.001,
            "segments": 10
        }
        
        response = requests.post(
            f"{PREPROCESSOR_URL}/api/antenna/dipole",
            json=dipole_request
        )
        assert response.status_code == 200
        geometry = extract_mesh_from_preprocessor_response(response)
        
        # Frequency sweep
        solver_request = {
            "nodes": geometry["nodes"],
            "edges": geometry["edges"],
            "radii": geometry["radii"],
            "frequencies": [90e6, 100e6, 110e6],  # 90-110 MHz
            "voltage_sources": [{
                "node_start": 1,
                "node_end": 12,
                "value": 1.0,
                "impedance": 50.0
            }],
            "reference_impedance": 50.0
        }
        
        response = requests.post(
            f"{SOLVER_URL}/api/solve/sweep",
            json=solver_request
        )
        assert response.status_code == 200, f"Sweep failed: {response.text}"
        result = response.json()
        
        # Validate sweep structure
        assert len(result["frequencies"]) == 3
        assert len(result["vswr"]) == 3
        assert len(result["frequency_solutions"]) == 3
        
        # Validate VSWR values
        for vswr in result["vswr"]:
            assert vswr >= 1.0, "VSWR must be >= 1.0"
            assert vswr < 100, "VSWR seems unreasonably high"
        
        # Validate monotonic frequency
        assert result["frequencies"] == sorted(result["frequencies"])
        
        print(f"\n✓ Frequency sweep complete:")
        print(f"  VSWR range: {min(result['vswr']):.2f} - {max(result['vswr']):.2f}")
        print(f"  Total solve time: {result['total_solve_time']:.3f} s")
    
    def test_monopole_with_ground_plane(self):
        """Test rod (monopole) geometry generation and solving."""
        # Generate rod (vertical element)
        rod_request = {
            "length": 0.75,  # quarter-wave at 100 MHz
            "wire_radius": 0.001,
            "segments": 15
        }
        
        response = requests.post(
            f"{PREPROCESSOR_URL}{API_PREFIX}/antenna/rod",
            json=rod_request
        )
        assert response.status_code == 200
        geometry = extract_mesh_from_preprocessor_response(response)
        
        # Solve
        solver_request = {
            "nodes": geometry["nodes"],
            "edges": geometry["edges"],
            "radii": geometry["radii"],
            "frequency": 100e6,
            "voltage_sources": [{
                "node_start": 1,
                "node_end": 0,
                "value": 1.0,
                "impedance": 50.0
            }]
        }
        
        response = requests.post(
            f"{SOLVER_URL}/api/solve/single",
            json=solver_request
        )
        assert response.status_code == 200
        result = response.json()
        
        Z_in = parse_complex(result["input_impedance"])
        print(f"\n✓ Rod antenna analysis complete:")
        print(f"  Input impedance: {Z_in:.2f} Ω")
    
    def test_loop_antenna_analysis(self):
        """Test loop antenna through complete pipeline."""
        # Generate loop
        loop_request = {
            "radius": 0.2,  # 20cm radius
            "wire_radius": 0.001,
            "segments": 20
        }
        
        response = requests.post(
            f"{PREPROCESSOR_URL}{API_PREFIX}/antenna/loop",
            json=loop_request
        )
        assert response.status_code == 200
        geometry = extract_mesh_from_preprocessor_response(response)
        
        # Solve
        solver_request = {
            "nodes": geometry["nodes"],
            "edges": geometry["edges"],
            "radii": geometry["radii"],
            "frequency": 150e6,
            "voltage_sources": [{
                "node_start": 1,
                "node_end": 0,
                "value": 1.0,
                "impedance": 50.0
            }]
        }
        
        response = requests.post(
            f"{SOLVER_URL}/api/solve/single",
            json=solver_request
        )
        assert response.status_code == 200
        result = response.json()
        
        Z_in = parse_complex(result["input_impedance"])
        print(f"\n✓ Loop antenna analysis complete:")
        print(f"  Input impedance: {Z_in:.2f} Ω")
    
    def test_error_handling_invalid_geometry(self):
        """Test that invalid geometry is caught by solver."""
        # Send malformed geometry to solver
        bad_request = {
            "nodes": [[0, 0, 0]],  # Only one node
            "edges": [[0, 1]],  # Edge to non-existent node
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
            f"{SOLVER_URL}/api/solve/single",
            json=bad_request
        )
        # Should fail with validation error
        assert response.status_code in [400, 422, 500]
    
    def test_performance_large_antenna(self):
        """Test performance with larger antenna structure."""
        # Generate dipole with many segments
        dipole_request = {
            "length": 1.5,
            "wire_radius": 0.001,
            "gap": 0.001,
            "segments": 25  # 25 segments per half = 50 total
        }
        
        response = requests.post(
            f"{PREPROCESSOR_URL}/api/antenna/dipole",
            json=dipole_request
        )
        assert response.status_code == 200
        geometry = extract_mesh_from_preprocessor_response(response)
        
        # Time the solve
        start_time = time.time()
        
        solver_request = {
            "nodes": geometry["nodes"],
            "edges": geometry["edges"],
            "radii": geometry["radii"],
            "frequency": 100e6,
            "voltage_sources": [{
                "node_start": 1,
                "node_end": 27,
                "value": 1.0,
                "impedance": 50.0
            }]
        }
        
        response = requests.post(
            f"{SOLVER_URL}/api/solve/single",
            json=solver_request
        )
        
        elapsed = time.time() - start_time
        
        assert response.status_code == 200
        result = response.json()
        
        print(f"\n✓ Large antenna performance:")
        print(f"  Segments: 51")
        print(f"  Solve time:0{elapsed:.3f} s")
        print(f"  Server solve time: {result['solve_time']:.3f} s")
        
        # Should complete in reasonable time
        assert elapsed < 30, "Large antenna solve took too long"
    
    def test_regression_dipole_impedance(self):
        """
        Regression test: Verify dipole impedance matches expected values.
        
        This locks in known-good results to catch regressions.
        """
        # Standard half-wave dipole at 100 MHz
        dipole_request = {
            "length": 1.5,
            "wire_radius": 0.001,
            "gap": 0.001,
            "segments": 10
        }
        
        response = requests.post(
            f"{PREPROCESSOR_URL}/api/antenna/dipole",
            json=dipole_request
        )
        assert response.status_code == 200
        geometry = extract_mesh_from_preprocessor_response(response)
        
        solver_request = {
            "nodes": geometry["nodes"],
            "edges": geometry["edges"],
            "radii": geometry["radii"],
            "frequency": 100e6,
            "voltage_sources": [{
                "node_start": 1,
                "node_end": 12,
                "value": 1.0,
                "impedance": 50.0
            }]
        }
        
        response = requests.post(
            f"{SOLVER_URL}/api/solve/single",
            json=solver_request
        )
        assert response.status_code == 200
        result = response.json()
        
        Z_in = parse_complex(result["input_impedance"])
        
        # Reference values updated for nodal capacitance matrix implementation
        # with 1-based edge indexing
        assert 200 < Z_in.real < 600, f"Real part {Z_in.real} outside expected range"
        assert -200 < Z_in.imag < 200, f"Imaginary part {Z_in.imag} outside expected range"
        
        # Check that results are reproducible (should be deterministic)
        response2 = requests.post(
            f"{SOLVER_URL}/api/solve/single",
            json=solver_request
        )
        result2 = response2.json()
        Z_in2 = parse_complex(result2["input_impedance"])
        
        assert abs(Z_in - Z_in2) < 1e-10, "Results should be deterministic"
        
        print(f"\n✓ Regression test passed:")
        print(f"  Input impedance: {Z_in:.4f} Ω (deterministic)")


class TestServiceIntegration:
    """Test service-level integration features."""
    
    def test_both_services_healthy(self):
        """Verify both services report healthy status."""
        for name, url in [("Preprocessor", PREPROCESSOR_URL), ("Solver", SOLVER_URL)]:
            try:
                response = requests.get(f"{url}/health", timeout=2)
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "healthy"
                print(f"✓ {name}: {data['status']}")
            except requests.exceptions.RequestException as e:
                pytest.skip(f"{name} not available: {e}")
    
    def test_api_documentation_available(self):
        """Verify API documentation is accessible."""
        for name, url in [("Preprocessor", PREPROCESSOR_URL), ("Solver", SOLVER_URL)]:
            try:
                response = requests.get(f"{url}/api/docs", timeout=2)
                # Should return HTML (or redirect to docs)
                assert response.status_code in [200, 307, 308]
                print(f"✓ {name} API docs available")
            except requests.exceptions.RequestException as e:
                pytest.skip(f"{name} not available: {e}")


if __name__ == "__main__":
    """Run tests with pytest or as standalone script."""
    import sys
    
    print("=" * 70)
    print("Integration Test: Preprocessor → Solver Pipeline")
    print("=" * 70)
    print()
    print("Prerequisites:")
    print("  1. Start preprocessor: uvicorn backend.preprocessor.main:app --port 8001")
    print("  2. Start solver: uvicorn backend.solver.main:app --port 8002")
    print()
    print("=" * 70)
    print()
    
    # Run with pytest if available
    pytest.main([__file__, "-v", "--tb=short"])
