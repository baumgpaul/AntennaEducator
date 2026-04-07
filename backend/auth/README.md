# Auth Service

Thin FastAPI wrapper around `backend/common/auth/` providers.

## When Is This Used?

- **Standalone / Docker** (`USE_COGNITO=false`): Runs on port 8011
  providing register, login, and profile endpoints backed by
  `LocalAuthProvider` (bcrypt + HS256 JWT).
- **AWS production** (`USE_COGNITO=true`): This service is **not
  deployed** as its own Lambda.  Instead, the Projects Lambda
  re-mounts the same three endpoint handlers
  (`register`, `login`, `get_current_user_info`).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Authenticate, return JWT |
| GET | `/api/auth/me` | Current user profile (token balance refreshed from DynamoDB) |
| GET | `/health` | Liveness check |

## JWT Flow

| Mode | Algorithm | Issuer | Verification |
|------|-----------|--------|--------------|
| Local (`USE_COGNITO=false`) | HS256 | Self-signed | Shared `JWT_SECRET_KEY` |
| AWS (`USE_COGNITO=true`) | RS256 | Cognito | JWKS public key set |

## Security Notes

- Error messages are **generic** to prevent username/email enumeration.
- Locked accounts return 403 without leaking the lock reason.
- Emails and passwords are never logged.
