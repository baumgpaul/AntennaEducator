#!/usr/bin/env python
"""Seed FDTD demo projects into the database.

Creates a public "FDTD Demonstrations" course folder with four sub-folders,
each containing two projects (small and large presets) loaded from the demo
JSON files in ``backend/fdtd_preprocessor/demos/``.

Usage:
    # Against AWS DynamoDB (default, uses antenna-staging profile):
    python dev_tools/seed_fdtd_demo_projects.py --user-id <admin-user-id>

    # Against local DynamoDB:
    python dev_tools/seed_fdtd_demo_projects.py \
        --user-id <user-id> \
        --endpoint http://localhost:8000

    # Dry-run (prints what would be created):
    python dev_tools/seed_fdtd_demo_projects.py --user-id <user-id> --dry-run

Environment:
    DYNAMODB_TABLE_NAME  — DynamoDB table (default: antenna-simulator-staging)
    AWS_PROFILE          — AWS profile for credentials (default: antenna-staging)
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

# Ensure repo root is on sys.path so backend imports work
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from backend.common.repositories.dynamodb_repository import DynamoDBProjectRepository
from backend.common.repositories.folder_repository import FolderRepository

logger = logging.getLogger(__name__)

DEMOS_DIR = REPO_ROOT / "backend" / "fdtd_preprocessor" / "demos"

DEMO_FILES = [
    ("Broadband Antenna", "broadband_antenna.json"),
    ("GPR Simulation", "gpr_simulation.json"),
    ("Bio EM SAR", "bio_em_sar.json"),
    ("EMC/EMI", "emc_pcb_trace.json"),
]


def load_demo(filename: str) -> dict:
    """Load a demo JSON file and return its contents."""
    path = DEMOS_DIR / filename
    with open(path, encoding="utf-8") as f:
        return json.load(f)


async def seed(
    user_id: str,
    table_name: str,
    endpoint_url: str | None,
    dry_run: bool,
) -> None:
    """Create course folder hierarchy and demo projects."""
    import os

    os.environ.setdefault("USE_DYNAMODB", "true")
    os.environ.setdefault("DYNAMODB_TABLE_NAME", table_name)
    if endpoint_url:
        os.environ["DYNAMODB_ENDPOINT_URL"] = endpoint_url

    folder_repo = FolderRepository()
    project_repo = DynamoDBProjectRepository(table_name=table_name)

    # 1. Create root course folder
    root_name = "FDTD Demonstrations"
    if dry_run:
        print(f"[DRY-RUN] Would create course folder: {root_name}")
        root_id = "DRY-RUN-ROOT"
    else:
        root = await folder_repo.create_folder(
            owner_id=user_id,
            name=root_name,
            is_course=True,
        )
        root_id = root["id"]
        print(f"Created course folder: {root_name} (id={root_id})")

    # 2. Create sub-folders and demo projects
    created_count = 0
    for folder_name, filename in DEMO_FILES:
        demo = load_demo(filename)

        if dry_run:
            print(f"\n[DRY-RUN] Would create sub-folder: {folder_name}")
            sub_id = "DRY-RUN-SUB"
        else:
            sub = await folder_repo.create_folder(
                owner_id=user_id,
                name=folder_name,
                parent_folder_id=root_id,
                is_course=True,
            )
            sub_id = sub["id"]
            print(f"\nCreated sub-folder: {folder_name} (id={sub_id})")

        # Create small and large preset projects
        for preset_key in ("small", "large"):
            preset = demo["presets"][preset_key]
            project_name = f"{demo['name']} ({preset_key.title()} Preset)"

            if dry_run:
                ds = preset["design_state"]
                n_structs = len(ds.get("structures", []))
                n_sources = len(ds.get("sources", []))
                n_probes = len(ds.get("probes", []))
                steps = ds.get("config", {}).get("num_time_steps", "?")
                print(
                    f"  [DRY-RUN] Would create project: {project_name}"
                    f" ({n_structs} structures, {n_sources} sources,"
                    f" {n_probes} probes, {steps} steps)"
                )
                created_count += 1
                continue

            project = await project_repo.create_project(
                user_id=user_id,
                name=project_name,
                description=demo["description"],
                folder_id=sub_id,
                project_type="fdtd",
            )

            await project_repo.update_project(
                project_id=project["id"],
                design_state=preset["design_state"],
                simulation_config=preset["simulation_config"],
            )

            print(f"  Created project: {project_name} (id={project['id']})")
            created_count += 1

    print(f"\nDone. Created {created_count} demo projects.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed FDTD demo projects into the database.",
    )
    parser.add_argument(
        "--user-id",
        required=True,
        help="Owner user ID for the course folder and projects.",
    )
    parser.add_argument(
        "--table-name",
        default="antenna-simulator-staging",
        help="DynamoDB table name (default: antenna-simulator-staging).",
    )
    parser.add_argument(
        "--endpoint",
        default=None,
        help="DynamoDB endpoint URL (for local dev, e.g. http://localhost:8000).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be created without writing to the database.",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    asyncio.run(
        seed(
            user_id=args.user_id,
            table_name=args.table_name,
            endpoint_url=args.endpoint,
            dry_run=args.dry_run,
        )
    )


if __name__ == "__main__":
    main()
