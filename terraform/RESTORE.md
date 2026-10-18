# Backup & restore runbook

What protects the data, and how to get it back. Commands assume
`--profile antenna-staging --region eu-west-1`; replace `staging` for other environments.

| Store | Protection | Window |
|---|---|---|
| DynamoDB `antenna-simulator-staging` (users, projects, tokens) | Point-in-time recovery + deletion protection | 35 days, to the second |
| S3 `antenna-simulator-results-staging` (simulation results) | Versioning; old versions expire | 30 days after overwrite/delete |
| S3 `antenna-simulator-data-staging-<account-id>` | Versioning; old versions expire | 30 days after overwrite/delete |
| S3 frontend bucket | Versioning (rollback); rebuildable from git | 30 days |

Terraform state lives in its own versioned bucket with a lock table (`terraform/bootstrap`).

## DynamoDB: restore to a point in time

PITR always restores into a **new** table. The app keeps running on the old one
until you switch.

```sh
P="--profile antenna-staging --region eu-west-1"
SRC=antenna-simulator-staging
DST=antenna-simulator-staging-restore-$(date +%Y%m%d%H%M)

aws dynamodb describe-continuous-backups --table-name $SRC $P   # shows the restorable window

aws dynamodb restore-table-to-point-in-time $P \
  --source-table-name $SRC --target-table-name $DST \
  --restore-date-time 2026-10-18T09:00:00Z            # or --use-latest-restorable-time

aws dynamodb wait table-exists --table-name $DST $P   # usually 5–20 min
aws dynamodb scan --table-name $DST --select COUNT $P
```

Then either

- **copy back selected items** (one user's projects, an accidentally deleted course):
  `get-item` from `$DST`, `put-item` into `$SRC`; or
- **switch the app to the restored table**: rename is impossible, so set
  `table_name` in `environments/staging/main.tf` to `$DST`, `terraform import`
  it into `module.dynamodb.aws_dynamodb_table.main` (after `terraform state rm`
  of the old one), and apply. Restored tables come back **without** PITR, TTL,
  deletion protection and tags — the apply re-adds them.

Delete the restored table when done (deletion protection is off on it):
`aws dynamodb delete-table --table-name $DST $P`.

## S3: recover an overwritten or deleted object

```sh
B=antenna-simulator-results-staging
aws s3api list-object-versions --bucket $B --prefix <key> $P
# deleted: remove the delete marker → the previous version is current again
aws s3api delete-object --bucket $B --key <key> --version-id <delete-marker-id> $P
# overwritten: copy the old version on top
aws s3api copy-object --bucket $B --key <key> \
  --copy-source "$B/<key>?versionId=<old-version-id>" $P
```

## Drill (twice a year, ~15 min, cost ≈ cents)

1. Restore DynamoDB with `--use-latest-restorable-time` into a `-restore-` table.
2. Compare `scan --select COUNT` of source and restore; `get-item` one known user.
3. Upload a test object to the results bucket, delete it, recover it as above, delete it again.
4. Delete the restored table. Note the date and restore duration below.

| Date | DynamoDB restore time | Items src / restored | S3 recovery | By |
|---|---|---|---|---|
| | | | | |
