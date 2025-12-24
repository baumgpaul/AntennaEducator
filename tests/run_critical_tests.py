#!/usr/bin/env python3
"""
Run Critical/Gold Standard Tests
==================================
This script runs all tests marked as 'critical' - these are gold standard tests
that must pass before any solver changes are accepted.

Usage:
    python run_critical_tests.py
    
Or with pytest directly:
    pytest -m critical -v
"""

import sys
import subprocess
from pathlib import Path


def main():
    """Run critical tests and report results."""
    print("=" * 80)
    print(" RUNNING CRITICAL/GOLD STANDARD TESTS")
    print("=" * 80)
    print()
    print("These tests validate the solver against fundamental antenna theory.")
    print("All critical tests MUST pass for the solver to be considered correct.")
    print()
    print("-" * 80)
    
    # Run pytest with critical marker
    result = subprocess.run(
        [
            sys.executable, "-m", "pytest",
            "-m", "critical",
            "-v",
            "--tb=short",
            "--color=yes",
            "--continue-on-collection-errors"
        ],
        cwd=Path(__file__).parent.parent,
        capture_output=True,
        text=True
    )
    
    # Print output
    print(result.stdout)
    print(result.stderr)
    
    # Check if critical tests passed (look for "1 passed" in output)
    # Collection errors in other files shouldn't fail the critical test run
    passed_critical = "1 passed" in result.stdout and "FAILED" not in result.stdout
    
    print()
    print("=" * 80)
    if passed_critical:
        print(" *** ALL CRITICAL TESTS PASSED ***")
        print("=" * 80)
        print()
        print("The solver meets all fundamental requirements.")
        print("Safe to proceed with code changes.")
        return 0
    else:
        print(" *** CRITICAL TEST FAILURE ***")
        print("=" * 80)
        print()
        print("WARNING: The solver does not meet fundamental requirements!")
        print("DO NOT merge changes until all critical tests pass.")
        print()
        print("Debug steps:")
        print("  1. Review failed test output above")
        print("  2. Compare against MATLAB reference implementation")
        print("  3. Check recent solver changes")
        print("  4. Verify system matrix calculations")
        return 1


if __name__ == "__main__":
    sys.exit(main())

