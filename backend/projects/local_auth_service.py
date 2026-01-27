"""Local Authentication Service for Docker/On-Prem Deployments.

This service provides authentication functionality for local deployments
without relying on AWS Cognito. It handles:
- User registration with password hashing
- User authentication and credential validation
- JWT token generation using LOCAL_JWT_SECRET
- User unlocked by default (no manual approval required)
"""

import os
import logging
from datetime import datetime, timedelta
from typing import Dict
from jose import jwt
from backend.projects.auth import get_password_hash, verify_password
from backend.common.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

# Configuration
LOCAL_JWT_SECRET = os.getenv(
    'LOCAL_JWT_SECRET',
    os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
)
JWT_ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 60

# Password requirements
MIN_PASSWORD_LENGTH = 8


class LocalAuthService:
    """
    Local authentication service for Docker/on-prem deployments.
    
    Provides user registration, authentication, and JWT token management
    without AWS Cognito dependency.
    """
    
    def __init__(self):
        """Initialize the local authentication service."""
        self.user_repo = UserRepository()
        logger.info("LocalAuthService initialized")
    
    def register_user(self, email: str, username: str, password: str) -> Dict:
        """
        Register a new user in the local database.
        
        Args:
            email: User's email address
            username: Username
            password: Plain text password (will be hashed)
            
        Returns:
            Dict with user information
            
        Raises:
            ValueError: If email already exists or password is invalid
        """
        # Validate email uniqueness
        existing_user = self.user_repo.get_user_by_email(email)
        if existing_user:
            logger.warning(f"Registration attempt with existing email: {email}")
            raise ValueError("Email already registered")
        
        # Validate password strength
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
        
        # Check if this is the first user (becomes admin)
        user_count = self.user_repo.get_user_count()
        is_first_user = (user_count == 0)
        
        # Hash password
        password_hash = get_password_hash(password)
        
        # Create user (unlocked by default)
        db_user = self.user_repo.create_user(
            email=email,
            username=username,
            password_hash=password_hash,
            is_locked=False,  # Users are unlocked by default
            is_admin=is_first_user
        )
        
        logger.info(
            f"User registered: {email}, "
            f"is_admin={is_first_user}, "
            f"is_locked=False"
        )
        
        return {
            'user_id': db_user['user_id'],
            'email': db_user['email'],
            'username': db_user['username'],
            'is_locked': db_user.get('is_locked', False),
            'is_admin': db_user.get('is_admin', False),
            'created_at': db_user.get('created_at')
        }
    
    def authenticate_user(self, email: str, password: str) -> Dict:
        """
        Authenticate a user and generate JWT token.
        
        Args:
            email: User's email address
            password: Plain text password
            
        Returns:
            Dict with access_token, token_type, and expires_in
            
        Raises:
            ValueError: If credentials are invalid or user is locked
        """
        # Get user from database
        db_user = self.user_repo.get_user_by_email(email)
        
        if not db_user:
            logger.warning(f"Login attempt with non-existent email: {email}")
            raise ValueError("Invalid email or password")
        
        # Verify password
        password_hash = db_user.get('password_hash', '')
        if not verify_password(password, password_hash):
            logger.warning(f"Login attempt with invalid password: {email}")
            raise ValueError("Invalid email or password")
        
        # Check if user is locked
        if db_user.get('is_locked', False):
            logger.warning(f"Login attempt by locked user: {email}")
            raise ValueError("Account is locked. Please contact an administrator.")
        
        # Generate JWT token
        user_data = {
            'user_id': db_user['user_id'],
            'email': db_user['email']
        }
        access_token = self._generate_token(user_data)
        
        logger.info(f"User authenticated successfully: {email}")
        
        return {
            'access_token': access_token,
            'token_type': 'bearer',
            'expires_in': ACCESS_TOKEN_EXPIRE_MINUTES * 60  # Convert to seconds
        }
    
    def _generate_token(self, user_data: Dict) -> str:
        """
        Generate a JWT access token for a user.
        
        Args:
            user_data: Dict with user_id and email
            
        Returns:
            Encoded JWT token string
        """
        now = datetime.utcnow()
        expires = now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        payload = {
            'sub': user_data['user_id'],  # Subject (user ID)
            'email': user_data['email'],
            'iat': now,  # Issued at
            'exp': expires  # Expiration
        }
        
        token = jwt.encode(payload, LOCAL_JWT_SECRET, algorithm=JWT_ALGORITHM)
        return token
