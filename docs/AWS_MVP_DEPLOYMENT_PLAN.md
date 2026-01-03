# AWS MVP Deployment Plan - PEEC Antenna Simulator

**Version**: 1.0  
**Created**: January 3, 2026  
**Target Completion**: 2-3 weeks  
**Domain**: antennaeducator.nyakyagyawa.com  
**API Domain**: api.antennaeducator.nyakyagyawa.com  
**AWS Region**: eu-west-1 (Ireland)  
**GitHub Repo**: Private (will be public later)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [DynamoDB Data Model](#3-dynamodb-data-model)
4. [Lambda Services Specification](#4-lambda-services-specification)
5. [API Gateway Configuration](#5-api-gateway-configuration)
6. [Authentication (Cognito)](#6-authentication-cognito)
7. [Frontend Deployment (S3 + CloudFront)](#7-frontend-deployment-s3--cloudfront)
8. [Terraform Infrastructure](#8-terraform-infrastructure)
9. [Local CI/Testing Strategy](#9-local-citesting-strategy)
10. [CI/CD Pipeline (CodePipeline)](#10-cicd-pipeline-codepipeline)
11. [Implementation Tasks](#11-implementation-tasks)
12. [Cost Estimate](#12-cost-estimate)
13. [Future Phases](#13-future-phases)

---

## 1. Executive Summary

### Goals
- Deploy PEEC Antenna Simulator to AWS as a fully serverless application
- Maintain local Docker Compose development workflow
- Enable easy future migration to Fargate/EKS for compute-intensive workloads

### Key Decisions
| Component | MVP Choice | Future Option |
|-----------|------------|---------------|
| Compute | AWS Lambda (all services) | Fargate, EKS, Batch |
| Database | DynamoDB | Already serverless |
| Storage | S3 (2 buckets) | Same |
| Auth | AWS Cognito | Same (abstracted) |
| Frontend | S3 + CloudFront | Same |
| IaC | Terraform | Same |
| CI/CD | AWS CodePipeline | Same |
| Monitoring | CloudWatch Basic | + X-Ray tracing |

### Architecture Principles
1. **Serverless-first**: No servers to manage, pay-per-use
2. **Dual deployment**: Same code runs locally (Docker) and AWS (Lambda)
3. **Abstraction layers**: Database and auth interfaces allow swapping implementations
4. **Infrastructure as Code**: All resources defined in Terraform

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AWS Cloud                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Route 53                                      │   │
│  │              (antennaeducator.nyakyagyawa.com)                        │   │
│  └──────────────┬────────────────────────┬──────────────────────────────┘   │
│                 │                        │                                   │
│                 ▼                        ▼                                   │
│  ┌──────────────────────┐   ┌──────────────────────────────────────────┐   │
│  │     CloudFront       │   │           API Gateway                     │   │
│  │   (Frontend CDN)     │   │  api.antennaeducator.nyakyagyawa.com     │   │
│  │                      │   │                                           │   │
│  │  antennaeducator.    │   │  /preprocessor/* → Lambda Preprocessor   │   │
│  │  nyakyagyawa.com     │   │                                           │   │
│  └──────────┬───────────┘   │  /solver/*       → Lambda Solver         │   │
│             │               │  /postprocessor/* → Lambda Postprocessor │   │
│             ▼               │  /projects/*     → Lambda Projects       │   │
│  ┌──────────────────────┐   │  /auth/*         → Cognito               │   │
│  │    S3 Bucket         │   └──────────────────┬───────────────────────┘   │
│  │  (Frontend Static)   │                      │                           │
│  │                      │                      ▼                           │
│  │  - index.html        │   ┌──────────────────────────────────────────┐   │
│  │  - assets/           │   │           Lambda Functions               │   │
│  │  - js/, css/         │   │                                          │   │
│  └──────────────────────┘   │  ┌────────────┐  ┌────────────────────┐  │   │
│                             │  │Preprocessor│  │     Solver         │  │   │
│                             │  │  512 MB    │  │    2048 MB         │  │   │
│                             │  │  30s timeout│  │   900s timeout     │  │   │
│                             │  └─────┬──────┘  └─────────┬──────────┘  │   │
│                             │        │                   │             │   │
│                             │  ┌─────┴──────┐  ┌─────────┴──────────┐  │   │
│                             │  │Postprocessor│  │    Projects       │  │   │
│                             │  │  1024 MB   │  │    512 MB         │  │   │
│                             │  │  60s timeout│  │   30s timeout     │  │   │
│                             │  └─────┬──────┘  └─────────┬──────────┘  │   │
│                             └────────┼───────────────────┼─────────────┘   │
│                                      │                   │                 │
│                                      ▼                   ▼                 │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         Shared Resources                               │ │
│  │                                                                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐   │ │
│  │  │    DynamoDB     │  │   S3 Bucket     │  │   Cognito User      │   │ │
│  │  │                 │  │   (Data)        │  │      Pool           │   │ │
│  │  │  - Users        │  │                 │  │                     │   │ │
│  │  │  - Projects     │  │  - meshes/      │  │  - User signup      │   │ │
│  │  │  - Results      │  │  - results/     │  │  - JWT tokens       │   │ │
│  │  │                 │  │  - exports/     │  │  - MFA (optional)   │   │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘   │ │
│  │                                                                        │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │ │
│  │  │              Parameter Store & CloudWatch                        │  │ │
│  │  │  - /antenna-simulator/prod/cognito-client-id                    │  │ │
│  │  │  - /antenna-simulator/prod/s3-bucket-name                       │  │ │
│  │  │  - CloudWatch Logs for each Lambda                              │  │ │
│  │  └─────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Request Flow Example

**User creates a project and runs simulation**:

```
1. User opens https://antennaeducator.nyakyagyawa.com
   → CloudFront serves React app from S3

2. User logs in
   → Frontend calls Cognito directly (hosted UI or custom)
   → Receives JWT tokens (access + refresh)

3. User creates project
   → POST /projects with JWT in Authorization header
   → API Gateway validates JWT with Cognito
   → Lambda Projects writes to DynamoDB

4. User adds antenna and clicks "Solve"
   → POST /solver/solve with mesh data
   → Lambda Solver computes (up to 15 min)
   → Results stored in DynamoDB + S3

5. User views results
   → GET /postprocessor/far-field
   → Lambda Postprocessor computes radiation pattern
   → Returns JSON visualization data
```

### 2.3 Local Development Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose (Local)                        │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Frontend   │  │  API Gateway │  │   DynamoDB Local     │  │
│  │  (Vite Dev)  │  │   (Nginx)    │  │   (Docker Image)     │  │
│  │  Port 3000   │  │  Port 8000   │  │   Port 8000          │  │
│  └──────────────┘  └──────┬───────┘  └──────────────────────┘  │
│                           │                                      │
│           ┌───────────────┼───────────────┐                     │
│           ▼               ▼               ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │Preprocessor │  │   Solver    │  │Postprocessor│             │
│  │  Port 8001  │  │  Port 8002  │  │  Port 8003  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│           │               │               │                     │
│           └───────────────┼───────────────┘                     │
│                           ▼                                      │
│                  ┌─────────────────┐                            │
│                  │    Projects     │                            │
│                  │   Port 8010     │                            │
│                  └─────────────────┘                            │
│                                                                  │
│  Auth: JWT with local secret (DISABLE_AUTH=true for dev)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. DynamoDB Data Model

### 3.1 Table Design Philosophy

DynamoDB uses **single-table design** for efficiency. We'll use composite keys to support multiple access patterns.

### 3.2 Table Schema: `antenna-simulator-{env}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `PK` | String | Partition Key (entity type + ID) |
| `SK` | String | Sort Key (sub-entity or metadata) |
| `GSI1PK` | String | Global Secondary Index 1 Partition Key |
| `GSI1SK` | String | Global Secondary Index 1 Sort Key |
| `EntityType` | String | USER, PROJECT, RESULT, ELEMENT |
| `Data` | Map | Entity-specific attributes |
| `CreatedAt` | String | ISO 8601 timestamp |
| `UpdatedAt` | String | ISO 8601 timestamp |
| `TTL` | Number | Optional TTL for cleanup |

### 3.3 Entity Patterns

#### User Entity
```
PK: USER#<user_id>
SK: METADATA
GSI1PK: EMAIL#<email>
GSI1SK: USER

Data: {
  "username": "john_doe",
  "email": "john@example.com",
  "hashed_password": "...",  // Only for local auth fallback
  "cognito_sub": "uuid",     // Cognito user ID
  "preferences": {...}
}
```

#### Project Entity
```
PK: USER#<user_id>
SK: PROJECT#<project_id>
GSI1PK: PROJECT#<project_id>
GSI1SK: METADATA

Data: {
  "name": "Dipole Antenna Design",
  "description": "300 MHz dipole",
  "elements": [...],  // Antenna elements JSON
  "solver_state": {...},
  "view_configurations": [...],
  "settings": {...}
}
```

#### Result Entity
```
PK: PROJECT#<project_id>
SK: RESULT#<frequency_hz>#<result_id>
GSI1PK: RESULT#<result_id>
GSI1SK: METADATA

Data: {
  "frequency_hz": 300000000,
  "currents_s3_key": "results/<project_id>/<result_id>/currents.npy",
  "mesh_s3_key": "meshes/<project_id>/mesh.json",
  "input_impedance": {"real": 73.2, "imag": 42.5},
  "status": "completed"
}
```

### 3.4 Access Patterns

| Access Pattern | Key Condition | Index |
|----------------|---------------|-------|
| Get user by ID | PK = USER#id, SK = METADATA | Table |
| Get user by email | GSI1PK = EMAIL#email | GSI1 |
| List projects for user | PK = USER#id, SK begins_with PROJECT# | Table |
| Get project by ID | GSI1PK = PROJECT#id | GSI1 |
| List results for project | PK = PROJECT#id, SK begins_with RESULT# | Table |
| Get result by ID | GSI1PK = RESULT#id | GSI1 |

### 3.5 Repository Abstraction Layer

To support both DynamoDB (AWS) and PostgreSQL (local), create an abstract interface:

```python
# backend/common/repositories/base.py
from abc import ABC, abstractmethod
from typing import Optional, List

class ProjectRepository(ABC):
    @abstractmethod
    async def create(self, user_id: str, project: ProjectCreate) -> Project:
        pass
    
    @abstractmethod
    async def get_by_id(self, project_id: str) -> Optional[Project]:
        pass
    
    @abstractmethod
    async def list_by_user(self, user_id: str) -> List[Project]:
        pass
    
    @abstractmethod
    async def update(self, project_id: str, project: ProjectUpdate) -> Project:
        pass
    
    @abstractmethod
    async def delete(self, project_id: str) -> bool:
        pass

# backend/common/repositories/dynamodb.py
class DynamoDBProjectRepository(ProjectRepository):
    def __init__(self, table_name: str):
        self.dynamodb = boto3.resource('dynamodb')
        self.table = self.dynamodb.Table(table_name)
    
    async def create(self, user_id: str, project: ProjectCreate) -> Project:
        project_id = str(uuid.uuid4())
        item = {
            'PK': f'USER#{user_id}',
            'SK': f'PROJECT#{project_id}',
            'GSI1PK': f'PROJECT#{project_id}',
            'GSI1SK': 'METADATA',
            'EntityType': 'PROJECT',
            'Data': project.dict(),
            'CreatedAt': datetime.utcnow().isoformat(),
            'UpdatedAt': datetime.utcnow().isoformat()
        }
        self.table.put_item(Item=item)
        return Project(id=project_id, **project.dict())

# backend/common/repositories/postgres.py
class PostgreSQLProjectRepository(ProjectRepository):
    # Existing SQLAlchemy implementation
    pass

# backend/common/repositories/factory.py
def get_project_repository() -> ProjectRepository:
    if os.environ.get('USE_DYNAMODB', 'false').lower() == 'true':
        return DynamoDBProjectRepository(os.environ['DYNAMODB_TABLE'])
    else:
        return PostgreSQLProjectRepository(get_db_session())
```

---

## 4. Lambda Services Specification

### 4.1 Lambda Configuration

| Service | Memory | Timeout | Concurrency | Layers |
|---------|--------|---------|-------------|--------|
| **Preprocessor** | 512 MB | 30s | 10 | numpy-scipy |
| **Solver** | 2048 MB | 900s (15 min) | 5 | numpy-scipy |
| **Postprocessor** | 1024 MB | 60s | 10 | numpy-scipy |
| **Projects** | 512 MB | 30s | 20 | - |

### 4.2 Lambda Handler Structure

Each service needs a Mangum adapter to run FastAPI on Lambda:

```python
# backend/preprocessor/lambda_handler.py
from mangum import Mangum
from backend.preprocessor.main import app

# Configure for API Gateway
handler = Mangum(app, lifespan="off")
```

```python
# backend/preprocessor/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Preprocessor Service",
    root_path="/preprocessor"  # Important for API Gateway path prefix
)

# CORS - allow API Gateway origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Existing routes...
```

### 4.3 Shared Lambda Layer

Create a Lambda Layer with common dependencies to reduce package size:

**Layer: numpy-scipy-layer**
- numpy==1.26.0
- scipy==1.11.0
- Total size: ~50 MB compressed

**Layer: common-deps-layer**
- pydantic==2.5.0
- boto3 (already in Lambda runtime)
- fastapi, mangum, uvicorn (if not using container)

### 4.4 Lambda Packaging Options

**Option A: ZIP Deployment (Simpler)**
```
lambda_package/
├── backend/
│   ├── common/
│   ├── preprocessor/
│   └── ...
├── requirements.txt
└── lambda_handler.py
```

**Option B: Container Image (Recommended for this project)**
```dockerfile
# backend/Dockerfile.lambda
FROM public.ecr.aws/lambda/python:3.11

# Install dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy application code
COPY backend/ ${LAMBDA_TASK_ROOT}/backend/

# Set handler
CMD ["backend.preprocessor.lambda_handler.handler"]
```

**Recommendation**: Use **Container Images** because:
- NumPy/SciPy exceed ZIP size limits (250 MB uncompressed)
- Easier to test locally with Docker
- Same container works for future Fargate migration

### 4.5 Problem Size Warning System

Add to solver service to warn before timeout:

```python
# backend/solver/services/estimation.py
def estimate_solve_time(mesh: Mesh) -> dict:
    """Estimate solve time based on problem complexity."""
    n_edges = len(mesh.edges)
    n_frequencies = len(mesh.frequencies) if hasattr(mesh, 'frequencies') else 1
    
    # Empirical formula based on testing
    # O(n^3) for matrix solve, O(n^2) for assembly
    base_time = (n_edges ** 2) * 0.0001  # Assembly
    solve_time = (n_edges ** 3) * 0.00000001 * n_frequencies  # Solve
    total_estimate = base_time + solve_time
    
    return {
        "estimated_seconds": total_estimate,
        "n_edges": n_edges,
        "n_frequencies": n_frequencies,
        "warning": total_estimate > 600,  # 10 min warning
        "will_timeout": total_estimate > 840,  # 14 min (leave margin)
        "recommendation": (
            "Consider reducing mesh density or frequency points"
            if total_estimate > 600 else None
        )
    }

# Add endpoint
@router.post("/estimate")
async def estimate_solve(mesh: Mesh):
    return estimate_solve_time(mesh)
```

---

## 5. API Gateway Configuration

### 5.1 API Structure

```
api.antennaeducator.nyakyagyawa.com
├── /preprocessor
│   ├── POST /mesh          → preprocessor Lambda
│   ├── POST /validate      → preprocessor Lambda
│   └── GET  /health        → preprocessor Lambda
├── /solver
│   ├── POST /solve         → solver Lambda
│   ├── POST /estimate      → solver Lambda
│   └── GET  /health        → solver Lambda
├── /postprocessor
│   ├── POST /far-field     → postprocessor Lambda
│   ├── POST /near-field    → postprocessor Lambda
│   ├── POST /export/vtu    → postprocessor Lambda
│   └── GET  /health        → postprocessor Lambda
└── /projects
    ├── GET    /            → projects Lambda (list)
    ├── POST   /            → projects Lambda (create)
    ├── GET    /{id}        → projects Lambda (get)
    ├── PUT    /{id}        → projects Lambda (update)
    ├── DELETE /{id}        → projects Lambda (delete)
    └── GET    /health      → projects Lambda
```

### 5.2 API Gateway Settings

```hcl
# terraform/modules/api-gateway/main.tf

resource "aws_apigatewayv2_api" "main" {
  name          = "antenna-simulator-api-${var.environment}"
  protocol_type = "HTTP"
  
  cors_configuration {
    allow_origins     = ["https://antennaeducator.nyakyagyawa.com"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers     = ["Authorization", "Content-Type"]
    expose_headers    = ["X-Request-Id"]
    max_age           = 3600
    allow_credentials = true
  }
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-authorizer"
  
  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}
```

### 5.3 Throttling & Rate Limits

```hcl
resource "aws_apigatewayv2_stage" "prod" {
  api_id = aws_apigatewayv2_api.main.id
  name   = "prod"
  
  default_route_settings {
    throttling_burst_limit = 100  # Max concurrent requests
    throttling_rate_limit  = 50   # Requests per second
  }
}
```

---

## 6. Authentication (Cognito)

### 6.1 Cognito User Pool Configuration

```hcl
# terraform/modules/cognito/main.tf

resource "aws_cognito_user_pool" "main" {
  name = "antenna-simulator-${var.environment}"
  
  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }
  
  # User attributes
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }
  
  # Email verification
  auto_verified_attributes = ["email"]
  
  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
  
  # MFA (optional for MVP)
  mfa_configuration = "OFF"
}

resource "aws_cognito_user_pool_client" "frontend" {
  name         = "frontend-client"
  user_pool_id = aws_cognito_user_pool.main.id
  
  # OAuth settings
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  allowed_oauth_flows_user_pool_client = true
  
  # Token validity
  access_token_validity  = 1   # hours
  id_token_validity      = 1   # hours
  refresh_token_validity = 30  # days
  
  # Callback URLs
  callback_urls = [
    "https://antennaeducator.nyakyagyawa.com/auth/callback",
    "http://localhost:3000/auth/callback"  # Local dev
  ]
  logout_urls = [
    "https://antennaeducator.nyakyagyawa.com",
    "http://localhost:3000"
  ]
  
  # Disable client secret for SPA
  generate_secret = false
  
  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
}
```

### 6.2 Frontend Auth Integration

```typescript
// frontend/src/services/auth/cognitoAuth.ts
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
};

const userPool = new CognitoUserPool(poolData);

export const cognitoAuth = {
  async signUp(email: string, password: string, username: string) {
    return new Promise((resolve, reject) => {
      userPool.signUp(email, password, [
        { Name: 'preferred_username', Value: username }
      ], null, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  },
  
  async signIn(email: string, password: string) {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool
    });
    
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password
    });
    
    return new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: (result) => resolve({
          accessToken: result.getAccessToken().getJwtToken(),
          idToken: result.getIdToken().getJwtToken(),
          refreshToken: result.getRefreshToken().getToken()
        }),
        onFailure: reject
      });
    });
  },
  
  async signOut() {
    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) cognitoUser.signOut();
  },
  
  async refreshSession() {
    // ... refresh token logic
  }
};
```

### 6.3 Auth Abstraction for Dual Deployment

```typescript
// frontend/src/services/auth/index.ts
import { cognitoAuth } from './cognitoAuth';
import { localAuth } from './localAuth';

const USE_COGNITO = import.meta.env.VITE_AUTH_PROVIDER === 'cognito';

export const authService = USE_COGNITO ? cognitoAuth : localAuth;
```

---

## 7. Frontend Deployment (S3 + CloudFront)

### 7.1 S3 Bucket Configuration

```hcl
# terraform/modules/frontend/main.tf

resource "aws_s3_bucket" "frontend" {
  bucket = "antenna-simulator-frontend-${var.environment}"
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  index_document {
    suffix = "index.html"
  }
  
  error_document {
    key = "index.html"  # SPA routing
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}
```

### 7.2 CloudFront Distribution

```hcl
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  aliases             = [var.domain_name]
  price_class         = "PriceClass_100"  # North America + Europe only (cheaper)
  
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
    origin_id                = "S3Origin"
  }
  
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3Origin"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    
    cache_policy_id          = aws_cloudfront_cache_policy.frontend.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.frontend.id
  }
  
  # SPA routing - return index.html for 404s
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }
  
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  
  viewer_certificate {
    acm_certificate_arn      = var.acm_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
```

### 7.3 Route 53 DNS

```hcl
resource "aws_route53_record" "frontend" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  
  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  zone_id = var.route53_zone_id
  name    = "api.${var.domain_name}"
  type    = "A"
  
  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
```

---

## 8. Terraform Infrastructure

### 8.1 Directory Structure

```
terraform/
├── environments/
│   ├── staging/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── terraform.tfvars
│   └── production/
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       └── terraform.tfvars
├── modules/
│   ├── api-gateway/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── cognito/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── dynamodb/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── frontend/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   ├── lambda/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── s3-data/
│       ├── main.tf
│       ├── variables.tf
│       └── outputs.tf
├── backend.tf
└── versions.tf
```

### 8.2 Root Module Example

```hcl
# terraform/environments/staging/main.tf

terraform {
  backend "s3" {
    bucket         = "antenna-simulator-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "antenna-simulator"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# DynamoDB
module "dynamodb" {
  source      = "../../modules/dynamodb"
  environment = var.environment
  table_name  = "antenna-simulator-${var.environment}"
}

# Cognito
module "cognito" {
  source      = "../../modules/cognito"
  environment = var.environment
  domain_name = var.domain_name
}

# S3 Data Bucket
module "s3_data" {
  source      = "../../modules/s3-data"
  environment = var.environment
  bucket_name = "antenna-simulator-data-${var.environment}"
}

# Lambda Functions
module "lambda_preprocessor" {
  source        = "../../modules/lambda"
  function_name = "preprocessor"
  environment   = var.environment
  memory_size   = 512
  timeout       = 30
  
  environment_variables = {
    DYNAMODB_TABLE = module.dynamodb.table_name
    S3_BUCKET      = module.s3_data.bucket_name
    USE_DYNAMODB   = "true"
  }
}

module "lambda_solver" {
  source        = "../../modules/lambda"
  function_name = "solver"
  environment   = var.environment
  memory_size   = 2048
  timeout       = 900
  
  environment_variables = {
    DYNAMODB_TABLE = module.dynamodb.table_name
    S3_BUCKET      = module.s3_data.bucket_name
    USE_DYNAMODB   = "true"
  }
}

module "lambda_postprocessor" {
  source        = "../../modules/lambda"
  function_name = "postprocessor"
  environment   = var.environment
  memory_size   = 1024
  timeout       = 60
  
  environment_variables = {
    DYNAMODB_TABLE = module.dynamodb.table_name
    S3_BUCKET      = module.s3_data.bucket_name
    USE_DYNAMODB   = "true"
  }
}

module "lambda_projects" {
  source        = "../../modules/lambda"
  function_name = "projects"
  environment   = var.environment
  memory_size   = 512
  timeout       = 30
  
  environment_variables = {
    DYNAMODB_TABLE = module.dynamodb.table_name
    S3_BUCKET      = module.s3_data.bucket_name
    USE_DYNAMODB   = "true"
  }
}

# API Gateway
module "api_gateway" {
  source      = "../../modules/api-gateway"
  environment = var.environment
  domain_name = "api.${var.domain_name}"
  
  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.client_id
  
  lambda_integrations = {
    preprocessor  = module.lambda_preprocessor.invoke_arn
    solver        = module.lambda_solver.invoke_arn
    postprocessor = module.lambda_postprocessor.invoke_arn
    projects      = module.lambda_projects.invoke_arn
  }
}

# Frontend
module "frontend" {
  source      = "../../modules/frontend"
  environment = var.environment
  domain_name = var.domain_name
  
  acm_certificate_arn = var.acm_certificate_arn
  route53_zone_id     = var.route53_zone_id
}

# Outputs
output "api_url" {
  value = module.api_gateway.api_url
}

output "frontend_url" {
  value = "https://${var.domain_name}"
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}
```

### 8.3 DynamoDB Module

```hcl
# terraform/modules/dynamodb/main.tf

resource "aws_dynamodb_table" "main" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"  # Serverless, scales automatically
  hash_key     = "PK"
  range_key    = "SK"
  
  attribute {
    name = "PK"
    type = "S"
  }
  
  attribute {
    name = "SK"
    type = "S"
  }
  
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  
  attribute {
    name = "GSI1SK"
    type = "S"
  }
  
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }
  
  # Enable TTL for automatic cleanup (optional)
  ttl {
    attribute_name = "TTL"
    enabled        = true
  }
  
  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Name = var.table_name
  }
}
```

---

## 9. Local CI/Testing Strategy

### 9.1 Philosophy: Test Locally First

To minimize AWS costs and avoid unnecessary commits, we implement a **multi-layer testing strategy**:

| Layer | Where | What | When |
|-------|-------|------|------|
| 1. Pre-commit hooks | Local | Lint + Unit tests | **Every commit** (blocking) |
| 2. Full local suite | Local | All tests + integration | Before push (manual) |
| 3. SAM Local | Local | Lambda + API Gateway | Complex Lambda testing |
| 4. CodePipeline | AWS | Full CI + Deploy | Push to `main` only |

### 9.2 Pre-commit Hooks (Blocking)

Pre-commit hooks **block commits** if tests fail. This prevents broken code from entering the repository.

```yaml
# .pre-commit-config.yaml
repos:
  # Backend (Python)
  - repo: local
    hooks:
      - id: ruff-lint
        name: Ruff lint (Python)
        entry: ruff check backend/
        language: system
        pass_filenames: false
        types: [python]
        
      - id: ruff-format
        name: Ruff format check
        entry: ruff format --check backend/
        language: system
        pass_filenames: false
        types: [python]
        
      - id: pytest-unit
        name: Backend unit tests
        entry: pytest tests/unit -x -q --tb=short
        language: system
        pass_filenames: false
        stages: [commit]

  # Frontend (TypeScript/React)
  - repo: local
    hooks:
      - id: eslint
        name: ESLint (Frontend)
        entry: npm --prefix frontend run lint
        language: system
        pass_filenames: false
        types: [typescript, tsx]
        
      - id: vitest
        name: Vitest (Frontend unit tests)
        entry: npm --prefix frontend test -- --run
        language: system
        pass_filenames: false
        stages: [commit]
        
      - id: typescript-check
        name: TypeScript type check
        entry: npm --prefix frontend run type-check
        language: system
        pass_filenames: false
        stages: [commit]
```

**Installation**:
```bash
pip install pre-commit
pre-commit install
```

### 9.3 Local Test Scripts

```powershell
# dev_tools/test_local_full.ps1
# Run before pushing to remote - full test suite

Write-Host "=== Pre-push Local Testing ===" -ForegroundColor Cyan

# Backend
Write-Host "`n=== Backend Tests ===" -ForegroundColor Yellow
ruff check backend/
ruff format --check backend/
pytest tests/ -v --cov=backend --cov-report=term-missing --cov-fail-under=80

if ($LASTEXITCODE -ne 0) {
    Write-Host "Backend tests failed!" -ForegroundColor Red
    exit 1
}

# Frontend
Write-Host "`n=== Frontend Tests ===" -ForegroundColor Yellow
Push-Location frontend
npm run lint
npm test -- --run --coverage
npm run type-check
npm run build  # Ensures production build works
Pop-Location

if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend tests failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ All local tests passed! Safe to push." -ForegroundColor Green
```

### 9.4 DynamoDB Local

For local development without AWS, use DynamoDB Local:

```yaml
# docker-compose.local.yml (addition)
services:
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    container_name: dynamodb-local
    ports:
      - "8000:8000"
    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath /data"
    volumes:
      - dynamodb-data:/data
    healthcheck:
      test: ["CMD-SHELL", "curl -s http://localhost:8000"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  dynamodb-data:
```

**Environment variable toggle**:
```python
# backend/common/repositories/factory.py
import os

def get_dynamodb_client():
    if os.environ.get('USE_DYNAMODB_LOCAL', 'false').lower() == 'true':
        import boto3
        return boto3.resource(
            'dynamodb',
            endpoint_url='http://localhost:8000',
            region_name='us-east-1',
            aws_access_key_id='local',
            aws_secret_access_key='local'
        )
    else:
        import boto3
        return boto3.resource('dynamodb')
```

### 9.5 AWS SAM Local Testing

For testing Lambda functions with API Gateway locally:

```bash
# Install SAM CLI
winget install Amazon.SAM-CLI

# Test a single Lambda function
sam local invoke PreprocessorFunction -e events/preprocess_test.json

# Start local API Gateway
sam local start-api --port 3001

# Test with curl
curl http://localhost:3001/preprocessor/health
```

**SAM template** (`template.yaml`):
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.11
    Timeout: 30
    Environment:
      Variables:
        USE_DYNAMODB_LOCAL: "true"
        DYNAMODB_ENDPOINT: "http://host.docker.internal:8000"

Resources:
  PreprocessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: backend.preprocessor.lambda_handler.handler
      CodeUri: .
      Events:
        Api:
          Type: Api
          Properties:
            Path: /preprocessor/{proxy+}
            Method: ANY
```

### 9.6 Test Coverage Gates

CI fails if coverage drops below **80%**:

**Backend** (pytest):
```bash
pytest tests/ --cov=backend --cov-fail-under=80
```

**Frontend** (vitest):
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'clover'],
      exclude: ['node_modules/', 'src/test/'],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },
});
```

### 9.7 Branch Strategy

**Strategy A: CodePipeline only on `main`**

```
feature/xyz  →  Local testing only (pre-commit + manual)
     ↓ (PR review + merge)
main         →  CodePipeline: Build → Test → Deploy Staging
     ↓ (manual approval)
production   →  CodePipeline: Deploy Production
```

| Branch | Local CI | AWS CodePipeline | Deploy |
|--------|----------|------------------|--------|
| `feature/*` | ✅ Pre-commit hooks | ❌ | ❌ |
| `main` | ✅ Pre-commit hooks | ✅ Full pipeline | Staging only |
| Manual approval | - | ✅ | Production |

**Benefits**:
- Unlimited local commits without triggering AWS costs
- Full CI only runs on merged, reviewed code
- Clear separation between development and deployment

---

## 10. CI/CD Pipeline (CodePipeline)

### 10.1 Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CodePipeline: antenna-simulator                       │
│                                                                          │
│  Source Stage          Build Stage              Deploy Stage            │
│  ┌─────────────┐      ┌─────────────────────┐  ┌─────────────────────┐ │
│  │   GitHub    │ ───► │    CodeBuild        │  │   Deploy Staging    │ │
│  │  (webhook)  │      │                     │  │                     │ │
│  │             │      │  1. Run tests       │  │  - Update Lambdas   │ │
│  │  main branch│      │  2. Build frontend  │  │  - Deploy frontend  │ │
│  │             │      │  3. Build containers│  │  - Run smoke tests  │ │
│  └─────────────┘      │  4. Push to ECR     │  └─────────┬───────────┘ │
│                       └─────────────────────┘            │              │
│                                                          ▼              │
│                                              ┌─────────────────────────┐│
│                                              │   Manual Approval       ││
│                                              │   (for production)      ││
│                                              └───────────┬─────────────┘│
│                                                          │              │
│                                                          ▼              │
│                                              ┌─────────────────────────┐│
│                                              │   Deploy Production     ││
│                                              │                         ││
│                                              │  - Update Lambdas       ││
│                                              │  - Deploy frontend      ││
│                                              │  - Invalidate CloudFront││
│                                              └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 CodeBuild Specification

```yaml
# buildspec.yml
version: 0.2

env:
  variables:
    AWS_DEFAULT_REGION: eu-west-1
  parameter-store:
    COGNITO_USER_POOL_ID: /antenna-simulator/${ENV}/cognito-user-pool-id
    COGNITO_CLIENT_ID: /antenna-simulator/${ENV}/cognito-client-id

phases:
  install:
    runtime-versions:
      python: 3.11
      nodejs: 18
    commands:
      - echo Installing dependencies...
      - pip install -r requirements.txt
      - cd frontend && npm ci

  pre_build:
    commands:
      - echo Running tests...
      # Backend tests
      - pytest tests/ -v --cov=backend --cov-report=xml
      # Frontend tests
      - cd frontend && npm run test:ci
      - cd frontend && npm run lint
      - cd frontend && npm run type-check

  build:
    commands:
      - echo Building application...
      
      # Build frontend
      - cd frontend
      - |
        cat > .env.production << EOF
        VITE_API_BASE_URL=https://api.${DOMAIN_NAME}
        VITE_AUTH_PROVIDER=cognito
        VITE_COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
        VITE_COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID}
        EOF
      - npm run build
      - cd ..
      
      # Build Lambda container images
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      
      - echo Building Docker images...
      - docker build -t antenna-preprocessor -f backend/Dockerfile.lambda --build-arg SERVICE=preprocessor .
      - docker build -t antenna-solver -f backend/Dockerfile.lambda --build-arg SERVICE=solver .
      - docker build -t antenna-postprocessor -f backend/Dockerfile.lambda --build-arg SERVICE=postprocessor .
      - docker build -t antenna-projects -f backend/Dockerfile.lambda --build-arg SERVICE=projects .
      
      # Tag and push
      - docker tag antenna-preprocessor:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-preprocessor:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag antenna-solver:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-solver:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag antenna-postprocessor:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-postprocessor:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag antenna-projects:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-projects:$CODEBUILD_RESOLVED_SOURCE_VERSION
      
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-preprocessor:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-solver:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-postprocessor:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/antenna-projects:$CODEBUILD_RESOLVED_SOURCE_VERSION

  post_build:
    commands:
      - echo Build completed on `date`
      # Generate deployment artifacts
      - |
        cat > deploy-params.json << EOF
        {
          "image_tag": "${CODEBUILD_RESOLVED_SOURCE_VERSION}",
          "environment": "${ENV}"
        }
        EOF

artifacts:
  files:
    - frontend/dist/**/*
    - deploy-params.json
    - terraform/**/*
  base-directory: .

cache:
  paths:
    - '/root/.cache/pip/**/*'
    - 'frontend/node_modules/**/*'

reports:
  pytest_reports:
    files:
      - coverage.xml
    file-format: COBERTURAXML
  jest_reports:
    files:
      - frontend/coverage/clover.xml
    file-format: CLOVERXML
```

### 10.3 CodePipeline Terraform

```hcl
# terraform/modules/cicd/main.tf

resource "aws_codepipeline" "main" {
  name     = "antenna-simulator-pipeline"
  role_arn = aws_iam_role.codepipeline.arn
  
  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }
  
  stage {
    name = "Source"
    
    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]
      
      configuration = {
        ConnectionArn    = aws_codestarconnections_connection.github.arn
        FullRepositoryId = var.github_repo
        BranchName       = "main"
      }
    }
  }
  
  stage {
    name = "Build"
    
    action {
      name             = "Build"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      input_artifacts  = ["source_output"]
      output_artifacts = ["build_output"]
      version          = "1"
      
      configuration = {
        ProjectName = aws_codebuild_project.main.name
        EnvironmentVariables = jsonencode([
          {
            name  = "ENV"
            value = "staging"
          },
          {
            name  = "DOMAIN_NAME"
            value = var.staging_domain
          }
        ])
      }
    }
  }
  
  stage {
    name = "DeployStaging"
    
    action {
      name            = "DeployLambdas"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "Lambda"
      input_artifacts = ["build_output"]
      version         = "1"
      
      configuration = {
        FunctionName = "antenna-deploy-staging"
        UserParameters = jsonencode({
          environment = "staging"
        })
      }
    }
    
    action {
      name            = "DeployFrontend"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "S3"
      input_artifacts = ["build_output"]
      version         = "1"
      
      configuration = {
        BucketName = var.staging_frontend_bucket
        Extract    = "true"
      }
    }
  }
  
  stage {
    name = "Approval"
    
    action {
      name     = "ManualApproval"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"
      
      configuration = {
        CustomData = "Review staging deployment before production"
      }
    }
  }
  
  stage {
    name = "DeployProduction"
    
    action {
      name            = "DeployLambdas"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "Lambda"
      input_artifacts = ["build_output"]
      version         = "1"
      
      configuration = {
        FunctionName = "antenna-deploy-production"
        UserParameters = jsonencode({
          environment = "production"
        })
      }
    }
    
    action {
      name            = "DeployFrontend"
      category        = "Deploy"
      owner           = "AWS"
      provider        = "S3"
      input_artifacts = ["build_output"]
      version         = "1"
      
      configuration = {
        BucketName = var.production_frontend_bucket
        Extract    = "true"
      }
    }
    
    action {
      name     = "InvalidateCache"
      category = "Invoke"
      owner    = "AWS"
      provider = "Lambda"
      version  = "1"
      
      configuration = {
        FunctionName = "cloudfront-invalidate"
        UserParameters = jsonencode({
          distribution_id = var.cloudfront_distribution_id
        })
      }
    }
  }
}
```

### 10.4 CodePipeline Cost Estimate

| Service | Free Tier | After Free Tier | Your Expected Cost |
|---------|-----------|-----------------|-------------------|
| CodePipeline | 1 pipeline free forever | $1/pipeline/month | **$0** (1 pipeline) |
| CodeBuild | 100 min/month (general1.small) | $0.005/min | **$0-5/month** |
| CodeStar Connections | Free | Free | **$0** |
| S3 Artifacts | Minimal | $0.023/GB | **<$1/month** |
| **Total CI/CD** | - | - | **$0-6/month** |

---

## 11. Implementation Tasks

### Sprint 2: MVP Deployment - Task Breakdown

#### Phase A: Foundation (Days 1-3)

**Task A1: AWS Account Setup** (2 hours)
- [ ] Create/configure AWS account
- [ ] Set up IAM admin user and MFA
- [ ] Create deployment IAM role with required permissions
- [ ] Install and configure AWS CLI locally
- [ ] Store credentials in AWS CLI profiles

**Task A2: Terraform Bootstrap** (3 hours)
- [ ] Create S3 bucket for Terraform state
- [ ] Create DynamoDB table for Terraform locks
- [ ] Initialize Terraform directory structure
- [ ] Create `versions.tf` with provider configuration
- [ ] Test Terraform init and plan

**Task A3: DynamoDB Module** (4 hours)
- [ ] Create DynamoDB Terraform module
- [ ] Define table schema with PK, SK, GSI1
- [ ] Configure PAY_PER_REQUEST billing
- [ ] Enable point-in-time recovery
- [ ] Deploy to staging and verify

**Task A4: S3 Buckets Module** (2 hours)
- [ ] Create frontend bucket (website hosting)
- [ ] Create data bucket (private)
- [ ] Configure bucket policies
- [ ] Configure CORS for data bucket
- [ ] Test upload/download

#### Phase B: Backend Services (Days 4-7)

**Task B1: Repository Abstraction Layer** (8 hours)
- [ ] Create abstract `ProjectRepository` interface
- [ ] Implement `DynamoDBProjectRepository`
- [ ] Keep existing `PostgreSQLProjectRepository`
- [ ] Create factory function with env var toggle
- [ ] Create abstract `ResultRepository` interface
- [ ] Implement DynamoDB version
- [ ] Create abstract `UserRepository` interface
- [ ] Implement DynamoDB version
- [ ] Unit tests for all repositories

**Task B2: Lambda Handlers** (4 hours)
- [ ] Add Mangum to requirements
- [ ] Create `lambda_handler.py` for each service
- [ ] Update FastAPI apps with `root_path` for API Gateway
- [ ] Test locally with SAM CLI or docker-lambda

**Task B3: Lambda Container Images** (4 hours)
- [ ] Create `Dockerfile.lambda` base image
- [ ] Configure multi-stage build (reduce size)
- [ ] Build and test each service container
- [ ] Create ECR repositories via Terraform
- [ ] Push images to ECR

**Task B4: Lambda Terraform Module** (4 hours)
- [ ] Create Lambda function resources
- [ ] Configure VPC access (if needed)
- [ ] Set up CloudWatch log groups
- [ ] Configure IAM roles and policies
- [ ] Deploy all 4 Lambda functions

**Task B5: Problem Size Warning** (2 hours)
- [ ] Add `/solver/estimate` endpoint
- [ ] Implement complexity estimation
- [ ] Add frontend warning dialog
- [ ] Test with various problem sizes

#### Phase C: API Gateway & Auth (Days 8-10)

**Task C1: Cognito Module** (4 hours)
- [ ] Create Cognito user pool via Terraform
- [ ] Configure password policy
- [ ] Create app client for frontend
- [ ] Set up callback URLs (staging + localhost)
- [ ] Output user pool ID and client ID

**Task C2: API Gateway Module** (6 hours)
- [ ] Create HTTP API via Terraform
- [ ] Configure routes for all services
- [ ] Set up Cognito JWT authorizer
- [ ] Configure CORS settings
- [ ] Create custom domain and SSL cert
- [ ] Test all endpoints with curl/Postman

**Task C3: Auth Abstraction Frontend** (4 hours)
- [ ] Install `amazon-cognito-identity-js`
- [ ] Create `cognitoAuth.ts` service
- [ ] Create `localAuth.ts` service (existing JWT)
- [ ] Create auth factory with env toggle
- [ ] Update Redux auth slice
- [ ] Test sign up, sign in, sign out

**Task C4: Frontend Environment Config** (2 hours)
- [ ] Create `.env.production` template
- [ ] Update Vite config for env vars
- [ ] Add Cognito env variables
- [ ] Add API Gateway URL variable
- [ ] Test build with production config

#### Phase D: Frontend Deployment (Days 11-12)

**Task D1: Frontend Terraform Module** (4 hours)
- [ ] Create S3 bucket for static hosting
- [ ] Create CloudFront distribution
- [ ] Configure SSL certificate (ACM)
- [ ] Set up Route53 DNS records
- [ ] Configure SPA error handling (404→index.html)

**Task D2: Build & Deploy Frontend** (2 hours)
- [ ] Build frontend with production env
- [ ] Upload to S3 bucket
- [ ] Invalidate CloudFront cache
- [ ] Test all pages load correctly
- [ ] Verify API calls work

#### Phase E: CI/CD Pipeline (Days 13-14)

**Task E1: CodePipeline Setup** (4 hours)
- [ ] Create GitHub connection (CodeStar)
- [ ] Create CodeBuild project
- [ ] Create `buildspec.yml`
- [ ] Configure environment variables
- [ ] Create S3 artifact bucket

**Task E2: Pipeline Terraform** (4 hours)
- [ ] Create CodePipeline resource
- [ ] Configure source stage (GitHub)
- [ ] Configure build stage
- [ ] Configure deploy staging stage
- [ ] Configure manual approval gate
- [ ] Configure deploy production stage

**Task E3: Deployment Lambda** (3 hours)
- [ ] Create Lambda for updating Lambda images
- [ ] Create Lambda for CloudFront invalidation
- [ ] Test deployment flow end-to-end
- [ ] Verify rollback capability

#### Phase F: Testing & Documentation (Days 15-16)

**Task F1: End-to-End Testing** (4 hours)
- [ ] Test user registration flow
- [ ] Test login and token refresh
- [ ] Test project CRUD
- [ ] Test solver workflow
- [ ] Test postprocessor features
- [ ] Test export functionality

**Task F2: Monitoring Setup** (2 hours)
- [ ] Verify CloudWatch logs for all Lambdas
- [ ] Create basic CloudWatch dashboard
- [ ] Set up billing alarm
- [ ] Document monitoring access

**Task F3: Documentation** (4 hours)
- [ ] Update README with AWS deployment
- [ ] Document Terraform commands
- [ ] Document environment variables
- [ ] Create troubleshooting guide
- [ ] Update local development guide

**Task F4: Docker Compose Update** (2 hours)
- [ ] Add DynamoDB Local container
- [ ] Update services to use DynamoDB locally
- [ ] Test full local stack with new architecture
- [ ] Document local vs AWS differences

---

## 12. Cost Estimate

### Monthly Cost Breakdown (5 users, light usage)

| Service | Free Tier | Estimated Usage | Monthly Cost |
|---------|-----------|-----------------|--------------|
| **Lambda** | 1M requests, 400K GB-sec | ~10K requests | **$0** |
| **API Gateway** | 1M requests | ~10K requests | **$0** |
| **DynamoDB** | 25 GB, 25 RCU/WCU | <1 GB, on-demand | **$0** |
| **S3** | 5 GB, 20K requests | <1 GB | **$0.05** |
| **CloudFront** | 1 TB transfer | <10 GB | **$0** |
| **Route 53** | - | 1 hosted zone | **$0.50** |
| **Cognito** | 50K MAU | 5 users | **$0** |
| **CloudWatch** | 5 GB logs | <1 GB | **$0** |
| **CodePipeline** | 1 pipeline | 1 pipeline | **$0** |
| **CodeBuild** | 100 min | <100 min | **$0** |
| **ECR** | 500 MB | ~200 MB | **$0** |
| **Total** | - | - | **~$1-2/month** |

### After Free Tier Expires (12 months)

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Lambda | $2-5 |
| API Gateway | $1-3 |
| DynamoDB | $1-2 |
| S3 | $0.50 |
| CloudFront | $1-2 |
| Route 53 | $0.50 |
| Cognito | $0.03 (5 users × $0.0055) |
| CloudWatch | $1-2 |
| CodePipeline | $1 |
| CodeBuild | $2-5 |
| ECR | $0.50 |
| **Total** | **$10-25/month** |

---

## 13. Future Phases

### Phase 2: Enhanced Compute (Sprint 3-4)
- **Step Functions** for workflow orchestration
- **Fargate** for long-running solver jobs
- Job queue with SQS
- Progress notifications with WebSockets

### Phase 3: Scale & Performance (Sprint 5-6)
- **ElastiCache Redis** for caching
- **X-Ray** distributed tracing
- Performance optimization
- Multi-region deployment option

### Phase 4: Advanced Features (Sprint 7+)
- **AWS Batch** for heavy compute
- **EKS** for complex workloads
- ML model integration
- Real-time collaboration

---

## Quick Reference

### Terraform Commands
```bash
# Initialize
cd terraform/environments/staging
terraform init

# Plan changes
terraform plan -out=tfplan

# Apply changes
terraform apply tfplan

# Destroy (careful!)
terraform destroy
```

### Local Development
```bash
# Start local stack with DynamoDB Local
docker-compose -f docker-compose.local.yml up -d

# Run backend services
./dev_tools/start_backend.ps1

# Run frontend
cd frontend && npm run dev
```

### Deployment
```bash
# Push to main triggers CodePipeline
git push origin main

# Manual deployment (if needed)
cd terraform/environments/staging
terraform apply -auto-approve
```

---

**Document Status**: Ready for Implementation  
**Estimated Sprint Duration**: 2-3 weeks  
**Next Review**: After Phase A completion
