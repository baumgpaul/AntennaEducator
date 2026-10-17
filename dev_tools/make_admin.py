#!/usr/bin/env python3
"""
make_admin.py — bootstrap an administrator (TEST_PLAN B3).

New accounts wait for an admin's approval, so a fresh deployment needs one
admin created out of band. Sign up normally (the account is then pending),
then run this once to make that account an approved admin:

    # AWS (Cognito mode)
    python dev_tools/make_admin.py you@example.com \\
        --table antenna-simulator-staging --profile antenna-staging

    # Local Docker (DynamoDB Local)
    python dev_tools/make_admin.py you@example.com \\
        --table antenna-simulator-local --endpoint http://localhost:8888

Further admins can then be appointed from the Admin page.
"""

import argparse
import sys

import boto3
from boto3.dynamodb.conditions import Attr

from backend.common.auth.token_costs import DEFAULT_STARTER_TOKENS


def find_user_by_email(table, email: str) -> dict | None:
    """Scan for the user's METADATA item (fine for course-sized user bases)."""
    kwargs = {
        "FilterExpression": Attr("EntityType").eq("USER")
        & Attr("SK").eq("METADATA")
        & Attr("Email").eq(email)
    }
    while True:
        resp = table.scan(**kwargs)
        if resp.get("Items"):
            return resp["Items"][0]
        if "LastEvaluatedKey" not in resp:
            return None
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def make_admin(table, email: str) -> dict:
    """Make the user an approved admin; grants starter tokens if they have none."""
    user = find_user_by_email(table, email)
    if user is None:
        raise LookupError(
            f"No user with e-mail {email!r}. Sign up first (and, in Cognito mode, "
            "log in once so the profile exists)."
        )
    tokens = max(int(user.get("SimulationTokens", 0)), DEFAULT_STARTER_TOKENS)
    table.update_item(
        Key={"PK": user["PK"], "SK": "METADATA"},
        UpdateExpression=(
            "SET #r = :admin, IsAdmin = :true, IsApproved = :true, IsLocked = :false, "
            "SimulationTokens = :tokens"
        ),
        ExpressionAttributeNames={"#r": "Role"},
        ExpressionAttributeValues={
            ":admin": "admin",
            ":true": True,
            ":false": False,
            ":tokens": tokens,
        },
    )
    return user


def main() -> None:
    parser = argparse.ArgumentParser(description="Make an existing user an approved admin.")
    parser.add_argument("email")
    parser.add_argument("--table", required=True, help="DynamoDB table name")
    parser.add_argument("--profile", help="AWS CLI profile (AWS mode)")
    parser.add_argument("--region", default="eu-west-1")
    parser.add_argument("--endpoint", help="DynamoDB endpoint URL (DynamoDB Local)")
    args = parser.parse_args()

    session = boto3.Session(profile_name=args.profile, region_name=args.region)
    table = session.resource("dynamodb", endpoint_url=args.endpoint).Table(args.table)
    try:
        user = make_admin(table, args.email)
    except LookupError as exc:
        sys.exit(str(exc))
    print(f"{args.email} (id {user.get('UserId')}) is now an approved admin.")
    print("It can take up to a minute until running services pick up the change.")


if __name__ == "__main__":
    main()
