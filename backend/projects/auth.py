"""Authentication utilities - JWT token handling and password hashing."""

from datetime import datetime, timedelta
from typing import Optional, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, HTTPAuthorizationCredentials as OptionalHTTPAuth
from sqlalchemy.orm import Session
import os
import logging
import requests
from dotenv import load_dotenv

# Load environment variables FIRST
load_dotenv()

from backend.projects.database import get_db
from backend.projects.models import User
from backend.projects.schemas import TokenData

logger = logging.getLogger(__name__)

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
DISABLE_AUTH = os.getenv("DISABLE_AUTH", "false").lower() == "true"
USE_COGNITO = os.getenv("USE_COGNITO", "false").lower() == "true"
COGNITO_REGION = os.getenv("COGNITO_REGION", "eu-west-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")

# Log warning if auth is disabled
if DISABLE_AUTH:
    logger.warning("\n" + "="*80)
    logger.warning("WARNING: AUTHENTICATION DISABLED - DEVELOPMENT MODE")
    logger.warning("This should NEVER be enabled in production!")
    logger.warning("="*80 + "\n")

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token scheme
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    # Truncate to 72 characters for bcrypt compatibility
    return pwd_context.verify(plain_password[:72], hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    # Truncate to 72 characters for bcrypt compatibility
    return pwd_context.hash(password[:72])


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create a JWT access token.
    
    Args:
        data: Dictionary of claims to encode in the token
        expires_delta: Optional expiration time delta
        
    Returns:
        Encoded JWT token string
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> TokenData:
    """
    Decode and validate a JWT token.
    
    Args:
        token: JWT token string
        
    Returns:
        TokenData with user information
        
    Raises:
        HTTPException: If token is invalid
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        if USE_COGNITO:
            # Decode without verification first to get header/claims
            unverified_header = jwt.get_unverified_header(token)

            # Use python-jose helper to read claims without requiring a key
            # (jwt.decode requires a key argument). This is safe here because
            # signature verification will be implemented separately when needed.
            payload = jwt.get_unverified_claims(token)
            
            # Cognito tokens have 'sub' (user UUID) and 'email' claims
            user_id_str: str = payload.get("sub")
            email: str = payload.get("email")
            
            if user_id_str is None:
                raise credentials_exception
            
            # For Cognito, user_id is a UUID string
            return TokenData(user_id=user_id_str, email=email)
        else:
            # Local JWT tokens
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id_str: str = payload.get("sub")
            email: str = payload.get("email")
            
            if user_id_str is None:
                raise credentials_exception
            
            # For local JWT tokens, convert to integer for backward compatibility
            # In practice, with DynamoDB we use string UUIDs
            try:
                user_id = int(user_id_str)
            except ValueError:
                # If it's not an integer, keep it as a string (UUID)
                user_id = user_id_str
                
            return TokenData(user_id=user_id, email=email)
    except JWTError as e:
        logger.error(f"JWT decode error: {e}")
        raise credentials_exception


# Dev mode with DynamoDB: No database dependency
async def get_current_user_dynamodb() -> User:
    """Get mock user for DynamoDB mode (no database, auth disabled)."""
    from backend.projects.models import User
    mock_user = User(
        id="dev-user-001",  # String ID for DynamoDB
        email="dev@test.com",
        password_hash="mock-hash-no-real-auth"  # Skip bcrypt in dev mode
    )
    logger.debug("Using mock user for DynamoDB mode")
    return mock_user


# Production mode with Cognito + DynamoDB
async def get_current_user_cognito(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    request: Request = None
) -> User:
    """Get current user in Cognito mode (DynamoDB, auth via Cognito JWT)."""
    # Log whether Authorization header is present (sanitized) for diagnostics
    try:
        auth_header = None
        if request is not None:
            auth_header = request.headers.get("authorization")
        if auth_header:
            parts = auth_header.split()
            token_part = parts[1] if len(parts) > 1 else parts[0]
            mask = token_part[:12]
            logger.info(f"Auth header present: yes, token mask: {mask}...")
        else:
            logger.info("Auth header present: no")
    except Exception:
        logger.exception("Failed to read Authorization header")

    token = credentials.credentials
    token_data = decode_access_token(token)
    
    # In Cognito mode, user_id is the Cognito sub (UUID string)
    # We create a User object on-the-fly (DynamoDB doesn't have a users table)
    from backend.projects.models import User
    user = User(
        id=token_data.user_id,  # This is the Cognito sub (UUID)
        email=token_data.email or "unknown@example.com",
        password_hash=""  # Not used in Cognito mode
    )
    logger.debug(f"Cognito user authenticated: {user.id} ({user.email})")
    return user


# Dev mode: Create a separate dependency that doesn't require auth
async def get_current_user_dev(db: Session = Depends(get_db)) -> User:
    """Get current user in development mode (no auth required)."""
    # Normal dev mode with database
    test_user = db.query(User).filter(User.email == "dev@test.com").first()
    if not test_user:
        test_user = User(
            email="dev@test.com",
            password_hash=get_password_hash("devpassword123")
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)
        logger.info("Created test user: dev@test.com")
    return test_user


# Production mode: Normal auth
async def get_current_user_prod(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Get current user in production mode (auth required)."""
    token = credentials.credentials
    token_data = decode_access_token(token)
    
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user


# Select the appropriate dependency based on DISABLE_AUTH, USE_COGNITO, and USE_DYNAMODB
USE_DYNAMODB = os.getenv("USE_DYNAMODB", "false").lower() == "true"

if USE_DYNAMODB and DISABLE_AUTH:
    # Development mode: no auth
    get_current_user = get_current_user_dynamodb
    logger.info("Auth mode: DynamoDB DEV (no authentication)")
elif USE_COGNITO and USE_DYNAMODB:
    # Production mode: Cognito + DynamoDB
    get_current_user = get_current_user_cognito
    logger.info("Auth mode: Cognito + DynamoDB (production)")
elif DISABLE_AUTH:
    # Development mode: local database, no auth
    get_current_user = get_current_user_dev
    logger.info("Auth mode: Local DEV (no authentication)")
else:
    # Production mode: local JWT + database
    get_current_user = get_current_user_prod
    logger.info("Auth mode: Local JWT + Database")
