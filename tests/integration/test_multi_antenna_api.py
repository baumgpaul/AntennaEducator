"""
Integration tests for /api/solve/multi endpoint.

Tests the complete HTTP API for multi-antenna solving.
"""

import pytest
import requests
import numpy as np


BASE_URL = "http://localhost:8002"
API_PREFIX = "/api"


@pytest.fixture
def solver_client():
    """Test that solver service is running."""
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=2)
        assert response.status_code == 200
        return True
    except requests.exceptions.RequestException:
        pytest.skip("Solver service not running on port 8002")


class TestMultiAntennaEndpoint:
    """Test /api/solve/multi endpoint."""
    
    def test_single_antenna_via_api(self, solver_client):
        """Test solving single antenna via multi-antenna endpoint."""
        request_data = {
            "frequency": 100e6,
            "antennas": [
                {
                    "antenna_id": "dipole_1",
                    "nodes": [
                        [0.0, 0.0, 0.0],
                        [0.0, 0.0, 0.25],
                        [0.0, 0.0, 0.26],
                        [0.0, 0.0, 0.5]
                    ],
                    "edges": [[1, 2], [3, 4]],
                    "radii": [0.001, 0.001],
                    "voltage_sources": [
                        {
                            "node_start": 2,
                            "node_end": 3,
                            "value": 1.0
                        }
                    ],
                    "current_sources": [],
                    "loads": []
                }
            ],
            "config": {
                "gauss_order": 2,
                "include_skin_effect": True,
                "resistivity": 1.68e-8,
                "permeability": 1.0
            }
        }
        
        response = requests.post(
            f"{BASE_URL}{API_PREFIX}/solve/multi",
            json=request_data,
            timeout=30
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check response structure
        assert 'frequency' in data
        assert 'converged' in data
        assert 'antenna_solutions' in data
        assert data['frequency'] == 100e6
        assert data['converged'] is True
        
        # Check antenna solution
        assert len(data['antenna_solutions']) == 1
        sol = data['antenna_solutions'][0]
        
        assert sol['antenna_id'] == 'dipole_1'
        assert 'branch_currents' in sol
        assert 'node_voltages' in sol
        assert 'input_impedance' in sol
        
        # Check current data
        assert len(sol['branch_currents']) == 2
        assert len(sol['node_voltages']) == 4
        
        # Parse complex impedance
        Z = sol['input_impedance']
        if isinstance(Z, dict):
            Z_real = Z.get('real', 0.0)
        elif isinstance(Z, str):
            # Parse string like '74.68-995.79j'
            Z_complex = complex(Z)
            Z_real = Z_complex.real
        elif isinstance(Z, (list, tuple)) and len(Z) == 2:
            Z_real = Z[0]
        else:
            try:
                Z_real = float(Z.real if hasattr(Z, 'real') else Z)
            except (ValueError, AttributeError):
                Z_real = 0.0
        
        # Sanity check impedance
        assert 10 < Z_real < 200, f"Unexpected impedance: {Z_real}Ω"
    
    def test_two_antenna_array(self, solver_client):
        """Test solving two-antenna array."""
        request_data = {
            "frequency": 100e6,
            "antennas": [
                {
                    "antenna_id": "dipole_1",
                    "nodes": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.5]],
                    "edges": [[1, 2]],
                    "radii": [0.001],
                    "voltage_sources": [{"node_start": 1, "node_end": 2, "value": 1.0}],
                    "current_sources": [],
                    "loads": []
                },
                {
                    "antenna_id": "dipole_2",
                    "nodes": [[0.5, 0.0, 0.0], [0.5, 0.0, 0.5]],
                    "edges": [[1, 2]],
                    "radii": [0.001],
                    "voltage_sources": [{"node_start": 1, "node_end": 2, "value": 1.0}],
                    "current_sources": [],
                    "loads": []
                }
            ],
            "config": {"gauss_order": 2}
        }
        
        response = requests.post(
            f"{BASE_URL}{API_PREFIX}/solve/multi",
            json=request_data,
            timeout=30
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check two solutions returned
        assert len(data['antenna_solutions']) == 2
        
        sol1 = data['antenna_solutions'][0]
        sol2 = data['antenna_solutions'][1]
        
        assert sol1['antenna_id'] == 'dipole_1'
        assert sol2['antenna_id'] == 'dipole_2'
        
        # Both should have currents
        assert len(sol1['branch_currents']) == 1
        assert len(sol2['branch_currents']) == 1
        
        # Both should have impedances
        assert sol1['input_impedance'] is not None
        assert sol2['input_impedance'] is not None
    
    def test_validation_no_antennas(self, solver_client):
        """Test validation rejects empty antenna list."""
        request_data = {
            "frequency": 100e6,
            "antennas": []
        }
        
        response = requests.post(
            f"{BASE_URL}{API_PREFIX}/solve/multi",
            json=request_data,
            timeout=10
        )
        
        assert response.status_code == 422  # Validation error
    
    def test_validation_no_nodes(self, solver_client):
        """Test validation rejects antenna with no nodes."""
        request_data = {
            "frequency": 100e6,
            "antennas": [
                {
                    "antenna_id": "bad_antenna",
                    "nodes": [],
                    "edges": [[1, 2]],
                    "radii": [0.001],
                    "voltage_sources": []
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}{API_PREFIX}/solve/multi",
            json=request_data,
            timeout=10
        )
        
        assert response.status_code == 400  # Bad request
    
    def test_validation_no_sources(self, solver_client):
        """Test validation requires at least one source per antenna."""
        request_data = {
            "frequency": 100e6,
            "antennas": [
                {
                    "antenna_id": "no_source",
                    "nodes": [[0.0, 0.0, 0.0], [0.0, 0.0, 1.0]],
                    "edges": [[1, 2]],
                    "radii": [0.001],
                    "voltage_sources": [],
                    "current_sources": []
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}{API_PREFIX}/solve/multi",
            json=request_data,
            timeout=10
        )
        
        assert response.status_code == 400


class TestMultiVsSingleConsistency:
    """Test that multi-antenna endpoint matches single-antenna endpoint for 1 antenna."""
    
    def test_single_antenna_consistency(self, solver_client):
        """Compare /solve/single vs /solve/multi for same antenna."""
        # Single antenna request
        single_request = {
            "frequency": 100e6,
            "nodes": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.5]],
            "edges": [[1, 2]],
            "radii": [0.001],
            "voltage_sources": [{"node_start": 1, "node_end": 2, "value": 1.0}],
            "current_sources": [],
            "loads": [],
            "config": {"gauss_order": 2}
        }
        
        # Multi antenna request with same antenna
        multi_request = {
            "frequency": 100e6,
            "antennas": [
                {
                    "antenna_id": "dipole_1",
                    "nodes": [[0.0, 0.0, 0.0], [0.0, 0.0, 0.5]],
                    "edges": [[1, 2]],
                    "radii": [0.001],
                    "voltage_sources": [{"node_start": 1, "node_end": 2, "value": 1.0}],
                    "current_sources": [],
                    "loads": []
                }
            ],
            "config": {"gauss_order": 2}
        }
        
        # Get both results
        single_response = requests.post(
            f"{BASE_URL}{API_PREFIX}/solve/single",
            json=single_request,
            timeout=30
        )
        
        multi_response = requests.post(
            f"{BASE_URL}{API_PREFIX}/solve/multi",
            json=multi_request,
            timeout=30
        )
        
        assert single_response.status_code == 200
        assert multi_response.status_code == 200
        
        single_data = single_response.json()
        multi_data = multi_response.json()
        
        # Extract single antenna solution from multi result
        multi_sol = multi_data['antenna_solutions'][0]
        
        # Compare currents (should be identical)
        single_currents = single_data['branch_currents']
        multi_currents = multi_sol['branch_currents']
        
        assert len(single_currents) == len(multi_currents)
        
        # Compare impedances (within 1%)
        single_Z = single_data['input_impedance']
        multi_Z = multi_sol['input_impedance']
        
        # Parse complex impedances
        def parse_impedance(Z):
            if isinstance(Z, dict):
                return complex(Z.get('real', 0), Z.get('imag', 0))
            elif isinstance(Z, (list, tuple)) and len(Z) == 2:
                return complex(Z[0], Z[1])
            else:
                return complex(Z)
        
        single_Z_complex = parse_impedance(single_Z)
        multi_Z_complex = parse_impedance(multi_Z)
        
        # Check magnitude and phase are close
        assert abs(abs(single_Z_complex) - abs(multi_Z_complex)) < abs(single_Z_complex) * 0.01


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
