#!/usr/bin/env python
"""
seed_courses.py — Idempotent seeder for the Antenna Theory PEEC mini-course.

Reads fixture JSONs from courses/antenna_theory_peec/ and seeds them via the
Projects service HTTP API. Runs against local Docker Compose or AWS Lambda.

Usage (local Docker Compose):
    python dev_tools/seed_courses.py

Usage (AWS / staging):
    SEED_BASE_URL=https://<lambda-fn-url>.lambda-url.eu-west-1.on.aws \
    SEED_ADMIN_TOKEN=<cognito-id-token> \
    python dev_tools/seed_courses.py

Environment variables:
    SEED_BASE_URL       Base URL for the projects service.
                        Default: http://localhost:8010
    SEED_ADMIN_TOKEN    Pre-obtained auth token (Bearer).
                        If omitted, uses SEED_USERNAME + SEED_PASSWORD to log in.
    SEED_USERNAME       Admin username/email for login (local mode).
                        Default: value of ADMIN_EMAIL in .env
    SEED_PASSWORD       Admin password for login (local mode).
                        Default: value of ADMIN_PASSWORD in .env

Exit codes:
    0  — All modules seeded (or already present and skipped).
    1  — Partial failure (at least one module failed).
"""

import json
import logging
import os
import sys
import time
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("seed_courses")

REPO_ROOT = Path(__file__).parent.parent
COURSES_DIR = REPO_ROOT / "courses" / "antenna_theory_peec"

COURSE_NAME = "Antenna Theory with 1D PEEC"
COURSE_DESCRIPTION = (
    "A self-contained introduction to antenna theory using the 1D PEEC "
    "(Partial Element Equivalent Circuit) method. Covers terminal impedance, "
    "current distribution, far-field radiation, polarization, radiation patterns, "
    "loop antennas, and linear arrays — each module with pre-run simulation results."
)

MODULES = [
    {
        "dir": "01_fundamental_parameters",
        "name": "Module 1: Fundamental Parameters",
        "description": "Terminal impedance, VSWR, return loss, and resonance of a dipole antenna.",
        "project_name": "M1 — Half-Wave Dipole: Impedance Sweep",
    },
    {
        "dir": "02_current_distribution",
        "name": "Module 2: Current Distribution",
        "description": "Sinusoidal current distribution on a dipole at sub-resonance, resonance, and super-resonance.",
        "project_name": "M2 — Dipole Current vs Frequency",
    },
    {
        "dir": "03_hertz_dipole_field_theory",
        "name": "Module 3: Hertz Dipole & Field Theory",
        "description": "Vector potential, near/far field zones, and radiation resistance of an electrically short dipole.",
        "project_name": "M3 — Short Dipole (Hertzian) at 300 MHz",
    },
    {
        "dir": "04_wave_polarization",
        "name": "Module 4: Wave Polarization",
        "description": "Linear, circular, and elliptical polarization; polarization mismatch factor.",
        "project_name": "M4 — Dipole Polarization Study",
    },
    {
        "dir": "05_radiation_pattern",
        "name": "Module 5: Radiation Pattern & Directivity",
        "description": "Radiation intensity, directivity, HPBW, and pattern vs. electrical length.",
        "project_name": "M5 — Half-Wave Dipole Radiation Pattern",
    },
    {
        "dir": "06_loop_antenna",
        "name": "Module 6: Loop Antenna",
        "description": "Magnetic dipole duality, radiation resistance of small loops, resonant loop.",
        "project_name": "M6 — Small Loop Antenna Sweep",
    },
    {
        "dir": "07_linear_arrays",
        "name": "Module 7: Linear Arrays",
        "description": "Array factor, broadside and end-fire arrays, HPBW, and grating lobes.",
        "project_name": "M7 — Two-Element Dipole Array",
    },
]


