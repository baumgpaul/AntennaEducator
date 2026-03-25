"""FastAPI dependency for simulation token enforcement.

Usage in a compute endpoint::

    from backend.common.auth.token_dependency import require_simulation_tokens

    @app.post("/api/solve/single")
    async def solve_single(
        request: SolveRequest,
        user: UserIdentity = Depends(get_current_user),
        _tokens: TokenCheckResult = Depends(require_simulation_tokens(5)),
    ):
        ...

The dependency:
1. Checks if the user has an active flatrate → skip deduction.
2. Checks if cost is 0 → skip deduction.
3. Otherwise verifies ``user.simulation_tokens >= cost``.
4. Raises HTTP 402 if insufficient.

Actual DynamoDB deduction is handled by ``deduct_user_tokens()`` (called
after the balance check passes). This is wired in Phase 4 when compute
services get auth.
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from backend.common.auth.identity import UserIdentity


class InsufficientTokensError(Exception):
    """Raised when a user lacks enough simulation tokens."""

    def __init__(self, required: int, balance: int) -> None:
        self.required = required
        self.balance = balance
        super().__init__(f"Insufficient simulation tokens: need {required}, have {balance}")


@dataclass(frozen=True)
class TokenCheckResult:
    """Outcome of a token balance check."""

    should_deduct: bool
    cost: int
    reason: str = ""


def _check_token_balance(user: UserIdentity, cost: int) -> TokenCheckResult:
    """Pure-logic check: can this user afford ``cost`` tokens?

    Returns a ``TokenCheckResult`` indicating whether deduction is needed.

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


def require_simulation_tokens(cost: int):
    """FastAPI dependency factory: enforce token balance for an endpoint.

    Args:
        cost: Number of tokens this endpoint consumes.

    Returns:
        A FastAPI-compatible async dependency function.
    """
    from fastapi import Depends, HTTPException

    from backend.common.auth.dependencies import get_current_user

    async def _dependency(
        user: UserIdentity = Depends(get_current_user),
    ) -> TokenCheckResult:
        try:
            result = _check_token_balance(user, cost)
        except InsufficientTokensError as exc:
            raise HTTPException(
                status_code=402,
                detail={
                    "message": "Insufficient simulation tokens",
                    "required": exc.required,
                    "balance": exc.balance,
                },
            )

        if result.should_deduct:
            from backend.common.repositories.user_repository import UserRepository

            repo = UserRepository()
            try:
                remaining = repo.deduct_user_tokens(user.id, cost)
            except ValueError:
                raise HTTPException(
                    status_code=402,
                    detail={
                        "message": "Insufficient simulation tokens",
                        "required": cost,
                        "balance": user.simulation_tokens,
                    },
                )
            _log_usage(
                user_id=user.id,
                service="compute",
                endpoint="",
                cost=cost,
                balance_after=remaining,
                was_flatrate=False,
            )
        elif cost > 0:
            # Flatrate user — log but no deduction
            _log_usage(
                user_id=user.id,
                service="compute",
                endpoint="",
                cost=cost,
                balance_after=user.simulation_tokens,
                was_flatrate=True,
            )

        return result

    return _dependency
