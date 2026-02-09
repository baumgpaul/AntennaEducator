# Test Cognito User Pool
# This script creates a test user and verifies Cognito functionality

param(
    [Parameter(Mandatory=$false)]
    [string]$Email = "test@example.com",

    [Parameter(Mandatory=$false)]
    [string]$Username = "testuser"
)

Write-Host "=== Testing Cognito User Pool ===" -ForegroundColor Cyan

# Get Cognito configuration from Terraform outputs
Push-Location "$PSScriptRoot\..\terraform\environments\staging"

try {
    $userPoolId = terraform output -raw cognito_user_pool_id
    $clientId = terraform output -raw cognito_client_id

    if ([string]::IsNullOrEmpty($userPoolId)) {
        Write-Host "Error: Could not get Cognito User Pool ID from Terraform" -ForegroundColor Red
        Write-Host "Make sure Cognito module is deployed first." -ForegroundColor Yellow
        exit 1
    }

    Write-Host "User Pool ID: $userPoolId" -ForegroundColor Gray
    Write-Host "Client ID: $clientId" -ForegroundColor Gray

    # Test 1: Create a test user
    Write-Host "`n1. Creating test user: $Email" -ForegroundColor Yellow

    $result = aws cognito-idp admin-create-user `
        --user-pool-id $userPoolId `
        --username $Email `
        --user-attributes Name="email",Value="$Email" Name="email_verified",Value="true" Name="preferred_username",Value="$Username" `
        --temporary-password "TempPass123!" `
        --profile antenna-staging `
        2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ User created successfully" -ForegroundColor Green
    } elseif ($result -match "UsernameExistsException") {
        Write-Host "⚠ User already exists, continuing..." -ForegroundColor Yellow
    } else {
        Write-Host "✗ Failed to create user: $result" -ForegroundColor Red
        Write-Host "Note: Don't exit, continue with remaining tests..." -ForegroundColor Yellow
    }

    # Test 2: List users
    Write-Host "`n2. Listing users in pool..." -ForegroundColor Yellow

    $users = aws cognito-idp list-users `
        --user-pool-id $userPoolId `
        --profile antenna-staging `
        --query "Users[*].[Username,UserStatus,Enabled]" `
        --output table

    Write-Host $users

    # Test 3: Describe user pool
    Write-Host "`n3. Checking user pool configuration..." -ForegroundColor Yellow

    $poolInfo = aws cognito-idp describe-user-pool `
        --user-pool-id $userPoolId `
        --profile antenna-staging `
        --query "UserPool.{Name:Name,MFA:MfaConfiguration,Status:Status,EmailVerification:AutoVerifiedAttributes}" `
        --output table

    Write-Host $poolInfo

    # Test 4: Get hosted UI login URL
    Write-Host "`n4. Generating hosted UI login URL..." -ForegroundColor Yellow

    $region = "eu-west-1"
    $domainUrl = terraform output -raw cognito_domain_url

    $loginUrl = "$domainUrl/login?client_id=$clientId&response_type=token&redirect_uri=http://localhost:3000/auth/callback&scope=email+openid+profile"

    Write-Host "`nHosted UI Login URL:" -ForegroundColor Cyan
    Write-Host $loginUrl -ForegroundColor White

    Write-Host "`nYou can test login by:"
    Write-Host "1. Opening the URL above in a browser"
    Write-Host "2. Using username: $Email"
    Write-Host "3. Using temporary password: TempPass123!"
    Write-Host "4. You'll be prompted to set a new password"

    # Test 5: Test password policy
    Write-Host "`n5. Testing password policy..." -ForegroundColor Yellow

    $passwordPolicy = aws cognito-idp describe-user-pool `
        --user-pool-id $userPoolId `
        --profile antenna-staging `
        --query "UserPool.Policies.PasswordPolicy" `
        --output json | ConvertFrom-Json

    Write-Host "Password Requirements:" -ForegroundColor Cyan
    Write-Host "  Minimum Length: $($passwordPolicy.MinimumLength)"
    Write-Host "  Require Uppercase: $($passwordPolicy.RequireUppercase)"
    Write-Host "  Require Lowercase: $($passwordPolicy.RequireLowercase)"
    Write-Host "  Require Numbers: $($passwordPolicy.RequireNumbers)"
    Write-Host "  Require Symbols: $($passwordPolicy.RequireSymbols)"

    Write-Host "`n=== Cognito Tests Complete ===" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "1. Test the hosted UI login URL above"
    Write-Host "2. Configure frontend with these environment variables:"
    Write-Host "   VITE_COGNITO_USER_POOL_ID=$userPoolId"
    Write-Host "   VITE_COGNITO_CLIENT_ID=$clientId"
    Write-Host "3. Implement auth integration in frontend (Task C3)"

} catch {
    Write-Host "Error during testing: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
