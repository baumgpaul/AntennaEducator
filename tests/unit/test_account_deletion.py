"""Self-service account deletion (GDPR right to erasure)."""

from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user_allow_pending
from backend.common.auth.identity import UserIdentity, UserRole
from backend.projects.account_service import delete_user_data


class FakeTable:
    """Enough of a DynamoDB Table for query(PK=…) and batch deletes."""

    def __init__(self, items):
        self.items = {(i["PK"], i["SK"]): i for i in items}

    def query(self, KeyConditionExpression, **_):
        pk = KeyConditionExpression.get_expression()["values"][1]
        return {"Items": [i for (p, _s), i in self.items.items() if p == pk]}

    @contextmanager
    def batch_writer(self):
        table = self

        class _Batch:
            def delete_item(self, Key):
                table.items.pop((Key["PK"], Key["SK"]), None)

        yield _Batch()


def _items():
    return [
        {"PK": "USER#u1", "SK": "METADATA", "Email": "S@Uni.example"},
        {"PK": "EMAIL#s@uni.example", "SK": "CLAIM", "UserId": "u1"},
        {"PK": "USER#u1", "SK": "PROJECT#p1"},
        {"PK": "USER#u1", "SK": "PROJECT#p2"},
        {"PK": "USER#u1", "SK": "FOLDER#f1"},
        {"PK": "USER#u1", "SK": "USAGE#2026-10-18#ab"},
        {"PK": "USER#u1", "SK": "ENROLLMENT#c1"},
        {"PK": "COURSE#c1", "SK": "ENROLLMENT#u1"},
        {"PK": "USER#u1", "SK": "SUBMISSION#s1", "CourseId": "c1", "UserId": "u1"},
        {"PK": "COURSE#c1", "SK": "SUBMISSION#s1", "CourseId": "c1", "UserId": "u1"},
        # other people's data must survive
        {"PK": "USER#u2", "SK": "METADATA"},
        {"PK": "USER#u2", "SK": "PROJECT#p9"},
        {"PK": "COURSE#c1", "SK": "ENROLLMENT#u2"},
        {"PK": "COURSE#c1", "SK": "METADATA"},
    ]


def _services():
    results = AsyncMock()
    results.delete_results.return_value = 1
    docs = AsyncMock()
    docs.delete_all.return_value = 2
    return results, docs


@pytest.mark.asyncio
async def test_deletes_all_user_items_and_forward_copies():
    table = FakeTable(_items())
    results, docs = _services()

    counts = await delete_user_data(table, "u1", results, docs)

    assert sorted(table.items) == [
        ("COURSE#c1", "ENROLLMENT#u2"),
        ("COURSE#c1", "METADATA"),
        ("USER#u2", "METADATA"),
        ("USER#u2", "PROJECT#p9"),
    ]
    assert counts["projects"] == 2
    assert counts["items"] == 10  # incl. the e-mail claim, so it can register again


@pytest.mark.asyncio
async def test_deletes_s3_data_of_projects_and_submission_snapshots():
    results, docs = _services()
    await delete_user_data(FakeTable(_items()), "u1", results, docs)

    deleted = sorted(c.args[0] for c in results.delete_results.await_args_list)
    assert deleted == ["p1", "p2", "submission-s1"]
    assert sorted(c.args[0] for c in docs.delete_all.await_args_list) == ["p1", "p2"]


@pytest.mark.asyncio
async def test_s3_failure_leaves_database_untouched():
    """S3 goes first, so a failure can be retried instead of orphaning files."""
    table = FakeTable(_items())
    results, docs = _services()
    results.delete_results.side_effect = RuntimeError("S3 down")

    with pytest.raises(RuntimeError):
        await delete_user_data(table, "u1", results, docs)
    assert len(table.items) == len(_items())


# ── Endpoint ──────────────────────────────────────────────────────────────────


@pytest.fixture
def client():
    from backend.projects import main

    yield TestClient(main.app), main
    main.app.dependency_overrides.clear()


def _as(main, role: UserRole):
    user = UserIdentity(id="u1", email="s@uni.example", username="s", role=role)
    main.app.dependency_overrides[get_current_user_allow_pending] = lambda: user
    return user


def test_endpoint_deletes_data_and_identity(client):
    tc, main = client
    user = _as(main, UserRole.USER)
    provider = AsyncMock()
    table = FakeTable([])
    main.app.dependency_overrides[main.get_repository] = lambda: type("R", (), {"table": table})()
    with (
        patch.object(main, "delete_user_data", AsyncMock()) as delete_data,
        patch.object(main, "create_auth_provider", return_value=provider),
    ):
        resp = tc.delete("/api/auth/me")

    assert resp.status_code == 204
    assert delete_data.await_args.args[:2] == (table, "u1")
    provider.delete_identity.assert_awaited_once_with(user)


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.MAINTAINER])
def test_admins_and_maintainers_cannot_self_delete(client, role):
    tc, main = client
    _as(main, role)
    with patch.object(main, "delete_user_data", AsyncMock()) as delete_data:
        resp = tc.delete("/api/auth/me")

    assert resp.status_code == 409
    delete_data.assert_not_awaited()


@pytest.mark.asyncio
async def test_course_records_removed_on_both_sides():
    from backend.projects.account_service import delete_course_records

    table = FakeTable(_items())
    results, _ = _services()
    removed = await delete_course_records(table, "c1", results)

    assert removed == 6  # u1 + u2 enrollments and the submission, forward + reverse each
    assert ("COURSE#c1", "ENROLLMENT#u1") not in table.items
    assert ("COURSE#c1", "ENROLLMENT#u2") not in table.items
    assert ("USER#u1", "ENROLLMENT#c1") not in table.items
    assert ("USER#u1", "SUBMISSION#s1") not in table.items
    assert ("COURSE#c1", "METADATA") in table.items  # not an enrollment/submission
    results.delete_results.assert_awaited_once_with("submission-s1")
