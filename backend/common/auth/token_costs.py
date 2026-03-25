"""Token cost definitions for simulation endpoints.

Each compute endpoint has an associated token cost. Non-compute endpoints
(auth, projects, folders, health checks) are free.

Costs reflect relative computational expense:
- Preprocessor (mesh generation): lightweight geometry → 1 token
- Solver (matrix fill + LU solve): heaviest compute → 5 tokens
- Postprocessor (field evaluation): moderate compute → 3 tokens
- Frequency sweeps: 5 × N_frequencies, capped at 250

Pricing basis: 500 tokens ≈ €1.00 (≈ 55 single simulations).
"""

from dataclasses import dataclass

# Default token allocation for new users
DEFAULT_STARTER_TOKENS: int = 500

# Maximum cost for a single sweep (prevents runaway charges)
_SWEEP_COST_CAP: int = 250

# Cost per frequency point in a sweep
_COST_PER_SWEEP_FREQ: int = 5

# (service, operation) → token cost
ENDPOINT_COSTS: dict[tuple[str, str], int] = {
    # Preprocessor — geometry + mesh generation
    ("preprocessor", "mesh"): 1,
    # Solver — electromagnetic computation
    ("solver", "single"): 5,
    ("solver", "multi"): 5,
    # Postprocessor — field computation
    ("postprocessor", "far_field"): 3,
    ("postprocessor", "near_field"): 3,
    ("postprocessor", "export"): 0,
}


def get_endpoint_cost(service: str, operation: str) -> int:
    """Look up the token cost for a (service, operation) pair.

    Returns 0 for unknown endpoints (free by default).
    """
    return ENDPOINT_COSTS.get((service, operation), 0)


def calculate_sweep_cost(num_frequencies: int) -> int:
    """Calculate token cost for a frequency sweep.

    Cost = 5 × num_frequencies, capped at 250.
    """
    return min(num_frequencies * _COST_PER_SWEEP_FREQ, _SWEEP_COST_CAP)


@dataclass(frozen=True)
class UsageLogEntry:
    """A single token usage event for audit logging."""

    user_id: str
    service: str
    endpoint: str
    cost: int
    balance_after: int
    was_flatrate: bool
    timestamp: str

    def to_dict(self) -> dict:
        """Convert to PascalCase dict for DynamoDB storage."""
        return {
            "Service": self.service,
            "Endpoint": self.endpoint,
            "Cost": self.cost,
            "BalanceAfter": self.balance_after,
            "WasFlatrate": self.was_flatrate,
            "Timestamp": self.timestamp,
        }
