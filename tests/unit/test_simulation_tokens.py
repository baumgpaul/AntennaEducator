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


# ─── Phase 2: Token cost calculation ─────────────────────────────────────────


class TestTokenCosts:
    """Token cost lookup and calculation."""

    def test_import(self):
        pass

    def test_preprocessor_mesh_costs_1(self):
        from backend.common.auth.token_costs import get_endpoint_cost

        assert get_endpoint_cost("preprocessor", "mesh") == 1

    def test_solver_single_costs_5(self):
        from backend.common.auth.token_costs import get_endpoint_cost

        assert get_endpoint_cost("solver", "single") == 5

    def test_solver_multi_costs_5(self):
        from backend.common.auth.token_costs import get_endpoint_cost

        assert get_endpoint_cost("solver", "multi") == 5

    def test_postprocessor_far_field_costs_3(self):
        from backend.common.auth.token_costs import get_endpoint_cost

        assert get_endpoint_cost("postprocessor", "far_field") == 3

    def test_postprocessor_near_field_costs_3(self):
        from backend.common.auth.token_costs import get_endpoint_cost

        assert get_endpoint_cost("postprocessor", "near_field") == 3

    def test_postprocessor_export_costs_0(self):
        from backend.common.auth.token_costs import get_endpoint_cost

        assert get_endpoint_cost("postprocessor", "export") == 0

    def test_unknown_endpoint_costs_0(self):
        from backend.common.auth.token_costs import get_endpoint_cost

        assert get_endpoint_cost("unknown", "unknown") == 0

    def test_sweep_cost_scales_with_frequencies(self):
        from backend.common.auth.token_costs import calculate_sweep_cost

        assert calculate_sweep_cost(num_frequencies=1) == 5
        assert calculate_sweep_cost(num_frequencies=10) == 50
        assert calculate_sweep_cost(num_frequencies=20) == 100

    def test_sweep_cost_has_cap(self):
        """Sweep cost capped at 250 tokens to not punish exploration."""
        from backend.common.auth.token_costs import calculate_sweep_cost

        assert calculate_sweep_cost(num_frequencies=100) == 250

    def test_all_costs_dict_exposed(self):
        from backend.common.auth.token_costs import ENDPOINT_COSTS

        assert isinstance(ENDPOINT_COSTS, dict)
        assert len(ENDPOINT_COSTS) > 0

    def test_default_starter_tokens_constant(self):
        from backend.common.auth.token_costs import DEFAULT_STARTER_TOKENS

        assert DEFAULT_STARTER_TOKENS == 500


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
