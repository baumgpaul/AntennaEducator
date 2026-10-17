#!/usr/bin/env python3
"""
seed_cefc_users.py — Create event users in Cognito + DynamoDB.

The user list is read from a local JSON file that is NOT committed
(``dev_tools/cefc_users.json``, gitignored). Start from the template::

    cp dev_tools/cefc_users.example.json dev_tools/cefc_users.json

Passwords are never stored in the repo. Each newly created user gets a
random password; all new credentials are written to a local CSV
(``dev_tools/cefc_credentials.csv``, gitignored) for handing out.
Existing users keep their password unless ``--reset-passwords`` is given.

Usage (from repo root, venv activated):
    python dev_tools/seed_cefc_users.py
    python dev_tools/seed_cefc_users.py --users-file path/to/users.json
    python dev_tools/seed_cefc_users.py --reset-passwords

Prerequisites:
    - AWS CLI configured with profile "antenna-staging"
    - CEFC Terraform environment already applied
      (terraform/environments/cefc/ must have been run)
    - Python packages: boto3
"""

import argparse
import csv
import json
import secrets
import string
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import boto3

# ── Configuration ─────────────────────────────────────────────────────────────

AWS_PROFILE = "antenna-staging"
AWS_REGION = "eu-west-1"
DEV_TOOLS_DIR = Path(__file__).parent
TERRAFORM_DIR = DEV_TOOLS_DIR.parent / "terraform" / "environments" / "cefc"
DEFAULT_USERS_FILE = DEV_TOOLS_DIR / "cefc_users.json"
DEFAULT_CREDENTIALS_FILE = DEV_TOOLS_DIR / "cefc_credentials.csv"

PASSWORD_LENGTH = 14

# ── Helpers ───────────────────────────────────────────────────────────────────


def _tf_output(key: str) -> str:
    """Read a single terraform output value from the cefc workspace."""
    result = subprocess.run(
        ["terraform", "output", "-raw", key],
        cwd=TERRAFORM_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"terraform output {key!r} failed:\n{result.stderr}")
    return result.stdout.strip()


def _get_infra() -> dict:
    """Fetch all required terraform outputs once."""
    print("Reading terraform outputs from CEFC environment …")
    return {
        "user_pool_id": _tf_output("cognito_user_pool_id"),
        "dynamodb_table": _tf_output("dynamodb_table_name"),
    }


