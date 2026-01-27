"""Unit tests for unified JWT middleware.

Tests JWT validation for both local (Docker/on-prem) and AWS Cognito tokens.
The middleware must provide a consistent interface regardless of token source.
"""

import pytest
import os
from datetime import datetime, timedelta
from jose import jwt
from unittest.mock import Mock, patch, MagicMock
from backend.projects.jwt_middleware import JWTMiddleware, TokenData


@pytest.fixture
def jwt_middleware():
    """Create a JWTMiddleware instance for testing."""
    return JWTMiddleware()


@pytest.fixture
def local_secret():
    """Get the local JWT secret."""
    return os.getenv('LOCAL_JWT_SECRET', os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production'))


class TestLocalJWTValidation:
    """Test validation of local JWT tokens (Docker/on-prem mode)."""
    
    def test_validate_local_jwt_success(self, jwt_middleware, local_secret):
        """Test successful validation of a local JWT token."""
        # Arrange - Create a valid local JWT
        payload = {
            'sub': 'user-123',
            'email': 'user@example.com',
            'iat': datetime.utcnow(),
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(payload, local_secret, algorithm='HS256')
        
        # Act
        result = jwt_middleware.validate_token(token, is_cognito=False)
        
        # Assert
        assert isinstance(result, TokenData)
        assert result.user_id == 'user-123'
        assert result.email == 'user@example.com'
    
    def test_validate_local_jwt_expired(self, jwt_middleware, local_secret):
        """Test that expired local tokens are rejected."""
        # Arrange - Create an expired token
        payload = {
            'sub': 'user-123',
            'email': 'user@example.com',
            'iat': datetime.utcnow() - timedelta(hours=2),
            'exp': datetime.utcnow() - timedelta(hours=1)
        }
        token = jwt.encode(payload, local_secret, algorithm='HS256')
        
        # Act & Assert
        with pytest.raises(ValueError, match="Token expired|expired"):
            jwt_middleware.validate_token(token, is_cognito=False)
    
    def test_validate_local_jwt_invalid_signature(self, jwt_middleware):
        """Test that tokens with invalid signatures are rejected."""
        # Arrange - Create a token with wrong secret
        payload = {
            'sub': 'user-123',
            'email': 'user@example.com',
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(payload, 'wrong-secret', algorithm='HS256')
        
        # Act & Assert
        with pytest.raises(ValueError, match="Invalid token|signature"):
            jwt_middleware.validate_token(token, is_cognito=False)
    
    def test_validate_local_jwt_missing_subject(self, jwt_middleware, local_secret):
        """Test that tokens without 'sub' claim are rejected."""
        # Arrange - Create token without sub
        payload = {
            'email': 'user@example.com',
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(payload, local_secret, algorithm='HS256')
        
        # Act & Assert
        with pytest.raises(ValueError, match="Invalid token|subject|sub"):
            jwt_middleware.validate_token(token, is_cognito=False)


class TestCognitoJWTValidation:
    """Test validation of AWS Cognito JWT tokens."""
    
    def test_validate_cognito_jwt_success(self, jwt_middleware):
        """Test successful validation of a Cognito JWT token."""
        # Arrange - Create a mock Cognito token (without signature verification for testing)
        payload = {
            'sub': 'cognito-user-uuid',
            'email': 'cognito@example.com',
            'cognito:username': 'cognitouser',
            'token_use': 'access',
            'iat': datetime.utcnow(),
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        
        # For testing, we'll patch the Cognito validation
        with patch.object(jwt_middleware, '_validate_cognito_token') as mock_validate:
            mock_validate.return_value = TokenData(
                user_id='cognito-user-uuid',
                email='cognito@example.com'
            )
            
            # Act
            result = jwt_middleware.validate_token('mock-cognito-token', is_cognito=True)
            
            # Assert
            assert isinstance(result, TokenData)
            assert result.user_id == 'cognito-user-uuid'
            assert result.email == 'cognito@example.com'
            mock_validate.assert_called_once()
    
    def test_validate_cognito_jwt_expired(self, jwt_middleware):
        """Test that expired Cognito tokens are rejected."""
        with patch.object(jwt_middleware, '_validate_cognito_token') as mock_validate:
            mock_validate.side_effect = ValueError("Token expired")
            
            # Act & Assert
            with pytest.raises(ValueError, match="Token expired"):
                jwt_middleware.validate_token('expired-cognito-token', is_cognito=True)
    
    def test_validate_cognito_jwt_invalid_token(self, jwt_middleware):
        """Test that invalid Cognito tokens are rejected."""
        with patch.object(jwt_middleware, '_validate_cognito_token') as mock_validate:
            mock_validate.side_effect = ValueError("Invalid Cognito token")
            
            # Act & Assert
            with pytest.raises(ValueError, match="Invalid"):
                jwt_middleware.validate_token('invalid-token', is_cognito=True)


class TestTokenTypeDetection:
    """Test automatic detection of token type."""
    
    def test_detect_local_jwt(self, jwt_middleware, local_secret):
        """Test that local JWTs are correctly detected."""
        # Arrange - Create a standard JWT
        payload = {
            'sub': 'user-123',
            'email': 'user@example.com',
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(payload, local_secret, algorithm='HS256')
        
        # Act
        is_cognito = jwt_middleware.detect_token_type(token)
        
        # Assert
        assert is_cognito is False
    
    def test_detect_cognito_jwt(self, jwt_middleware):
        """Test that Cognito JWTs are correctly detected."""
        # Arrange - Create a mock Cognito token structure
        # Cognito tokens have specific claims like 'cognito:username', 'token_use'
        payload = {
            'sub': 'cognito-uuid',
            'email': 'user@example.com',
            'cognito:username': 'testuser',
            'token_use': 'access',
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        # Use a fake secret for structure testing
        token = jwt.encode(payload, 'fake-secret', algorithm='HS256')
        
        # Act
        is_cognito = jwt_middleware.detect_token_type(token)
        
        # Assert
        assert is_cognito is True


class TestUnifiedInterface:
    """Test that the middleware provides a consistent interface."""
    
    def test_validate_returns_consistent_tokendata_for_local(self, jwt_middleware, local_secret):
        """Test that local token validation returns TokenData."""
        # Arrange
        payload = {
            'sub': 'local-user-123',
            'email': 'local@example.com',
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        token = jwt.encode(payload, local_secret, algorithm='HS256')
        
        # Act
        result = jwt_middleware.validate_token(token, is_cognito=False)
        
        # Assert
        assert hasattr(result, 'user_id')
        assert hasattr(result, 'email')
        assert result.user_id == 'local-user-123'
        assert result.email == 'local@example.com'
    
    def test_validate_returns_consistent_tokendata_for_cognito(self, jwt_middleware):
        """Test that Cognito token validation returns TokenData."""
        # Arrange - Mock Cognito validation
        with patch.object(jwt_middleware, '_validate_cognito_token') as mock_validate:
            mock_validate.return_value = TokenData(
                user_id='cognito-uuid',
                email='cognito@example.com'
            )
            
            # Act
            result = jwt_middleware.validate_token('cognito-token', is_cognito=True)
            
            # Assert
            assert hasattr(result, 'user_id')
            assert hasattr(result, 'email')
            assert result.user_id == 'cognito-uuid'
            assert result.email == 'cognito@example.com'
    
    def test_both_token_types_return_same_structure(self, jwt_middleware, local_secret):
        """Test that both token types return the same TokenData structure."""
        # Arrange - Local token
        local_payload = {
            'sub': 'local-123',
            'email': 'local@example.com',
            'exp': datetime.utcnow() + timedelta(hours=1)
        }
        local_token = jwt.encode(local_payload, local_secret, algorithm='HS256')
        
        # Act - Validate local token
        local_result = jwt_middleware.validate_token(local_token, is_cognito=False)
        
        # Act - Validate Cognito token (mocked)
        with patch.object(jwt_middleware, '_validate_cognito_token') as mock_validate:
            mock_validate.return_value = TokenData(
                user_id='cognito-123',
                email='cognito@example.com'
            )
            cognito_result = jwt_middleware.validate_token('cognito-token', is_cognito=True)
        
        # Assert - Both should have same attributes
        assert type(local_result) == type(cognito_result)
        assert dir(local_result) == dir(cognito_result)


class TestErrorHandling:
    """Test error handling and edge cases."""
    
    def test_validate_empty_token(self, jwt_middleware):
        """Test that empty tokens are rejected."""
        with pytest.raises(ValueError):
            jwt_middleware.validate_token('', is_cognito=False)
    
    def test_validate_malformed_token(self, jwt_middleware):
        """Test that malformed tokens are rejected."""
        with pytest.raises(ValueError):
            jwt_middleware.validate_token('not.a.valid.jwt.token.format', is_cognito=False)
    
    def test_validate_none_token(self, jwt_middleware):
        """Test that None tokens are rejected."""
        with pytest.raises((ValueError, TypeError)):
            jwt_middleware.validate_token(None, is_cognito=False)