class Seeder:
    def __init__(self, base_url: str, token: str, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.timeout = timeout

    def _url(self, path: str) -> str:
        return f"{self.base_url}{path}"

    def get(self, path: str, **kwargs) -> requests.Response:
        return self.session.get(self._url(path), timeout=self.timeout, **kwargs)

    def post(self, path: str, **kwargs) -> requests.Response:
        return self.session.post(self._url(path), timeout=self.timeout, **kwargs)

    def put(self, path: str, **kwargs) -> requests.Response:
        return self.session.put(self._url(path), timeout=self.timeout, **kwargs)

    # ── Helpers ────────────────────────────────────────────────────────────

    def find_course_by_name(self, name: str, parent_id: str = None) -> dict | None:
        """Look for an existing course folder by name (and optional parent)."""
        params = {}
        if parent_id:
            params["parent_folder_id"] = parent_id
        resp = self.get("/api/courses", params=params)
        resp.raise_for_status()
        for folder in resp.json():
            if folder["name"] == name:
                return folder
        return None

    def create_course(self, name: str, parent_id: str = None) -> dict:
        payload = {"name": name}
        if parent_id:
            payload["parent_folder_id"] = parent_id
        resp = self.post("/api/courses", json=payload)
        resp.raise_for_status()
        return resp.json()

    def get_or_create_course(self, name: str, parent_id: str = None) -> tuple[dict, bool]:
        """Return (folder, created) — created=False if it already existed."""
        existing = self.find_course_by_name(name, parent_id)
        if existing:
            return existing, False
        return self.create_course(name, parent_id), True

    def find_project_in_folder(self, folder_id: str, project_name: str) -> dict | None:
        resp = self.get(f"/api/courses/{folder_id}/projects")
        resp.raise_for_status()
        for p in resp.json():
            if p["name"] == project_name:
                return p
        return None

    def create_project(
        self,
        name: str,
        description: str,
        folder_id: str,
        design_state: dict,
        simulation_config: dict,
        simulation_results: dict,
    ) -> dict:
        payload = {
            "name": name,
            "description": description,
            "folder_id": folder_id,
            "design_state": design_state,
            "simulation_config": simulation_config,
            "simulation_results": simulation_results,
        }
        resp = self.post("/api/projects", json=payload)
        if not resp.ok:
            log.error("  Create project failed: %s — %s", resp.status_code, resp.text[:400])
            resp.raise_for_status()
        return resp.json()

    def upload_documentation(self, project_id: str, markdown_content: str) -> None:
        resp = self.put(
            f"/api/projects/{project_id}/documentation",
            json={"content": markdown_content},
        )
        if not resp.ok:
            log.error("  Upload documentation failed: %s — %s", resp.status_code, resp.text[:400])
            resp.raise_for_status()

    # ── Main seeding logic ─────────────────────────────────────────────────

    def seed(self) -> int:
        """Seed all course modules. Returns number of failures."""
        failures = 0

        # 1. Root course folder
        log.info("Ensuring root course: '%s' ...", COURSE_NAME)
        root_folder, created = self.get_or_create_course(COURSE_NAME)
        root_id = root_folder["id"]
        log.info("  Root course ID: %s (%s)", root_id, "created" if created else "existed")

        # 2. Modules
        for module in MODULES:
            log.info("")
            log.info("Module '%s' ...", module["name"])
            try:
                self._seed_module(root_id, module)
            except Exception as exc:
                log.error("  FAILED: %s", exc)
                failures += 1

        return failures

    def _seed_module(self, root_id: str, module: dict) -> None:
        module_dir = COURSES_DIR / module["dir"]

        # Load fixture files
        ds_path = module_dir / "design_state.json"
        sr_path = module_dir / "simulation_results.json"
        sc_path = module_dir / "simulation_config.json"
        doc_path = module_dir / "documentation.md"

        for p in (ds_path, sr_path, sc_path, doc_path):
            if not p.exists():
                raise FileNotFoundError(
                    f"Missing fixture file: {p}. Run generate_course_fixtures.py first."
                )

        with open(ds_path, encoding="utf-8") as f:
            design_state = json.load(f)
        with open(sr_path, encoding="utf-8") as f:
            simulation_results = json.load(f)
        with open(sc_path, encoding="utf-8") as f:
            simulation_config = json.load(f)
        with open(doc_path, encoding="utf-8") as f:
            documentation_md = f.read()

        # a. Module sub-folder (course)
        module_folder, m_created = self.get_or_create_course(module["name"], parent_id=root_id)
        module_folder_id = module_folder["id"]
        log.info(
            "  Sub-folder ID: %s (%s)", module_folder_id, "created" if m_created else "existed"
        )

        # b. Project in module folder
        existing_project = self.find_project_in_folder(module_folder_id, module["project_name"])
        if existing_project:
            log.info("  Project '%s' already exists — skipping.", module["project_name"])
            return

        log.info("  Creating project '%s' ...", module["project_name"])
        project = self.create_project(
            name=module["project_name"],
            description=module["description"],
            folder_id=module_folder_id,
            design_state=design_state,
            simulation_config=simulation_config,
            simulation_results=simulation_results,
        )
        project_id = project["id"]
        log.info("  Project ID: %s", project_id)

        # c. Upload documentation (markdown)
        log.info("  Uploading documentation (%d chars) ...", len(documentation_md))
        self.upload_documentation(project_id, documentation_md)
        log.info("  Done.")


def _get_token(base_url: str) -> str:
    """Log in and return a Bearer token."""
    username = os.environ.get("SEED_USERNAME", os.environ.get("ADMIN_EMAIL", ""))
    password = os.environ.get("SEED_PASSWORD", os.environ.get("ADMIN_PASSWORD", ""))

    if not username or not password:
        log.error(
            "No SEED_ADMIN_TOKEN set and SEED_USERNAME/SEED_PASSWORD (or ADMIN_EMAIL/"
            "ADMIN_PASSWORD) not provided. Cannot log in."
        )
        sys.exit(1)

    log.info("Logging in as '%s' ...", username)
    resp = requests.post(
        f"{base_url.rstrip('/')}/api/auth/login",
        json={"username": username, "password": password},
        timeout=30,
    )
    if not resp.ok:
        log.error("Login failed: %s — %s", resp.status_code, resp.text[:300])
        sys.exit(1)

    data = resp.json()
    token = data.get("access_token") or data.get("token")
    if not token:
        log.error("Login response has no access_token: %s", data)
        sys.exit(1)

    log.info("Login successful.")
    return token


def main() -> None:
    base_url = os.environ.get("SEED_BASE_URL", "http://localhost:8010")
    token = os.environ.get("SEED_ADMIN_TOKEN")

    if not token:
        token = _get_token(base_url)

    log.info("Target: %s", base_url)
    log.info("Courses dir: %s", COURSES_DIR)

    seeder = Seeder(base_url=base_url, token=token)

    # Retry on transient connection errors (service might still be starting)
    for attempt in range(3):
        try:
            failures = seeder.seed()
            break
        except requests.exceptions.ConnectionError as exc:
            if attempt < 2:
                log.warning(
                    "Connection error (attempt %d/3): %s — retrying in 5s...", attempt + 1, exc
                )
                time.sleep(5)
            else:
                log.error("Could not connect to %s after 3 attempts.", base_url)
                sys.exit(1)

    if failures:
        log.error("\n%d module(s) failed to seed.", failures)
        sys.exit(1)
    else:
        log.info("\nAll modules seeded successfully.")


if __name__ == "__main__":
    main()
