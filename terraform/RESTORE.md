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

PowerShell (same steps; run the blocks in one window):

```powershell
$P   = @('--profile', 'antenna-staging', '--region', 'eu-west-1')
$SRC = 'antenna-simulator-staging'
$DST = "antenna-simulator-staging-restore-$(Get-Date -Format yyyyMMddHHmm)"
$start = Get-Date
aws dynamodb restore-table-to-point-in-time @P `
  --source-table-name $SRC --target-table-name $DST --use-latest-restorable-time | Out-Null
aws dynamodb wait table-exists --table-name $DST @P
"Restore took $([int]((Get-Date) - $start).TotalMinutes) min"
aws dynamodb scan --table-name $SRC --select COUNT @P --query Count
aws dynamodb scan --table-name $DST --select COUNT @P --query Count

$B = 'antenna-simulator-results-staging'; $K = 'restore-drill/test.txt'
$f = Join-Path $env:TEMP 'drill.txt'; "drill $(Get-Date)" | Set-Content $f
aws s3 cp $f "s3://$B/$K" @P
aws s3 rm "s3://$B/$K" @P
$M = aws s3api list-object-versions --bucket $B --prefix $K @P `
       --query 'DeleteMarkers[0].VersionId' --output text
aws s3api delete-object --bucket $B --key $K --version-id $M @P | Out-Null
aws s3 cp "s3://$B/$K" - @P                     # prints the text: recovered

# Clean up (the restored table holds real user data)
aws dynamodb delete-table --table-name $DST @P | Out-Null
$v = aws s3api list-object-versions --bucket $B --prefix $K @P --output json | ConvertFrom-Json
@($v.Versions) + @($v.DeleteMarkers) | Where-Object { $_ } | ForEach-Object {
  aws s3api delete-object --bucket $B --key $K --version-id $_.VersionId @P | Out-Null }
Remove-Item $f
```

| Date | DynamoDB restore time | Items src / restored | S3 recovery | By |
|---|---|---|---|---|
| 2026-10-19 | 3 min (latest restorable time; PITR window 35 days) | 10346 / 10346 | delete marker removed, object readable | Paul |
