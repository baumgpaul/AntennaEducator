"""Authentication utilities - JWT token handling and password hashing."""

from datetime import datetime, timedelta
from typing import Optional, Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials, HTTPAuthorizationCredentials as OptionalHTTPAuth
from sqlalchemy.orm import Session
import os
import logging
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
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


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
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id_str: str = payload.get("sub")
        email: str = payload.get("email")
        
        if user_id_str is None:
            raise credentials_exception
        
        user_id = int(user_id_str)  # Convert string back to integer
            
        return TokenData(user_id=user_id, email=email)
    except JWTError:
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


# Select the appropriate dependency based on DISABLE_AUTH and USE_DYNAMODB
USE_DYNAMODB = os.getenv("USE_DYNAMODB", "false").lower() == "true"
if USE_DYNAMODB and DISABLE_AUTH:
    get_current_user = get_current_user_dynamodb
elif DISABLE_AUTH:
    get_current_user = get_current_user_dev
else:
    get_current_user = get_current_user_prod
