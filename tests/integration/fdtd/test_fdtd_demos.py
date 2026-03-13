"""Tests for the FDTD demo examples API and data validation."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.common.models.fdtd import FdtdConfig, FdtdGeometry
from backend.fdtd_preprocessor.main import app

client = TestClient(app)

DEMOS_DIR = Path(__file__).resolve().parents[3] / "backend" / "fdtd_preprocessor" / "demos"


# ---------------------------------------------------------------------------
# Demo data validation
# ---------------------------------------------------------------------------
class TestDemoDataValidation:
    """Verify each demo JSON parses into valid Pydantic models."""

    @pytest.fixture(params=sorted(DEMOS_DIR.glob("*.json")), ids=lambda p: p.stem)
    def demo_data(self, request):
        with open(request.param, encoding="utf-8") as f:
            return json.load(f)

    def test_has_required_keys(self, demo_data):
        assert "name" in demo_data
        assert "description" in demo_data
        assert "presets" in demo_data
        assert "small" in demo_data["presets"]
        assert "large" in demo_data["presets"]

    @pytest.mark.parametrize("preset_key", ["small", "large"])
    def test_design_state_is_valid_geometry(self, demo_data, preset_key):
        ds = demo_data["presets"][preset_key]["design_state"]
        geo = FdtdGeometry(
            domain_size=ds["domainSize"],
            cell_size=ds["cellSize"],
            structures=ds.get("structures", []),
            sources=ds.get("sources", []),
            boundaries=ds.get("boundaries", {}),
            probes=ds.get("probes", []),
        )
        nx, ny, nz = geo.grid_dimensions
        assert nx > 0
        assert ny >= 1
        assert nz >= 1

    @pytest.mark.parametrize("preset_key", ["small", "large"])
    def test_config_is_valid(self, demo_data, preset_key):
        ds = demo_data["presets"][preset_key]["design_state"]
        cfg = FdtdConfig(**ds["config"])
        assert cfg.num_time_steps > 0
        assert 0 < cfg.courant_number <= 1.0

    @pytest.mark.parametrize("preset_key", ["small", "large"])
    def test_has_at_least_one_source(self, demo_data, preset_key):
        ds = demo_data["presets"][preset_key]["design_state"]
        assert len(ds["sources"]) >= 1

    @pytest.mark.parametrize("preset_key", ["small", "large"])
    def test_has_at_least_one_probe(self, demo_data, preset_key):
        ds = demo_data["presets"][preset_key]["design_state"]
        assert len(ds["probes"]) >= 1

    @pytest.mark.parametrize("preset_key", ["small", "large"])
    def test_simulation_config_is_fdtd(self, demo_data, preset_key):
        sc = demo_data["presets"][preset_key]["simulation_config"]
        assert sc["method"] == "fdtd"
        assert sc["dimensionality"] in ("1d", "2d")


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------
class TestDemosListEndpoint:
    """Test GET /api/fdtd/demos."""

    def test_returns_all_demos(self):
        r = client.get("/api/fdtd/demos")
        assert r.status_code == 200
        demos = r.json()["demos"]
        assert len(demos) == 4

    def test_each_demo_has_slug_and_name(self):
        r = client.get("/api/fdtd/demos")
        for d in r.json()["demos"]:
            assert "slug" in d
            assert "name" in d
            assert "description" in d
            assert "presets" in d
            assert "small" in d["presets"]
            assert "large" in d["presets"]


class TestDemoDetailEndpoint:
    """Test GET /api/fdtd/demos/{slug}."""

    def test_get_small_preset(self):
        r = client.get("/api/fdtd/demos/broadband_antenna?preset=small")
        assert r.status_code == 200
        d = r.json()
        assert d["preset"] == "small"
        assert "design_state" in d
        assert "simulation_config" in d

    def test_get_large_preset(self):
        r = client.get("/api/fdtd/demos/gpr_simulation?preset=large")
        assert r.status_code == 200
        d = r.json()
        assert d["preset"] == "large"

    def test_default_preset_is_small(self):
        r = client.get("/api/fdtd/demos/bio_em_sar")
        assert r.status_code == 200
        assert r.json()["preset"] == "small"

    def test_unknown_demo_returns_404(self):
        r = client.get("/api/fdtd/demos/nonexistent")
        assert r.status_code == 404

    def test_invalid_preset_returns_400(self):
        r = client.get("/api/fdtd/demos/emc_pcb_trace?preset=huge")
        assert r.status_code == 400
        assert "huge" in r.json()["detail"]
