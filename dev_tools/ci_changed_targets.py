#!/usr/bin/env python
"""Which deploy targets a change touches (used by aws-build-and-merge.yml).

Every Lambda image copies all of backend/, but a service only *imports*
backend/common plus its own package (projects also mounts backend/auth), so
rebuilding just the affected images keeps deploys short. Unknown paths outside
these rules (docs, tests, terraform, dev tools) deploy nothing.

Usage: git diff --name-only BASE HEAD | python dev_tools/ci_changed_targets.py
Prints: services=<space-separated list>  and  frontend=true|false
"""

import sys
from typing import Iterable, List, Set, Tuple

SERVICES = ("preprocessor", "solver", "postprocessor", "projects")
SHARED = ("requirements-lambda.txt", "backend/__init__.py", "backend/common/")
EXTRA = {"backend/auth/": "projects"}


def targets(paths: Iterable[str]) -> Tuple[List[str], bool]:
    services: Set[str] = set()
    frontend = False
    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if not path:
            continue
        if path.startswith("frontend/"):
            frontend = True
        elif any(path == s or path.startswith(s) for s in SHARED):
            services.update(SERVICES)
        else:
            for svc in SERVICES:
                if path.startswith(f"backend/{svc}/"):
                    services.add(svc)
            for prefix, svc in EXTRA.items():
                if path.startswith(prefix):
                    services.add(svc)
    return [s for s in SERVICES if s in services], frontend


if __name__ == "__main__":
    svcs, fe = targets(sys.stdin)
    print(f"services={' '.join(svcs)}")
    print(f"frontend={'true' if fe else 'false'}")