def _generate_password() -> str:
    """Random password that satisfies the default Cognito policy
    (lower + upper + digit, no symbols required)."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(PASSWORD_LENGTH))
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
        ):
            return pw


def _get_cognito_sub(cognito_client, user_pool_id: str, email: str) -> str | None:
    """Return the Cognito ``sub`` of an existing user, or None."""
    try:
        resp = cognito_client.admin_get_user(UserPoolId=user_pool_id, Username=email)
    except cognito_client.exceptions.UserNotFoundException:
        return None
    return next(a["Value"] for a in resp["UserAttributes"] if a["Name"] == "sub")


def _set_password(cognito_client, user_pool_id: str, email: str, password: str) -> None:
    """Set a permanent password (skips FORCE_CHANGE_PASSWORD state)."""
    cognito_client.admin_set_user_password(
        UserPoolId=user_pool_id,
        Username=email,
        Password=password,
        Permanent=True,
    )


def _create_cognito_user(
    cognito_client,
    user_pool_id: str,
    email: str,
    username: str,
    reset_password: bool,
) -> tuple[str, str | None]:
    """Create a Cognito user if missing.

    Returns ``(sub, password)`` where ``password`` is the newly set password,
    or None when an existing user's password was left untouched.
    """
    print(f"  [Cognito] {email} …", end=" ")

    user_sub = _get_cognito_sub(cognito_client, user_pool_id, email)
    if user_sub is not None:
        if not reset_password:
            print(f"already exists (sub={user_sub}), password unchanged")
            return user_sub, None
        password = _generate_password()
        _set_password(cognito_client, user_pool_id, email, password)
        print(f"already exists (sub={user_sub}), password reset")
        return user_sub, password

    # Create user (suppress welcome email)
    resp = cognito_client.admin_create_user(
        UserPoolId=user_pool_id,
        Username=email,
        UserAttributes=[
            {"Name": "email", "Value": email},
            {"Name": "email_verified", "Value": "true"},
            {"Name": "preferred_username", "Value": username},
        ],
        MessageAction="SUPPRESS",
    )
    user_sub = next(a["Value"] for a in resp["User"]["Attributes"] if a["Name"] == "sub")

    password = _generate_password()
    _set_password(cognito_client, user_pool_id, email, password)

    print(f"created (sub={user_sub})")
    return user_sub, password


def _upsert_dynamo_user(
    table,
    user_sub: str,
    email: str,
    username: str,
    role: str,
    simulation_tokens: int,
    flatrate_until: str | None,
) -> None:
    """Write (or overwrite) the DynamoDB METADATA record for a user."""
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "PK": f"USER#{user_sub}",
        "SK": "METADATA",
        "EntityType": "USER",
        "UserId": user_sub,
        "Email": email,
        "Username": username,
        "IsAdmin": role == "admin",
        "IsLocked": False,
        "Role": role,
        "CreatedAt": now,
        "SimulationTokens": simulation_tokens,
    }
    if flatrate_until:
        item["FlatrateUntil"] = flatrate_until

    table.put_item(Item=item)
    print(
        f"  [DynamoDB] Upserted: {username} | role={role} | "
        f"tokens={simulation_tokens} | flatrate={flatrate_until or 'none'}"
    )


# ── User definitions ──────────────────────────────────────────────────────────


def _load_user_list(users_file: Path) -> list[dict]:
    """Expand the JSON user definition file into a flat list of users.

    File format (see cefc_users.example.json)::

        {
          "users":  [{"email", "username", "role", "simulation_tokens",
                      "flatrate_years"?}, ...],
          "groups": [{"prefix", "count", "email_domain", "role",
                      "simulation_tokens", "flatrate_years"?}, ...]
        }
    """
    if not users_file.exists():
        sys.exit(
            f"User file not found: {users_file}\n"
            f"Copy {DEV_TOOLS_DIR / 'cefc_users.example.json'} to {DEFAULT_USERS_FILE.name} "
            "and fill in the real accounts (the copy is gitignored)."
        )
    spec = json.loads(users_file.read_text(encoding="utf-8"))

    def _flatrate(years: int | None) -> str | None:
        if not years:
            return None
        return (datetime.now(timezone.utc) + timedelta(days=365 * years)).isoformat()

    users = [
        {
            "email": u["email"],
            "username": u["username"],
            "role": u.get("role", "user"),
            "simulation_tokens": int(u.get("simulation_tokens", 0)),
            "flatrate_until": _flatrate(u.get("flatrate_years")),
        }
        for u in spec.get("users", [])
    ]

    for g in spec.get("groups", []):
        for i in range(1, int(g["count"]) + 1):
            username = f"{g['prefix']}{i:02d}"
            users.append(
                {
                    # Cognito requires an email-format username
                    "email": f"{username}@{g['email_domain']}",
                    "username": username,
                    "role": g.get("role", "user"),
                    "simulation_tokens": int(g.get("simulation_tokens", 0)),
                    "flatrate_until": _flatrate(g.get("flatrate_years")),
                }
            )

    return users


def _write_credentials(path: Path, rows: list[dict]) -> None:
    """Append newly set credentials to the (gitignored) CSV file."""
    is_new = not path.exists()
    with path.open("a", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["username", "email", "password", "created_at"])
        if is_new:
            writer.writeheader()
        writer.writerows(rows)


# ── Main ──────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--users-file", type=Path, default=DEFAULT_USERS_FILE)
    parser.add_argument("--credentials-file", type=Path, default=DEFAULT_CREDENTIALS_FILE)
    parser.add_argument(
        "--reset-passwords",
        action="store_true",
        help="Generate new passwords for users that already exist",
    )
    args = parser.parse_args()

    users = _load_user_list(args.users_file)

    infra = _get_infra()
    user_pool_id = infra["user_pool_id"]
    dynamodb_table = infra["dynamodb_table"]

    print(f"\nUser Pool ID : {user_pool_id}")
    print(f"DynamoDB Table: {dynamodb_table}")
    print()

    session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    cognito = session.client("cognito-idp")
    dynamo = session.resource("dynamodb")
    table = dynamo.Table(dynamodb_table)

    created = []
    failed = []
    new_credentials = []

    for user in users:
        print(f"\n── {user['username']} ({user['email']}) ──")
        try:
            sub, password = _create_cognito_user(
                cognito,
                user_pool_id=user_pool_id,
                email=user["email"],
                username=user["username"],
                reset_password=args.reset_passwords,
            )
            if password is not None:
                new_credentials.append(
                    {
                        "username": user["username"],
                        "email": user["email"],
                        "password": password,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                )
            _upsert_dynamo_user(
                table=table,
                user_sub=sub,
                email=user["email"],
                username=user["username"],
                role=user["role"],
                simulation_tokens=user["simulation_tokens"],
                flatrate_until=user["flatrate_until"],
            )
            created.append(user)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR: {exc}")
            failed.append((user["username"], str(exc)))

    if new_credentials:
        _write_credentials(args.credentials_file, new_credentials)

    # ── Summary ───────────────────────────────────────────────────────────
    print("\n" + "=" * 72)
    print("CEFC USER CREATION SUMMARY")
    print("=" * 72)
    print(f"DynamoDB    : {dynamodb_table}")
    print(f"Cognito Pool: {user_pool_id}")
    print()
    print(f"{'Username':<22} {'Email':<35} {'Role':<12} {'Tokens':>7}  Flatrate")
    print("-" * 90)
    for u in users:
        flatrate_label = "yes" if u["flatrate_until"] else "no"
        print(
            f"{u['username']:<22} {u['email']:<35} {u['role']:<12} "
            f"{u['simulation_tokens']:>7}  {flatrate_label}"
        )

    print()
    print(f"Processed successfully : {len(created)}")
    if new_credentials:
        print(
            f"New passwords set      : {len(new_credentials)} "
            f"→ written to {args.credentials_file} (gitignored — keep it private)"
        )
    if failed:
        print(f"Failed                 : {len(failed)}")
        for name, reason in failed:
            print(f"  - {name}: {reason}")
        sys.exit(1)

    print("All users processed successfully.")


if __name__ == "__main__":
    main()
