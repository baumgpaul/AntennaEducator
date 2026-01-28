"""Auth Service - FastAPI application for authentication."""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import timedelta
import logging
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Console output only (goes to CloudWatch)
    ]
)
logger = logging.getLogger(__name__)

from backend.auth.schemas import UserCreate, UserLogin, UserResponse, Token
from backend.projects.auth import (
    get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES, USE_COGNITO
)
from backend.projects import cognito_service
from backend.projects.local_auth_service import LocalAuthService
from backend.projects.models import User

# Initialize local auth service for Docker mode
local_auth_service = LocalAuthService()

# Initialize FastAPI app
app = FastAPI(
    title="PEEC Antenna Simulator - Auth Service",
    description="Authentication and user management API",
    version="0.1.0"
)

# CORS middleware - only add if not running in Lambda (Lambda Function URL handles CORS)
if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for development
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info("CORS middleware enabled (non-Lambda environment)")
else:
    logger.info("CORS handled by Lambda Function URL - middleware disabled")

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    from datetime import datetime
    logger.debug("Health check requested")
    
    return {
        "status": "healthy",
        "service": "auth",
        "timestamp": datetime.utcnow().isoformat(),
        "auth_mode": "cognito" if USE_COGNITO else "local"
    }


# Authentication endpoints
@app.post("/api/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """
    Register a new user.
    
    Docker Mode (USE_COGNITO=false):
    - Creates user in DynamoDB via local_auth_service
    - User is unlocked by default (is_locked=false)
    - First user becomes admin automatically
    
    AWS Mode (USE_COGNITO=true):
    - Creates user in AWS Cognito
    - User is auto-confirmed (no email verification)
    - User is unlocked by default
    """
    if USE_COGNITO:
        # AWS Mode: Register in Cognito
        try:
            result = cognito_service.register_user(
                email=user_data.email,
                username=user_data.username,
                password=user_data.password
            )
            
            # Return user info matching UserResponse schema
            return UserResponse(
                id=-1,  # No DB ID in Cognito mode
                email=result['email'],
                username=result['username'],
                is_approved=result.get('is_approved', True),
                is_admin=False,  # Admin status managed via Cognito groups
                is_locked=result.get('is_locked', False),  # Users unlocked by default
                cognito_sub=result['user_sub'],
                created_at="2026-01-26T00:00:00Z"  # Placeholder
            )
            
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        except RuntimeError as e:
            logger.error(f"Cognito registration error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration failed. Please try again."
            )
    
    else:
        # Docker Mode: Register via local auth service
        try:
            db_user = local_auth_service.register_user(
                email=user_data.email,
                username=user_data.username,
                password=user_data.password
            )
            
            logger.info(f"User registered: {user_data.email}, is_admin={db_user['is_admin']}, is_locked={db_user['is_locked']}")
            
            return UserResponse(
                id=-1,  # DynamoDB uses UUID, not int ID
                email=db_user['email'],
                username=db_user['username'],
                is_approved=True,  # Keep for backward compatibility
                is_admin=db_user['is_admin'],
                is_locked=db_user['is_locked'],
                created_at=db_user['created_at']
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        except Exception as e:
            logger.error(f"Registration error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Registration failed"
            )


@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """
    Login and get access token.
    
    Docker Mode (USE_COGNITO=false):
    - Validates credentials via local_auth_service
    - Checks is_locked field
    - Returns JWT token
    
    AWS Mode (USE_COGNITO=true):
    - Validates against Cognito
    - Checks is_locked field in DynamoDB
    - Returns Cognito access token
    """
    if USE_COGNITO:
        # AWS Mode: Authenticate with Cognito
        try:
            result = cognito_service.authenticate_user(
                email=user_data.email,
                password=user_data.password
            )
            
            logger.info(f"Cognito user logged in: {user_data.email}")
            
            return Token(
                access_token=result['access_token'],
                token_type=result['token_type'],
                expires_in=result['expires_in']
            )
            
        except ValueError as e:
            error_msg = str(e)
            if "locked" in error_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=error_msg
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=error_msg
                )
        except RuntimeError as e:
            logger.error(f"Cognito authentication error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication failed. Please try again."
            )
    
    else:
        # Docker Mode: Authenticate via local auth service
        try:
            result = local_auth_service.authenticate_user(
                email=user_data.email,
                password=user_data.password
            )
            
            logger.info(f"Local user logged in: {user_data.email}")
            
            return Token(
                access_token=result['access_token'],
                token_type=result['token_type'],
                expires_in=result['expires_in']
            )
            
        except ValueError as e:
            error_msg = str(e)
            if "locked" in error_msg.lower():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=error_msg
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=error_msg
                )
        except Exception as e:
            logger.error(f"Local authentication error: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication failed"
            )


@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return current_user


# Lambda handler for AWS Lambda deployment
def handler(event, context):
    """AWS Lambda handler using Mangum."""
    from mangum import Mangum
    asgi_handler = Mangum(app)
    return asgi_handler(event, context)
