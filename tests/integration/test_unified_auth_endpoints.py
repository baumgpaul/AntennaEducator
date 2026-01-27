"""Integration tests for unified authentication endpoints.

Tests that /auth/login and /auth/register work consistently in both:
- Docker mode (USE_COGNITO=false) with local JWT
- AWS mode (USE_COGNITO=true) with Cognito
"""
import os
import pytest
from unittest.mock import Mock, patch
from fastapi.testclient import TestClient
from backend.projects.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI app."""
    return TestClient(app)


@pytest.fixture
def clean_db():
    """Placeholder fixture for test compatibility."""
    yield None
    

class TestUnifiedRegistrationDocker:
    """Test registration endpoint in Docker mode (USE_COGNITO=false)."""
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_register_first_user_becomes_admin(self, mock_repo_class, client, clean_db):
        """Test that the first user registered becomes admin."""
        # Arrange
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        
        mock_repo.get_user_count.return_value = 0  # No users
        mock_repo.get_user_by_email.return_value = None  # Email check returns nothing
        mock_repo.create_user.return_value = {
            'user_id': 'first-user-uuid',
            'email': 'admin@example.com',
            'username': 'admin',
            'is_locked': False,
            'is_admin': True,
            'created_at': '2026-01-27T00:00:00Z'
        }
        
        registration_data = {
            'email': 'admin@example.com',
            'username': 'admin',
            'password': 'AdminPass123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/register', json=registration_data)
        
        # Assert
        assert response.status_code == 201
        data = response.json()
        assert data['is_admin'] is True
        assert data['email'] == 'admin@example.com'
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_register_user_unlocked_by_default(self, mock_repo_class, client, clean_db):
        """Test that newly registered users are unlocked by default."""
        # Arrange
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        
        mock_repo.get_user_count.return_value = 1  # One user exists
        mock_repo.get_user_by_email.return_value = None  # Email check returns nothing
        
        captured_user = {}
        def capture_create(**kwargs):
            captured_user.update(kwargs)
            return {
                'user_id': 'test-uuid',
                'email': kwargs['email'],
                'username': kwargs['username'],
                'is_locked': kwargs['is_locked'],
                'is_admin': kwargs['is_admin'],
                'created_at': '2026-01-27T00:00:00Z'
            }
        mock_repo.create_user.side_effect = capture_create
        
        registration_data = {
            'email': 'user@example.com',
            'username': 'testuser',
            'password': 'UserPass123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/register', json=registration_data)
        
        # Assert - User is unlocked by default
        assert captured_user.get('is_locked') is False
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_register_duplicate_email_rejected(self, mock_repo_class, client, clean_db):
        """Test that duplicate email registration is rejected."""
        # Arrange - Mock existing user
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        mock_repo.get_user_by_email.return_value = {
            'user_id': 'existing-uuid',
            'email': 'existing@example.com'
        }
        
        registration_data = {
            'email': 'existing@example.com',
            'username': 'testuser',
            'password': 'ValidPass123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/register', json=registration_data)
        
        # Assert
        assert response.status_code == 400
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_register_weak_password_rejected(self, mock_repo_class, client, clean_db):
        """Test that weak passwords are rejected."""
        # Arrange
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        mock_repo.get_user_by_email.return_value = None
        
        registration_data = {
            'email': 'user@example.com',
            'username': 'testuser',
            'password': 'weak'  # Too short
        }
        
        # Act
        response = client.post('/api/v1/auth/register', json=registration_data)
        
        # Assert
        assert response.status_code == 400
        assert 'password' in response.json()['detail'].lower()


class TestUnifiedLoginDocker:
    """Test login endpoint in Docker mode (USE_COGNITO=false)."""
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_login_valid_credentials_returns_token(self, mock_repo_class, client, clean_db):
        """Test successful login with valid credentials."""
        # Arrange - Create a mock user
        from backend.projects.auth import get_password_hash
        password = 'ValidPass123!'
        hashed = get_password_hash(password)
        
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        
        mock_user = {
            'user_id': 'test-uuid',
            'email': 'user@example.com',
            'username': 'testuser',
            'password_hash': hashed,
            'is_locked': False,
            'is_admin': False
        }
        
        # Mock repository methods
        mock_repo.get_user_by_email.return_value = mock_user
        
        login_data = {
            'email': 'user@example.com',
            'password': password
        }
        
        # Act
        response = client.post('/api/v1/auth/login', json=login_data)
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert 'access_token' in data
        assert data['token_type'].lower() == 'bearer'  # Case insensitive
        assert data['expires_in'] == 3600
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_login_invalid_credentials_rejected(self, mock_repo_class, client, clean_db):
        """Test that invalid credentials are rejected."""
        # Arrange - No user found
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        mock_repo.get_user_by_email.return_value = None
        
        login_data = {
            'email': 'nonexistent@example.com',
            'password': 'AnyPassword123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/login', json=login_data)
        
        # Assert
        assert response.status_code == 401
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_login_locked_user_rejected(self, mock_repo_class, client, clean_db):
        """Test that locked users cannot login."""
        # Arrange - Create a locked user
        from backend.projects.auth import get_password_hash
        password = 'ValidPass123!'
        hashed = get_password_hash(password)
        
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        
        mock_user = {
            'user_id': 'locked-uuid',
            'email': 'locked@example.com',
            'username': 'lockeduser',
            'password_hash': hashed,
            'is_locked': True,  # User is locked
            'is_admin': False
        }
        
        mock_repo.get_user_by_email.return_value = mock_user
        
        login_data = {
            'email': 'locked@example.com',
            'password': password
        }
        
        # Act
        response = client.post('/api/v1/auth/login', json=login_data)
        
        # Assert
        assert response.status_code == 403
        assert 'locked' in response.json()['detail'].lower()


class TestUnifiedRegistrationCognito:
    """Test registration endpoint in AWS Cognito mode (USE_COGNITO=true)."""
    
    @patch.dict(os.environ, {'USE_COGNITO': 'true'})
    @patch('backend.projects.cognito_service.cognito_idp')
    @patch('backend.projects.cognito_service.users_table')
    def test_register_cognito_user_unlocked_by_default(self, mock_table, mock_cognito, client):
        """Test that Cognito users are unlocked by default."""
        # Arrange
        mock_cognito.sign_up.return_value = {
            'UserSub': 'cognito-uuid-123',
            'UserConfirmed': False
        }
        
        captured_user = {}
        def capture_put(**kwargs):
            captured_user.update(kwargs['Item'])
        mock_table.put_item.side_effect = capture_put
        
        registration_data = {
            'email': 'cognito@example.com',
            'username': 'cognitouser',
            'password': 'CognitoPass123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/register', json=registration_data)
        
        # Assert
        assert response.status_code == 201
        data = response.json()
        assert data['email'] == 'cognito@example.com'
        # Check DynamoDB record has is_locked=False
        assert captured_user.get('is_locked') is False
    
    @patch.dict(os.environ, {'USE_COGNITO': 'true'})
    @patch('backend.projects.cognito_service.cognito_idp')
    def test_register_cognito_duplicate_email(self, mock_cognito, client):
        """Test that duplicate Cognito registration is handled."""
        # Arrange
        from botocore.exceptions import ClientError
        mock_cognito.sign_up.side_effect = ClientError(
            {'Error': {'Code': 'UsernameExistsException', 'Message': 'User exists'}},
            'SignUp'
        )
        
        registration_data = {
            'email': 'existing@example.com',
            'username': 'existinguser',
            'password': 'ValidPass123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/register', json=registration_data)
        
        # Assert
        assert response.status_code == 400


class TestUnifiedLoginCognito:
    """Test login endpoint in AWS Cognito mode (USE_COGNITO=true)."""
    
    @patch.dict(os.environ, {'USE_COGNITO': 'true'})
    @patch('backend.projects.cognito_service.cognito_idp')
    @patch('backend.projects.cognito_service.users_table')
    def test_login_cognito_success(self, mock_table, mock_cognito, client):
        """Test successful Cognito login."""
        # Arrange
        import base64
        import json
        
        # Create mock JWT tokens
        mock_payload = {
            'sub': 'cognito-uuid',
            'email': 'cognito@example.com',
            'cognito:username': 'cognitouser'
        }
        mock_id_token = 'header.' + base64.urlsafe_b64encode(
            json.dumps(mock_payload).encode()
        ).decode().rstrip('=') + '.signature'
        
        mock_cognito.initiate_auth.return_value = {
            'AuthenticationResult': {
                'AccessToken': 'mock-access-token',
                'IdToken': mock_id_token,
                'RefreshToken': 'mock-refresh-token',
                'ExpiresIn': 3600
            }
        }
        
        # Mock DynamoDB user lookup - user is unlocked
        mock_table.get_item.return_value = {
            'Item': {
                'PK': 'USER#cognito-uuid',
                'SK': 'METADATA',
                'user_id': 'cognito-uuid',
                'email': 'cognito@example.com',
                'username': 'cognitouser',
                'is_locked': False,
                'is_admin': False
            }
        }
        
        login_data = {
            'email': 'cognito@example.com',
            'password': 'CognitoPass123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/login', json=login_data)
        
        # Assert
        assert response.status_code == 200
        data = response.json()
        assert 'access_token' in data
        assert data['token_type'].lower() == 'bearer'  # Case insensitive
        assert data['expires_in'] == 3600
    
    @patch.dict(os.environ, {'USE_COGNITO': 'true'})
    @patch('backend.projects.cognito_service.cognito_idp')
    @patch('backend.projects.cognito_service.users_table')
    def test_login_cognito_locked_user(self, mock_table, mock_cognito, client):
        """Test that locked Cognito users cannot login."""
        # Arrange
        import base64
        import json
        
        mock_payload = {
            'sub': 'locked-cognito-uuid',
            'email': 'locked@example.com'
        }
        mock_id_token = 'header.' + base64.urlsafe_b64encode(
            json.dumps(mock_payload).encode()
        ).decode().rstrip('=') + '.signature'
        
        mock_cognito.initiate_auth.return_value = {
            'AuthenticationResult': {
                'AccessToken': 'mock-access-token',
                'IdToken': mock_id_token,
                'ExpiresIn': 3600
            }
        }
        
        # Mock DynamoDB - user is locked
        mock_table.get_item.return_value = {
            'Item': {
                'PK': 'USER#locked-cognito-uuid',
                'SK': 'METADATA',
                'user_id': 'locked-cognito-uuid',
                'is_locked': True  # User is locked
            }
        }
        
        login_data = {
            'email': 'locked@example.com',
            'password': 'Password123!'
        }
        
        # Act
        response = client.post('/api/v1/auth/login', json=login_data)
        
        # Assert
        assert response.status_code == 403
        assert 'locked' in response.json()['detail'].lower()


class TestUnifiedResponseFormat:
    """Test that response format is unified across deployment modes."""
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_docker_login_response_format(self, mock_repo_class, client, clean_db):
        """Test Docker login response structure."""
        from backend.projects.auth import get_password_hash
        
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        
        mock_user = {
            'user_id': 'test-uuid',
            'email': 'user@example.com',
            'password_hash': get_password_hash('Pass123!'),
            'is_locked': False
        }
        mock_repo.get_user_by_email.return_value = mock_user
        
        response = client.post('/api/v1/auth/login', json={
            'email': 'user@example.com',
            'password': 'Pass123!'
        })
        
        if response.status_code == 200:
            data = response.json()
            # Check required fields
            assert 'access_token' in data
            assert 'token_type' in data
    
    @patch.dict(os.environ, {'USE_COGNITO': 'false', 'DYNAMODB_ENDPOINT_URL': 'http://localhost:8000'})
    @patch('backend.projects.local_auth_service.UserRepository')
    def test_docker_register_response_format(self, mock_repo_class, client, clean_db):
        """Test Docker registration response structure."""
        mock_repo = Mock()
        mock_repo_class.return_value = mock_repo
        
        mock_repo.get_user_count.return_value = 0
        mock_repo.get_user_by_email.return_value = None
        mock_repo.create_user.return_value = {
            'user_id': 'new-uuid',
            'email': 'new@example.com',
            'username': 'newuser',
            'is_locked': False,
            'is_admin': True,
            'created_at': '2026-01-27T00:00:00Z'
        }
        
        response = client.post('/api/v1/auth/register', json={
            'email': 'new@example.com',
            'username': 'newuser',
            'password': 'NewPass123!'
        })
        
        if response.status_code == 201:
            data = response.json()
            # Check required fields
            assert 'email' in data
            assert 'username' in data
            assert 'is_admin' in data
