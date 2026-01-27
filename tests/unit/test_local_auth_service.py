"""Unit tests for local authentication service.

Tests the local authentication service for Docker/on-prem deployments.
This service handles user registration, authentication, and JWT issuance
without relying on AWS Cognito.
"""

import pytest
from datetime import datetime, timedelta
from jose import jwt
from unittest.mock import Mock, patch, MagicMock
from backend.projects.local_auth_service import LocalAuthService


@pytest.fixture
def auth_service():
    """Create a LocalAuthService instance for testing."""
    with patch('backend.projects.local_auth_service.UserRepository') as mock_repo_class:
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        service = LocalAuthService()
        service.user_repo = mock_repo
        yield service


class TestUserRegistration:
    """Test user registration functionality."""
    
    def test_register_user_creates_unlocked_user(self, auth_service):
        """Test that newly registered users are unlocked by default."""
        # Arrange
        auth_service.user_repo.get_user_by_email.return_value = None  # User doesn't exist
        auth_service.user_repo.create_user.return_value = {
            'user_id': 'test-uuid-123',
            'email': 'test@example.com',
            'username': 'testuser',
            'is_locked': False,
            'is_admin': False,
            'created_at': datetime.utcnow().isoformat()
        }
        auth_service.user_repo.get_user_count.return_value = 5  # Not first user
        
        # Act
        result = auth_service.register_user(
            email='test@example.com',
            username='testuser',
            password='SecurePass123!'
        )
        
        # Assert
        assert result['is_locked'] is False
        assert result['email'] == 'test@example.com'
        auth_service.user_repo.create_user.assert_called_once()
        call_kwargs = auth_service.user_repo.create_user.call_args[1]
        assert call_kwargs['is_locked'] is False
    
    def test_register_first_user_becomes_admin(self, auth_service):
        """Test that the first registered user becomes an admin."""
        # Arrange
        auth_service.user_repo.get_user_by_email.return_value = None
        auth_service.user_repo.get_user_count.return_value = 0  # First user
        auth_service.user_repo.create_user.return_value = {
            'user_id': 'first-user-uuid',
            'email': 'admin@example.com',
            'username': 'admin',
            'is_locked': False,
            'is_admin': True,
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Act
        result = auth_service.register_user(
            email='admin@example.com',
            username='admin',
            password='AdminPass123!'
        )
        
        # Assert
        assert result['is_admin'] is True
        call_kwargs = auth_service.user_repo.create_user.call_args[1]
        assert call_kwargs['is_admin'] is True
    
    def test_register_duplicate_email_raises_error(self, auth_service):
        """Test that registering duplicate email raises ValueError."""
        # Arrange
        auth_service.user_repo.get_user_by_email.return_value = {
            'user_id': 'existing-uuid',
            'email': 'existing@example.com'
        }
        
        # Act & Assert
        with pytest.raises(ValueError, match="Email already registered"):
            auth_service.register_user(
                email='existing@example.com',
                username='newuser',
                password='Pass123!'
            )
    
    def test_register_validates_password_strength(self, auth_service):
        """Test that weak passwords are rejected."""
        # Arrange
        auth_service.user_repo.get_user_by_email.return_value = None
        
        # Act & Assert - Test various weak passwords
        weak_passwords = ['123', 'abc', 'short', '']
        
        for weak_pass in weak_passwords:
            with pytest.raises(ValueError, match="Password must be at least"):
                auth_service.register_user(
                    email='test@example.com',
                    username='testuser',
                    password=weak_pass
                )


class TestUserAuthentication:
    """Test user authentication functionality."""
    
    def test_authenticate_valid_credentials_returns_token(self, auth_service):
        """Test authentication with valid credentials returns JWT token."""
        # Arrange
        from backend.projects.auth import get_password_hash
        password = 'ValidPass123!'
        hashed = get_password_hash(password)
        
        auth_service.user_repo.get_user_by_email.return_value = {
            'user_id': 'user-uuid-123',
            'email': 'user@example.com',
            'username': 'validuser',
            'password_hash': hashed,
            'is_locked': False,
            'is_admin': False
        }
        
        # Act
        result = auth_service.authenticate_user(
            email='user@example.com',
            password=password
        )
        
        # Assert
        assert 'access_token' in result
        assert result['token_type'] == 'bearer'
        assert 'expires_in' in result
        
        # Verify JWT token contents
        import os
        secret = os.getenv('LOCAL_JWT_SECRET', os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production'))
        decoded = jwt.decode(result['access_token'], secret, algorithms=['HS256'])
        assert decoded['sub'] == 'user-uuid-123'
        assert decoded['email'] == 'user@example.com'
    
    def test_authenticate_invalid_email_raises_error(self, auth_service):
        """Test authentication with non-existent email raises error."""
        # Arrange
        auth_service.user_repo.get_user_by_email.return_value = None
        
        # Act & Assert
        with pytest.raises(ValueError, match="Invalid email or password"):
            auth_service.authenticate_user(
                email='nonexistent@example.com',
                password='AnyPass123!'
            )
    
    def test_authenticate_invalid_password_raises_error(self, auth_service):
        """Test authentication with wrong password raises error."""
        # Arrange
        from backend.projects.auth import get_password_hash
        correct_password = 'CorrectPass123!'
        hashed = get_password_hash(correct_password)
        
        auth_service.user_repo.get_user_by_email.return_value = {
            'user_id': 'user-uuid-123',
            'email': 'user@example.com',
            'password_hash': hashed,
            'is_locked': False
        }
        
        # Act & Assert
        with pytest.raises(ValueError, match="Invalid email or password"):
            auth_service.authenticate_user(
                email='user@example.com',
                password='WrongPass123!'
            )
    
    def test_authenticate_locked_user_raises_error(self, auth_service):
        """Test that locked users cannot authenticate."""
        # Arrange
        from backend.projects.auth import get_password_hash
        password = 'ValidPass123!'
        hashed = get_password_hash(password)
        
        auth_service.user_repo.get_user_by_email.return_value = {
            'user_id': 'locked-user-uuid',
            'email': 'locked@example.com',
            'password_hash': hashed,
            'is_locked': True  # User is locked
        }
        
        # Act & Assert
        with pytest.raises(ValueError, match="Account is locked"):
            auth_service.authenticate_user(
                email='locked@example.com',
                password=password
            )


class TestJWTTokenGeneration:
    """Test JWT token generation and validation."""
    
    def test_generate_token_includes_required_claims(self, auth_service):
        """Test that generated tokens include all required claims."""
        # Arrange
        user_data = {
            'user_id': 'test-uuid',
            'email': 'test@example.com'
        }
        
        # Act
        token = auth_service._generate_token(user_data)
        
        # Assert
        import os
        secret = os.getenv('LOCAL_JWT_SECRET', os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production'))
        decoded = jwt.decode(token, secret, algorithms=['HS256'])
        
        assert decoded['sub'] == 'test-uuid'
        assert decoded['email'] == 'test@example.com'
        assert 'exp' in decoded
        assert 'iat' in decoded
    
    def test_generate_token_expires_in_correct_time(self, auth_service):
        """Test that token expiration is set correctly (within 5 seconds tolerance)."""
        # Arrange
        user_data = {
            'user_id': 'test-uuid',
            'email': 'test@example.com'
        }
        
        # Act
        before = datetime.utcnow()
        token = auth_service._generate_token(user_data)
        after = datetime.utcnow()
        
        # Assert
        import os
        secret = os.getenv('LOCAL_JWT_SECRET', os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production'))
        decoded = jwt.decode(token, secret, algorithms=['HS256'])
        
        # Check that expiration is approximately 60 minutes from now
        exp_timestamp = decoded['exp']
        iat_timestamp = decoded['iat']
        
        # The difference should be close to 60 minutes (3600 seconds)
        actual_duration = exp_timestamp - iat_timestamp
        expected_duration = 60 * 60  # 60 minutes in seconds
        
        assert abs(actual_duration - expected_duration) < 5


class TestPasswordHashing:
    """Test password hashing and verification."""
    
    def test_password_is_hashed_not_stored_plaintext(self, auth_service):
        """Test that passwords are hashed, not stored in plaintext."""
        # Arrange
        auth_service.user_repo.get_user_by_email.return_value = None
        auth_service.user_repo.get_user_count.return_value = 1
        
        captured_hash = None
        
        def capture_hash(**kwargs):
            nonlocal captured_hash
            captured_hash = kwargs['password_hash']
            return {
                'user_id': 'test-uuid',
                'email': kwargs['email'],
                'username': kwargs['username'],
                'is_locked': False,
                'is_admin': False,
                'created_at': datetime.utcnow().isoformat()
            }
        
        auth_service.user_repo.create_user.side_effect = capture_hash
        
        # Act
        plaintext_password = 'MySecretPass123!'
        auth_service.register_user(
            email='test@example.com',
            username='testuser',
            password=plaintext_password
        )
        
        # Assert
        assert captured_hash is not None
        assert captured_hash != plaintext_password
        assert len(captured_hash) > 50  # Bcrypt hashes are long
        assert captured_hash.startswith('$2b$')  # Bcrypt format
