"""Command line: python -m fem_mesher geometry.json [--msh out.msh] [--vtu out.vtu]"""

import argparse
import json
import sys
from pathlib import Path

from .build import mesh_geometry
from .geometry import Geometry2D


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="fem_mesher", description=__doc__)
    parser.add_argument("geometry", type=Path, help="Geometry JSON (Geometry2D, version 1)")
    parser.add_argument("--msh", type=Path, help="Write a Gmsh file (MSH 2.2, for openCFS)")
    parser.add_argument("--vtu", type=Path, help="Write a VTU file (ParaView)")
    args = parser.parse_args(argv)

    geometry = Geometry2D.model_validate_json(args.geometry.read_text(encoding="utf-8"))
    result = mesh_geometry(geometry, msh_path=args.msh)
    if args.vtu:
        result.mesh.write_vtu(args.vtu)
    for w in result.warnings:
        print(f"warning: {w}", file=sys.stderr)
    print(json.dumps(result.mesh.stats(), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
