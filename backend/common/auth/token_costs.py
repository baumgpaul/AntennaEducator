"""Simulation tokens: metered by the compute a request really used.

1 token = 1 GB-second of Lambda compute (configured memory × duration), the unit
AWS bills. Lambda costs ≈ $0.0000167 per GB-s in eu-west-1, so

- a typical solve (2 GB, ~2 s)          ≈ 4 tokens    ≈ $0.00007
- the longest async job (2 GB, 15 min)  = 1800 tokens ≈ $0.03
- the starter amount                    = 30 000 tokens ≈ $0.50

Requests are charged after they succeed, by their measured duration, at least
1 token. Before a request runs, the balance must cover 1 token (or the
estimate, for queued jobs), so a user can overrun by at most one request.
Request fees, DynamoDB, S3 and CloudFront are cents per month at this scale
and not metered.
"""

import math
import os
from dataclasses import dataclass

# 1 token per GB-second of Lambda compute
TOKENS_PER_GB_SECOND: float = 1.0

# Lambda x86 price, eu-west-1 (for documentation and tests, not for charging)
LAMBDA_USD_PER_GB_SECOND: float = 0.0000166667

# Starter allocation: ≈ $0.50 of compute
DEFAULT_STARTER_TOKENS: int = 30_000

# Smallest charge per request and the balance a request needs to start
MIN_TOKENS: int = 1

# Memory assumed when not running on Lambda (local dev, tests): the solver's size
FALLBACK_MEMORY_MB: int = 2048

# Balances are stamped with the scheme they are counted in (user attribute TokenScheme)
TOKEN_SCHEME: str = "gbs-v1"

# Old scheme: 500 starter tokens; new: 30 000. Old balances are scaled by this factor.
LEGACY_TOKEN_FACTOR: int = 60


def lambda_memory_mb() -> int:
    """Configured memory of this Lambda (AWS sets the variable), else the fallback."""
    try:
        mb = int(os.environ.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", ""))
    except ValueError:
        return FALLBACK_MEMORY_MB
    return mb if mb > 0 else FALLBACK_MEMORY_MB


def metered_cost(seconds: float, memory_mb: int | None = None) -> int:
    """Tokens for ``seconds`` of compute at ``memory_mb`` (default: this Lambda's)."""
    mb = memory_mb if memory_mb is not None else lambda_memory_mb()
    if not math.isfinite(seconds) or seconds < 0:
        seconds = 0.0
    gb_seconds = seconds * mb / 1024
    return max(MIN_TOKENS, math.ceil(gb_seconds * TOKENS_PER_GB_SECOND - 1e-9))


def convert_legacy_balance(old_tokens: int) -> int:
    """New-scheme balance for an account counted in the old fixed-price tokens.

    Keeps the value of what the account had (×60, so the old 500 starter becomes
    the new 30 000) and never gives less than the new free amount.
    """
    return max(DEFAULT_STARTER_TOKENS, int(old_tokens) * LEGACY_TOKEN_FACTOR)


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
