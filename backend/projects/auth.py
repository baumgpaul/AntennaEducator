"""Authentication utilities - JWT token handling and password hashing.

Supports two authentication modes:
1. Docker Mode (USE_COGNITO=false): JWT tokens with local database
2. AWS Mode (USE_COGNITO=true): AWS Cognito with admin approval
"""

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import os
import logging
import json
import base64
from dotenv import load_dotenv

# Load environment variables FIRST
load_dotenv()

from backend.projects.database import get_db
from backend.projects.models import User
from backend.projects.schemas import TokenData
from backend.projects.jwt_middleware import JWTMiddleware

logger = logging.getLogger(__name__)

# Initialize JWT middleware
jwt_middleware = JWTMiddleware()

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60
USE_COGNITO = os.getenv("USE_COGNITO", "false").lower() == "true"
COGNITO_REGION = os.getenv("COGNITO_REGION", "eu-west-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")

# Log authentication mode
if USE_COGNITO:
    logger.info(f"Auth Mode: AWS Cognito (Region: {COGNITO_REGION})")
else:
    logger.info("Auth Mode: Local JWT (Docker)")

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer token scheme
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password[:72], hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
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
    Decode and validate a JWT token (Docker mode) or Cognito token (AWS mode).
    
    Uses the unified JWT middleware to validate both token types.
    
    Args:
        token: JWT token string
        
    Returns:
        TokenData with user information
        
    Raises:
        HTTPException: If token is invalid or user not approved
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Use unified JWT middleware to validate token
        token_data = jwt_middleware.validate_token(token, is_cognito=USE_COGNITO)
        logger.debug(f"Token validated: {token_data.user_id} ({token_data.email})")
        return token_data
            
    except ValueError as e:
        logger.error(f"Token validation error: {e}")
        raise credentials_exception
    except Exception as e:
        logger.error(f"Unexpected token validation error: {e}")
        raise credentials_exception


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """
    Universal authentication function - works for both Docker and AWS modes.
    
    Docker Mode (USE_COGNITO=false):
    - Validates JWT token
    - Checks is_locked field in database
    - Returns User from database
    
    AWS Mode (USE_COGNITO=true):
    - Validates Cognito JWT token
    - Checks is_locked field in DynamoDB
    - Creates User object from DynamoDB data
    
    Args:
        credentials: Bearer token from Authorization header
        
    Returns:
        User object
        
    Raises:
        HTTPException: 401 if invalid token, 403 if user is locked
    """
    token = credentials.credentials
    token_data = decode_access_token(token)
    
    if USE_COGNITO:
        # AWS Mode: Check lock status in DynamoDB and create User object
        import boto3
        from botocore.exceptions import ClientError
        
        dynamodb = boto3.resource('dynamodb', region_name=COGNITO_REGION)
        table_name = os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-staging")
        users_table = dynamodb.Table(table_name)
        
        try:
            response = users_table.get_item(
                Key={
                    'PK': f'USER#{token_data.user_id}',
                    'SK': 'METADATA'
                }
            )
            user_item = response.get('Item')
            
            if not user_item:
                # Lazy initialization: Create user record on first API call
                # This handles users who register directly via Cognito SDK
                logger.info(f"Lazy init: Creating DynamoDB record for Cognito user {token_data.user_id}")
                
                from datetime import datetime
                
                # Extract username from email or use a default
                email = token_data.email or "unknown@example.com"
                username = email.split('@')[0] if email else f"user_{token_data.user_id[:8]}"
                
                # Create user record
                user_item = {
                    'PK': f'USER#{token_data.user_id}',
                    'SK': 'METADATA',
                    'user_id': token_data.user_id,
                    'email': email,
                    'username': username,
                    'is_approved': True,
                    'is_locked': False,
                    'is_admin': False,
                    'created_at': datetime.utcnow().isoformat(),
                    'entity_type': 'user'
                }
                
                users_table.put_item(Item=user_item)
                logger.info(f"Created DynamoDB record for Cognito user: {email}")
            
            # Check if user is locked (new field)
            is_locked = user_item.get('is_locked', False)
            if is_locked:
                logger.warning(f"User {token_data.email} attempted access but account is locked")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is locked. Please contact an administrator."
                )
            
            # Create User object from DynamoDB data
            user = User(
                id=token_data.user_id,  # Cognito sub (UUID)
                email=token_data.email or user_item.get('email', "unknown@example.com"),
                username=user_item.get('username', token_data.email.split('@')[0] if token_data.email else "unknown"),
                password_hash="",  # Not used in Cognito mode
                is_approved=user_item.get('is_approved', True),  # Keep for backward compatibility
                is_admin=user_item.get('is_admin', False),
                cognito_sub=token_data.user_id
            )
            logger.debug(f"Cognito user authenticated: {user.id} ({user.email})")
            return user
            
        except ClientError as e:
            logger.error(f"DynamoDB error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error checking user status"
            )
    else:
        # Docker Mode: Look up user in DynamoDB
        from backend.common.repositories.user_repository import UserRepository
        user_repo = UserRepository()
        
        db_user = user_repo.get_user_by_id(token_data.user_id)
        if not db_user:
            logger.warning(f"User not found in DynamoDB: {token_data.user_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )
        
        # Check if user is locked (new field)
        is_locked = db_user.get('is_locked', False)
        if is_locked:
            logger.warning(f"User {token_data.email} attempted access but account is locked")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is locked. Please contact an administrator."
            )
        
        # Create User object from DynamoDB data
        user = User(
            id=db_user['user_id'],
            email=db_user['email'],
            username=db_user['username'],
            password_hash=db_user.get('password_hash', ''),
            is_approved=db_user.get('is_approved', True),  # Keep for backward compatibility
            is_admin=db_user.get('is_admin', False),
            cognito_sub=db_user.get('cognito_sub')
        )
        
        logger.debug(f"JWT user authenticated: {user.id} ({user.email})")
        return user
