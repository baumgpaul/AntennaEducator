# AWS Admin Email Verification and Approval
# Bypass email verification code by using admin commands

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [string]$UserPoolId = "eu-west-1_IrKrKMip7",
    [string]$Region = "eu-west-1",
    [string]$Profile = "antenna-staging"
)

Write-Host "`n=== AWS Admin User Verification & Approval ===" -ForegroundColor Cyan
Write-Host "User Pool: $UserPoolId" -ForegroundColor Gray
Write-Host "Email: $Email`n" -ForegroundColor Gray

# Step 1: Confirm user email (bypass verification code)
Write-Host "Step 1: Confirming user email..." -ForegroundColor Yellow
try {
    aws cognito-idp admin-confirm-sign-up `
        --user-pool-id $UserPoolId `
        --username $Email `
        --region $Region `
        --profile $Profile 2>&1 | Out-Null
    
    Write-Host "✓ Email verified (admin override)" -ForegroundColor Green
} catch {
    $errorMsg = $_.Exception.Message
    if ($errorMsg -like "*NotAuthorizedException*" -or $errorMsg -like "*already confirmed*") {
        Write-Host "✓ User already verified" -ForegroundColor Green
    } else {
        Write-Host "✗ Verification failed: $errorMsg" -ForegroundColor Red
        Write-Host "`nAlternative: Use AWS Console:" -ForegroundColor Yellow
        Write-Host "  1. Go to Cognito Console → User Pools → $UserPoolId" -ForegroundColor White
        Write-Host "  2. Click Users tab → Find user: $Email" -ForegroundColor White
        Write-Host "  3. Click username → Click 'Confirm user' button`n" -ForegroundColor White
        exit 1
    }
}

# Step 2: Get user's Cognito Sub
Write-Host "`nStep 2: Getting user Cognito Sub..." -ForegroundColor Yellow
try {
    $userInfo = aws cognito-idp admin-get-user `
        --user-pool-id $UserPoolId `
        --username $Email `
        --region $Region `
        --profile $Profile `
        --output json | ConvertFrom-Json
    
    $cognitoSub = ($userInfo.UserAttributes | Where-Object { $_.Name -eq "sub" }).Value
    $emailVerified = ($userInfo.UserAttributes | Where-Object { $_.Name -eq "email_verified" }).Value
    
    Write-Host "✓ User found" -ForegroundColor Green
    Write-Host "  Cognito Sub: $cognitoSub" -ForegroundColor Gray
    Write-Host "  Email Verified: $emailVerified" -ForegroundColor Gray
    Write-Host "  Status: $($userInfo.UserStatus)" -ForegroundColor Gray
    
} catch {
    Write-Host "✗ Failed to get user info: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Approve user in DynamoDB
Write-Host "`nStep 3: Approving user in DynamoDB..." -ForegroundColor Yellow
try {
    aws dynamodb update-item `
        --table-name antenna-simulator-staging `
        --key "{`"PK`": {`"S`": `"USER#$cognitoSub`"}, `"SK`": {`"S`": `"METADATA`"}}" `
        --update-expression "SET is_approved = :approved" `
        --expression-attribute-values "{`":approved`": {`"BOOL`": true}}" `
        --region $Region `
        --profile $Profile 2>&1 | Out-Null
    
    Write-Host "✓ User approved in DynamoDB" -ForegroundColor Green
    
} catch {
    Write-Host "⚠ DynamoDB update might have failed: $_" -ForegroundColor Yellow
    Write-Host "`nAlternative: Use AWS Console:" -ForegroundColor Yellow
    Write-Host "  1. Go to DynamoDB → Tables → antenna-simulator-staging" -ForegroundColor White
    Write-Host "  2. Find item with PK = USER#$cognitoSub" -ForegroundColor White
    Write-Host "  3. Edit item → Set is_approved = true`n" -ForegroundColor White
}

# Summary
Write-Host "`n=== User Ready for Login ===" -ForegroundColor Green
Write-Host "`nCredentials:" -ForegroundColor Cyan
Write-Host "  Email: $Email" -ForegroundColor White
Write-Host "  Cognito Sub: $cognitoSub" -ForegroundColor White
Write-Host "  Email Verified: ✅" -ForegroundColor Green
Write-Host "  Approved: ✅" -ForegroundColor Green
Write-Host "`nYou can now login with this account!" -ForegroundColor Green
Write-Host "`nTest login:" -ForegroundColor Cyan
Write-Host "  `$loginBody = @{email=`"$Email`"; password=`"YOUR_PASSWORD`"} | ConvertTo-Json" -ForegroundColor White
Write-Host "  Invoke-WebRequest -Uri `"https://vhciv2vd0e.execute-api.eu-west-1.amazonaws.com/staging/api/v1/auth/login`" -Method POST -Body `$loginBody -ContentType `"application/json`"`n" -ForegroundColor White
