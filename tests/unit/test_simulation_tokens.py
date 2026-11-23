"""Tests for the simulation token system.

Covers:
- UserIdentity token fields (simulation_tokens, flatrate_until)
- Token cost calculation (endpoint → cost mapping, sweep multiplier)
- Token deduction dependency (check balance, flatrate bypass, 402 on insufficient)
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.common.auth.identity import UserIdentity, UserRole

# ─── Phase 1: UserIdentity token fields ──────────────────────────────────────


class TestUserIdentityTokenFields:
    """UserIdentity carries simulation_tokens and flatrate_until."""

    def test_default_tokens_is_zero(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice")
        assert u.simulation_tokens == 0

    def test_explicit_token_balance(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice", simulation_tokens=500)
        assert u.simulation_tokens == 500

    def test_default_flatrate_is_none(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice")
        assert u.flatrate_until is None

    def test_explicit_flatrate_date(self):
        dt = datetime(2026, 12, 31, tzinfo=timezone.utc)
        u = UserIdentity(id="1", email="a@b.com", username="alice", flatrate_until=dt)
        assert u.flatrate_until == dt

    def test_has_active_flatrate_true_when_future(self):
        future = datetime.now(timezone.utc) + timedelta(days=30)
        u = UserIdentity(id="1", email="a@b.com", username="alice", flatrate_until=future)
        assert u.has_active_flatrate is True

    def test_has_active_flatrate_false_when_expired(self):
        past = datetime.now(timezone.utc) - timedelta(days=1)
        u = UserIdentity(id="1", email="a@b.com", username="alice", flatrate_until=past)
        assert u.has_active_flatrate is False

    def test_has_active_flatrate_false_when_none(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice")
        assert u.has_active_flatrate is False

    def test_token_fields_in_serialization(self):
        future = datetime(2026, 12, 31, tzinfo=timezone.utc)
        u = UserIdentity(
            id="1",
            email="a@b.com",
            username="alice",
            simulation_tokens=500,
            flatrate_until=future,
        )
        d = u.model_dump()
        assert d["simulation_tokens"] == 500
        assert d["flatrate_until"] == future
        assert d["has_active_flatrate"] is True

    def test_frozen_model_prevents_token_mutation(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice", simulation_tokens=100)
        with pytest.raises(Exception):
            u.simulation_tokens = 200  # type: ignore

    def test_existing_fields_unchanged(self):
        """Ensure new fields don't break existing role/admin behavior."""
        admin = UserIdentity(
            id="1",
            email="a@b.com",
            username="alice",
            role=UserRole.ADMIN,
            simulation_tokens=999,
        )
        assert admin.is_admin is True
        assert admin.is_maintainer is True
        assert admin.simulation_tokens == 999


# ─── Phase 2: Metered token costs (1 token = 1 GB-s of Lambda compute) ───────


class TestMeteredCosts:
    """Tokens follow the real compute bill: duration × configured memory."""

    def test_one_token_per_gb_second(self):
        from backend.common.auth.token_costs import metered_cost

        # 2 GB solver Lambda for 2.0 s = 4 GB-s = 4 tokens (≈ $0.00007)
        assert metered_cost(2.0, memory_mb=2048) == 4

    def test_rounds_up_and_charges_at_least_one(self):
        from backend.common.auth.token_costs import metered_cost

        assert metered_cost(0.01, memory_mb=512) == 1  # 0.005 GB-s
        assert metered_cost(0.0, memory_mb=512) == 1
        assert metered_cost(1.01, memory_mb=1024) == 2

    def test_negative_or_nan_duration_charges_the_minimum(self):
        from backend.common.auth.token_costs import metered_cost

        assert metered_cost(-3.0, memory_mb=2048) == 1
        assert metered_cost(float("nan"), memory_mb=2048) == 1

    def test_memory_from_the_lambda_environment(self, monkeypatch):
        from backend.common.auth.token_costs import lambda_memory_mb, metered_cost

        monkeypatch.setenv("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", "512")
        assert lambda_memory_mb() == 512
        assert metered_cost(10.0) == 5

    def test_memory_fallback_outside_lambda(self, monkeypatch):
        from backend.common.auth.token_costs import FALLBACK_MEMORY_MB, lambda_memory_mb

        monkeypatch.delenv("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", raising=False)
        assert lambda_memory_mb() == FALLBACK_MEMORY_MB
        monkeypatch.setenv("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", "not-a-number")
        assert lambda_memory_mb() == FALLBACK_MEMORY_MB

    def test_starter_tokens_are_worth_about_50_cents(self):
        from backend.common.auth.token_costs import (
            DEFAULT_STARTER_TOKENS,
            LAMBDA_USD_PER_GB_SECOND,
            TOKENS_PER_GB_SECOND,
        )

        usd = DEFAULT_STARTER_TOKENS / TOKENS_PER_GB_SECOND * LAMBDA_USD_PER_GB_SECOND
        assert 0.45 <= usd <= 0.55

    def test_longest_async_job_costs_a_few_cents(self):
        from backend.common.auth.token_costs import LAMBDA_USD_PER_GB_SECOND, metered_cost

        tokens = metered_cost(900.0, memory_mb=2048)  # 15 min Lambda maximum
        assert tokens == 1800
        assert tokens * LAMBDA_USD_PER_GB_SECOND < 0.05

    def test_legacy_balances_convert_to_the_new_scale(self):
        from backend.common.auth.token_costs import DEFAULT_STARTER_TOKENS, convert_legacy_balance

        assert convert_legacy_balance(500) == DEFAULT_STARTER_TOKENS  # old starter
        assert convert_legacy_balance(0) == DEFAULT_STARTER_TOKENS  # everyone gets the free amount
        assert convert_legacy_balance(2000) == 120_000  # admin top-ups keep their value


