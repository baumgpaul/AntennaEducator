# Phase C: Cognito Deployment - Quick Reference

## Overview
This guide covers the deployment and testing of AWS Cognito for user authentication in the Antenna Simulator.

## What Was Done (Task C1 - Complete)

### 1. Cognito Terraform Module Created
- **Location**: `terraform/modules/cognito/`
- **Features**:
  - User pool with email verification
  - Password policy (8+ chars, uppercase, lowercase, numbers)
  - Frontend client for SPA (no client secret)
  - OAuth flows configured
  - Callback URLs for staging and local development
  - Cognito hosted UI domain

### 2. Integration with Staging Environment
- Cognito module added to staging Terraform configuration
- Outputs configured for easy access to credentials
- SSM Parameter Store integration for CI/CD

## Deployment Steps

### Step 1: Deploy Cognito to AWS
```powershell
# Run the deployment script
.\dev_tools\deploy_cognito.ps1
```

This will:
1. Initialize Terraform
2. Plan Cognito deployment
3. Ask for confirmation
4. Deploy Cognito user pool and client
5. Save credentials to SSM Parameter Store

### Step 2: Test Cognito
```powershell
# Create a test user and verify functionality
.\dev_tools\test_cognito.ps1 -Email "your.email@example.com" -Username "yourname"
```

This will:
1. Create a test user
2. List all users
3. Display user pool configuration
4. Generate hosted UI login URL
5. Show password policy

### Step 3: Manual Testing (Optional)

#### Test via AWS Console
1. Go to AWS Console → Cognito
2. Select your user pool: `antenna-simulator-staging`
3. Go to Users → Create user
4. Test login via hosted UI

#### Test via AWS CLI
```powershell
# Get user pool details
aws cognito-idp describe-user-pool --user-pool-id <pool-id> --profile antenna-staging

# List users
aws cognito-idp list-users --user-pool-id <pool-id> --profile antenna-staging

# Create a user
aws cognito-idp admin-create-user `
  --user-pool-id <pool-id> `
  --username test@example.com `
  --temporary-password TempPass123! `
  --profile antenna-staging

# Set permanent password
aws cognito-idp admin-set-user-password `
  --user-pool-id <pool-id> `
  --username test@example.com `
  --password YourPassword123! `
  --permanent `
  --profile antenna-staging
```

## Configuration Values

After deployment, you'll need these values for the next steps:

### For API Gateway (Task C2)
- `cognito_user_pool_id` - Used for JWT validation
- `cognito_issuer_url` - JWT issuer for authorizer
- `cognito_client_id` - Audience claim validation

### For Frontend (Task C3)
```env
VITE_AUTH_PROVIDER=cognito
VITE_COGNITO_USER_POOL_ID=<from terraform output>
VITE_COGNITO_CLIENT_ID=<from terraform output>
VITE_COGNITO_REGION=eu-west-1
```

## Hosted UI URLs

### Login URL Format
```
https://<cognito-domain>.auth.eu-west-1.amazoncognito.com/login?client_id=<client-id>&response_type=token&redirect_uri=http://localhost:3000/auth/callback&scope=email+openid+profile
```

### OAuth Flows Enabled
- **Authorization Code** - For server-side apps (future)
- **Implicit** - For SPA (current)
- **Refresh Token** - For token refresh

## Troubleshooting

### Issue: "Domain already exists"
```powershell
# Check existing domain
aws cognito-idp describe-user-pool-domain --domain <domain-name> --profile antenna-staging

# If needed, update domain suffix in terraform/environments/staging/main.tf
```

### Issue: "Cannot find user pool"
```powershell
# Verify deployment
cd terraform/environments/staging
terraform output cognito_user_pool_id

# If empty, redeploy
terraform apply -target=module.cognito
```

### Issue: User creation fails
Check that:
1. Email is valid format
2. Password meets policy (8+ chars, uppercase, lowercase, numbers)
3. User doesn't already exist

### Issue: Hosted UI not accessible
```powershell
# Verify domain is provisioned
terraform output cognito_domain_url

# Wait 1-2 minutes for DNS propagation
```

## Security Notes

### Current Configuration (MVP)
- ✅ Email verification enabled
- ✅ Secure password policy
- ✅ HTTPS only
- ✅ Refresh tokens (30 days)
- ❌ MFA disabled (for ease of testing)
- ❌ Account takeover protection disabled

### Production Recommendations
1. Enable MFA (at least optional)
2. Enable advanced security features
3. Configure custom domain with ACM certificate
4. Enable CloudWatch logging
5. Set up account takeover protection
6. Configure custom email templates (SES)

## Cost Estimate

### Free Tier
- 50,000 Monthly Active Users (MAU) free forever

### After Free Tier
- $0.0055 per MAU
- Example: 100 users = $0.55/month

### Current Usage (Staging)
- Expected: <10 MAU = **$0/month**

## Next Steps

### Task C2: API Gateway Module (6 hours)
- [ ] Create API Gateway HTTP API
- [ ] Configure routes for all Lambda services
- [ ] Set up Cognito JWT authorizer
- [ ] Configure custom domain
- [ ] Test authenticated endpoints

See `AWS_MVP_DEPLOYMENT_PLAN.md` for detailed Task C2 specification.

## Files Created/Modified

### New Files
```
terraform/modules/cognito/
├── main.tf          # Cognito resources
├── variables.tf     # Input variables
└── outputs.tf       # Output values

dev_tools/
├── deploy_cognito.ps1  # Deployment script
└── test_cognito.ps1    # Testing script
```

### Modified Files
```
terraform/environments/staging/
├── main.tf          # Added Cognito module
└── outputs.tf       # Added Cognito outputs

docs/
└── AWS_MVP_DEPLOYMENT_PLAN.md  # Marked Task C1 complete
```

## Useful Commands

```powershell
# Get all Cognito outputs
cd terraform/environments/staging
terraform output | Select-String "cognito"

# Get from Parameter Store
aws ssm get-parameter --name /antenna-simulator/staging/cognito-user-pool-id --profile antenna-staging
aws ssm get-parameter --name /antenna-simulator/staging/cognito-client-id --profile antenna-staging

# Delete test user
aws cognito-idp admin-delete-user --user-pool-id <pool-id> --username test@example.com --profile antenna-staging

# Destroy Cognito (if needed)
cd terraform/environments/staging
terraform destroy -target=module.cognito
```

---

**Last Updated**: January 4, 2026  
**Status**: Task C1 Complete ✅  
**Next**: Task C2 - API Gateway Module
