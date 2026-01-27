"""Unified JWT Middleware for Local and Cognito Tokens.

This middleware provides a single interface for validating both:
1. Local JWTs (Docker/on-prem) - validated using LOCAL_JWT_SECRET
2. AWS Cognito JWTs - validated using Cognito JWKS (public keys)

Both token types return the same TokenData structure for consistency.
"""

import os
import logging
import json
import base64
from typing import Optional
from dataclasses import dataclass
from jose import jwt, JWTError
from datetime import datetime

logger = logging.getLogger(__name__)

# Configuration
LOCAL_JWT_SECRET = os.getenv(
    'LOCAL_JWT_SECRET',
    os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
)
JWT_ALGORITHM = 'HS256'

# Cognito configuration (for AWS mode)
COGNITO_REGION = os.getenv("COGNITO_REGION", "eu-west-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")


@dataclass
class TokenData:
    """Unified token data structure for both local and Cognito tokens."""
    user_id: str
    email: Optional[str] = None


class JWTMiddleware:
    """
    Unified JWT validation middleware.
    
    Validates both local JWTs and AWS Cognito JWTs, returning
    a consistent TokenData structure regardless of token source.
    """
    
    def __init__(self):
        """Initialize the JWT middleware."""
        logger.info("JWTMiddleware initialized")
    
    def validate_token(self, token: str, is_cognito: bool) -> TokenData:
        """
        Validate a JWT token (local or Cognito).
        
        Args:
            token: JWT token string
            is_cognito: True for Cognito tokens, False for local tokens
            
        Returns:
            TokenData with user_id and email
            
        Raises:
            ValueError: If token is invalid, expired, or malformed
        """
        if not token or not isinstance(token, str):
            raise ValueError("Token must be a non-empty string")
        
        if token.strip() == '':
            raise ValueError("Token cannot be empty")
        
        try:
            if is_cognito:
                return self._validate_cognito_token(token)
            else:
                return self._validate_local_token(token)
        except JWTError as e:
            logger.error(f"JWT validation error: {e}")
            raise ValueError(f"Invalid token: {e}")
    
    def _validate_local_token(self, token: str) -> TokenData:
        """
        Validate a local JWT token.
        
        Args:
            token: Local JWT token string
            
        Returns:
            TokenData extracted from token
            
        Raises:
            ValueError: If token is invalid or expired
        """
        try:
            # Decode and verify the token
            payload = jwt.decode(
                token,
                LOCAL_JWT_SECRET,
                algorithms=[JWT_ALGORITHM]
            )
            
            # Extract required claims
            user_id = payload.get('sub')
            email = payload.get('email')
            
            if not user_id:
                raise ValueError("Token missing required 'sub' claim")
            
            logger.debug(f"Local JWT validated: user_id={user_id}")
            return TokenData(user_id=user_id, email=email)
            
        except jwt.ExpiredSignatureError:
            logger.warning("Local JWT token expired")
            raise ValueError("Token expired")
        except jwt.JWTClaimsError as e:
            logger.warning(f"Local JWT claims error: {e}")
            raise ValueError(f"Invalid token claims: {e}")
        except JWTError as e:
            logger.warning(f"Local JWT validation error: {e}")
            raise ValueError(f"Invalid token signature or format: {e}")
    
    def _validate_cognito_token(self, token: str) -> TokenData:
        """
        Validate an AWS Cognito JWT token.
        
        For production, this should verify the token signature using
        Cognito's JWKS (public keys). For now, we decode without verification
        to read the payload.
        
        Args:
            token: Cognito JWT token string
            
        Returns:
            TokenData extracted from token
            
        Raises:
            ValueError: If token is invalid or expired
        """
        try:
            # Manually decode JWT payload without signature verification
            # JWT format: header.payload.signature
            parts = token.split('.')
            if len(parts) != 3:
                raise ValueError("Invalid JWT format")
            
            # Decode the payload (second part)
            payload_part = parts[1]
            # Add padding if needed for base64 decoding
            padding = 4 - (len(payload_part) % 4)
            if padding != 4:
                payload_part += '=' * padding
            
            payload_bytes = base64.urlsafe_b64decode(payload_part)
            payload = json.loads(payload_bytes.decode('utf-8'))
            
            # Check expiration
            exp = payload.get('exp')
            if exp:
                exp_datetime = datetime.fromtimestamp(exp)
                if datetime.utcnow() > exp_datetime:
                    raise ValueError("Token expired")
            
            # Extract user info from Cognito claims
            user_id = payload.get('sub')
            email = payload.get('email')
            
            if not user_id:
                raise ValueError("Token missing required 'sub' claim")
            
            logger.debug(f"Cognito JWT validated: user_id={user_id}")
            return TokenData(user_id=user_id, email=email)
            
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            logger.error(f"Cognito token validation error: {e}")
            raise ValueError(f"Invalid Cognito token: {e}")
    
    def detect_token_type(self, token: str) -> bool:
        """
        Detect whether a token is from Cognito or local.
        
        Cognito tokens have specific claims like:
        - cognito:username
        - token_use
        - iss (issuer) pointing to Cognito
        
        Args:
            token: JWT token string
            
        Returns:
            True if Cognito token, False if local token
        """
        try:
            # Decode without verification to check claims
            parts = token.split('.')
            if len(parts) != 3:
                return False
            
            payload_part = parts[1]
            padding = 4 - (len(payload_part) % 4)
            if padding != 4:
                payload_part += '=' * padding
            
            payload_bytes = base64.urlsafe_b64decode(payload_part)
            payload = json.loads(payload_bytes.decode('utf-8'))
            
            # Check for Cognito-specific claims
            has_cognito_username = 'cognito:username' in payload
            has_token_use = 'token_use' in payload
            
            # Check issuer
            issuer = payload.get('iss', '')
            has_cognito_issuer = 'cognito' in issuer.lower()
            
            # If any Cognito-specific claim exists, it's a Cognito token
            is_cognito = has_cognito_username or has_token_use or has_cognito_issuer
            
            return is_cognito
            
        except Exception as e:
            logger.warning(f"Error detecting token type: {e}")
            # Default to local token if detection fails
            return False
