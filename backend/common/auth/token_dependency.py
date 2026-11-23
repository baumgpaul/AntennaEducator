"""FastAPI dependency for metered simulation tokens.

Usage in a compute endpoint::

    from backend.common.auth.token_dependency import require_simulation_tokens

    @app.post("/api/solve/single")
    async def solve_single(
        request: SolveRequest,
        user: UserIdentity = Depends(get_current_user),
        _tokens: TokenCheckResult = Depends(require_simulation_tokens("solve/single")),
    ):
        ...

The dependency:
1. Flatrate users are never charged (usage is still logged).
2. Otherwise the balance must cover ``MIN_TOKENS`` (or a given estimate) → else 402.
3. The endpoint runs; its duration is measured.
4. Only if it succeeded: charge ``metered_cost(duration)`` (1 token per GB-s of this
   Lambda's memory), emptying the balance at most — the compute is already done.

Requests that fail validation (422), are rejected (4xx) or crash (5xx) cost nothing.
Endpoints that charge themselves (sweep) call ``check_simulation_tokens`` and
``charge_simulation_tokens`` directly.
"""

import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from backend.common.auth.identity import UserIdentity
from backend.common.auth.token_costs import MIN_TOKENS, metered_cost


class InsufficientTokensError(Exception):
    """Raised when a user lacks enough simulation tokens."""

    def __init__(self, required: int, balance: int) -> None:
        self.required = required
        self.balance = balance
        super().__init__(f"Insufficient simulation tokens: need {required}, have {balance}")


@dataclass(frozen=True)
class TokenCheckResult:
    """Outcome of a token balance check; ``started`` times the request."""

    should_deduct: bool
    cost: int
    reason: str = ""
    started: float = field(default_factory=lambda: time.perf_counter())


def _check_token_balance(user: UserIdentity, cost: int) -> TokenCheckResult:
    """Pure-logic check: may this user start a request needing ``cost`` tokens?

    Raises:
        InsufficientTokensError: if user has no flatrate and balance < cost.
    """
    if cost == 0:
        return TokenCheckResult(should_deduct=False, cost=0, reason="free endpoint")

    if user.has_active_flatrate:
        return TokenCheckResult(should_deduct=False, cost=cost, reason="flatrate active")

    if user.simulation_tokens < cost:
        raise InsufficientTokensError(required=cost, balance=user.simulation_tokens)

    return TokenCheckResult(should_deduct=True, cost=cost)


def _log_usage(
    user_id: str,
    service: str,
    endpoint: str,
    cost: int,
    balance_after: int,
    was_flatrate: bool,
) -> None:
    """Fire-and-forget usage log entry. Failures are silently logged."""
    import logging

    from backend.common.auth.token_costs import UsageLogEntry
    from backend.common.repositories.user_repository import UserRepository

    try:
        entry = UsageLogEntry(
            user_id=user_id,
            service=service,
            endpoint=endpoint,
            cost=cost,
            balance_after=balance_after,
            was_flatrate=was_flatrate,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        repo = UserRepository()
        repo.log_token_usage(entry)
    except Exception:
        logging.getLogger(__name__).warning(
            "Failed to log usage for user %s",
            user_id,
            exc_info=True,
        )


def _insufficient(required: int, balance: int):
    from fastapi import HTTPException

    return HTTPException(
        status_code=402,
        detail={
            "message": "Insufficient simulation tokens",
            "required": required,
            "balance": balance,
        },
    )


def check_simulation_tokens(user: UserIdentity, cost: int = MIN_TOKENS) -> TokenCheckResult:
    """Balance check without charging (starts the clock). Raises HTTP 402 if insufficient."""
    try:
        return _check_token_balance(user, cost)
    except InsufficientTokensError as exc:
        raise _insufficient(exc.required, exc.balance)


def charge_metered(
    user_id: str,
    seconds: float,
    endpoint: str = "",
    flatrate: bool = False,
    balance_hint: int = 0,
    memory_mb: Optional[int] = None,
) -> int:
    """Charge (or for flatrate users only log) ``seconds`` of compute. Returns tokens charged."""
    cost = metered_cost(seconds, memory_mb)
    if flatrate:
        _log_usage(
            user_id=user_id,
            service="compute",
            endpoint=endpoint,
            cost=cost,
            balance_after=balance_hint,
            was_flatrate=True,
        )
        return 0
    from backend.common.repositories.user_repository import UserRepository

    charged, remaining = UserRepository().charge_user_tokens(user_id, cost)
    _log_usage(
        user_id=user_id,
        service="compute",
        endpoint=endpoint,
        cost=charged,
        balance_after=remaining,
        was_flatrate=False,
    )
    return charged


def charge_simulation_tokens(
    user: UserIdentity,
    check: TokenCheckResult,
    endpoint: str = "",
    seconds: Optional[float] = None,
) -> int:
    """Charge a completed request by its measured duration (default: since the check).

    Call only after the computation succeeded. Returns tokens charged.
    """
    if check.cost == 0:
        return 0
    elapsed = seconds if seconds is not None else time.perf_counter() - check.started
    return charge_metered(
        user.id,
        elapsed,
        endpoint=endpoint,
        flatrate=not check.should_deduct,
        balance_hint=user.simulation_tokens,
    )


def require_simulation_tokens(endpoint: str = "", estimate: int = MIN_TOKENS):
    """FastAPI dependency factory: metered tokens for an endpoint.

    The balance must cover ``estimate`` tokens before the endpoint runs; after it
    returned successfully, its measured duration is charged.

    Returns:
        A FastAPI-compatible async (yield) dependency.
    """
    from fastapi import Depends

    from backend.common.auth.dependencies import get_current_user

    async def _dependency(
        user: UserIdentity = Depends(get_current_user),
    ):
        result = check_simulation_tokens(user, estimate)
        yield result
        # Only reached when the endpoint returned without raising.
        charge_simulation_tokens(user, result, endpoint=endpoint)

    return _dependency
