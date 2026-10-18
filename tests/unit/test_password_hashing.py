"""Password hashing in local auth mode (direct bcrypt, no passlib)."""

import bcrypt

from backend.common.auth.local_provider import hash_password, verify_password


def test_roundtrip():
    h = hash_password("correct horse battery")
    assert h.startswith("$2b$")
    assert verify_password("correct horse battery", h)
    assert not verify_password("wrong password", h)


def test_long_password_is_truncated_not_rejected():
    # bcrypt>=5 raises on >72-byte input; we truncate like bcrypt 4 did
    pw = "ä" * 50  # 100 UTF-8 bytes
    h = hash_password(pw)
    assert verify_password(pw, h)


def test_hash_from_old_scheme_still_verifies():
    # Old hashes: bcrypt over the first 72 bytes (what passlib + bcrypt 4 stored)
    pw = "x" * 80
    old_hash = bcrypt.hashpw(pw.encode()[:72], bcrypt.gensalt()).decode()
    assert verify_password(pw, old_hash)


def test_malformed_hash_returns_false():
    assert not verify_password("password123", "")
    assert not verify_password("password123", "not-a-bcrypt-hash")
