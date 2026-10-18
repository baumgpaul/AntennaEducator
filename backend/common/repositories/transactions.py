"""All-or-nothing writes of related items (DynamoDB TransactWriteItems).

Enrollments and submissions are stored twice (under COURSE# and USER#).
``batch_writer`` is not atomic, so a failure between the two writes left
one-sided records (B42); these helpers write both or neither. IAM: a
transaction is authorised by the per-item actions (PutItem, DeleteItem,
UpdateItem), not by a separate permission.
"""

from typing import Any, Dict

from boto3.dynamodb.types import TypeSerializer

_serializer = TypeSerializer()


def _attrs(values: Dict[str, Any]) -> Dict[str, Any]:
    return {k: _serializer.serialize(v) for k, v in values.items()}


def _transact(table, operations) -> None:
    table.meta.client.transact_write_items(TransactItems=operations)


def transact_put(table, *items: Dict[str, Any]) -> None:
    _transact(table, [{"Put": {"TableName": table.name, "Item": _attrs(i)}} for i in items])


def transact_delete(table, *keys: Dict[str, str]) -> None:
    _transact(table, [{"Delete": {"TableName": table.name, "Key": _attrs(k)}} for k in keys])


def transact_update(
    table,
    keys,
    update_expression: str,
    names: Dict[str, str],
    values: Dict[str, Any],
) -> None:
    """Apply the same update to every key in one transaction."""
    _transact(
        table,
        [
            {
                "Update": {
                    "TableName": table.name,
                    "Key": _attrs(k),
                    "UpdateExpression": update_expression,
                    "ExpressionAttributeNames": names,
                    "ExpressionAttributeValues": _attrs(values),
                }
            }
            for k in keys
        ],
    )