# ─── Phase 3: Token dependency ────────────────────────────────────────────────


class TestRequireSimulationTokens:
    """The require_simulation_tokens dependency factory."""

    def test_import(self):
        pass

    def test_flatrate_user_bypasses_check(self):
        """Flatrate user should not have tokens deducted."""
        from backend.common.auth.token_dependency import _check_token_balance

        future = datetime.now(timezone.utc) + timedelta(days=30)
        user = UserIdentity(
            id="1",
            email="a@b.com",
            username="alice",
            simulation_tokens=0,
            flatrate_until=future,
        )
        # Should not raise even with 0 tokens
        result = _check_token_balance(user, cost=5)
        assert result.should_deduct is False

    def test_sufficient_tokens_allows(self):
        from backend.common.auth.token_dependency import _check_token_balance

        user = UserIdentity(
            id="1",
            email="a@b.com",
            username="alice",
            simulation_tokens=100,
        )
        result = _check_token_balance(user, cost=5)
        assert result.should_deduct is True
        assert result.cost == 5

    def test_insufficient_tokens_raises(self):
        from backend.common.auth.token_dependency import _check_token_balance

        user = UserIdentity(
            id="1",
            email="a@b.com",
            username="alice",
            simulation_tokens=3,
        )
        from backend.common.auth.token_dependency import InsufficientTokensError

        with pytest.raises(InsufficientTokensError) as exc_info:
            _check_token_balance(user, cost=5)
        assert exc_info.value.required == 5
        assert exc_info.value.balance == 3

    def test_zero_cost_always_passes(self):
        from backend.common.auth.token_dependency import _check_token_balance

        user = UserIdentity(
            id="1",
            email="a@b.com",
            username="alice",
            simulation_tokens=0,
        )
        result = _check_token_balance(user, cost=0)
        assert result.should_deduct is False

    def test_exact_balance_allows(self):
        from backend.common.auth.token_dependency import _check_token_balance

        user = UserIdentity(
            id="1",
            email="a@b.com",
            username="alice",
            simulation_tokens=5,
        )
        result = _check_token_balance(user, cost=5)
        assert result.should_deduct is True


class TestMeteredCharging:
    """charge_simulation_tokens bills the measured duration, flatrate only logs."""

    def _user(self, **kw):
        return UserIdentity(id="u1", email="a@b.com", username="alice", **kw)

    def test_charges_duration_times_memory(self, monkeypatch):
        from unittest.mock import patch

        from backend.common.auth.token_dependency import TokenCheckResult, charge_simulation_tokens

        monkeypatch.setenv("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", "2048")
        check = TokenCheckResult(should_deduct=True, cost=1)
        with (
            patch("backend.common.repositories.user_repository.UserRepository") as repo,
            patch("backend.common.auth.token_dependency._log_usage") as log,
        ):
            repo.return_value.charge_user_tokens.return_value = (6, 994)
            charged = charge_simulation_tokens(self._user(simulation_tokens=1000), check, "x", 3.0)
        repo.return_value.charge_user_tokens.assert_called_once_with("u1", 6)  # 3 s × 2 GB
        assert charged == 6
        assert log.call_args.kwargs["cost"] == 6 and log.call_args.kwargs["balance_after"] == 994

    def test_measures_from_the_balance_check(self, monkeypatch):
        from unittest.mock import patch

        from backend.common.auth.token_dependency import TokenCheckResult, charge_simulation_tokens

        monkeypatch.setenv("AWS_LAMBDA_FUNCTION_MEMORY_SIZE", "1024")
        with patch(
            "backend.common.auth.token_dependency.time.perf_counter", side_effect=[10.0, 14.5]
        ):
            check = TokenCheckResult(should_deduct=True, cost=1)
            with (
                patch("backend.common.repositories.user_repository.UserRepository") as repo,
                patch("backend.common.auth.token_dependency._log_usage"),
            ):
                repo.return_value.charge_user_tokens.return_value = (5, 95)
                charge_simulation_tokens(self._user(simulation_tokens=100), check)
        repo.return_value.charge_user_tokens.assert_called_once_with("u1", 5)  # 4.5 GB-s → 5

    def test_flatrate_is_logged_not_charged(self):
        from unittest.mock import patch

        from backend.common.auth.token_dependency import TokenCheckResult, charge_simulation_tokens

        check = TokenCheckResult(should_deduct=False, cost=1, reason="flatrate active")
        with (
            patch("backend.common.repositories.user_repository.UserRepository") as repo,
            patch("backend.common.auth.token_dependency._log_usage") as log,
        ):
            assert charge_simulation_tokens(self._user(), check, "x", 2.0) == 0
        repo.return_value.charge_user_tokens.assert_not_called()
        assert log.call_args.kwargs["was_flatrate"] is True
