"""
Integration tests for refactored authentication system (T1.1-T1.3).

Tests cover:
- Docker mode (JWT with is_approved check)
- AWS mode simulation (Cognito with custom:approved)
- User approval workflow
- Admin user detection
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import timedelta
import os

# Set to Docker mode for testing
os.environ["USE_COGNITO"] = "false"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-for-testing-only"

from backend.projects.main import app
from backend.projects.database import Base, get_db
from backend.projects.auth import create_access_token, get_password_hash
from backend.projects.models import User

# Test database
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_auth.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override database dependency
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_database():
    """Create and drop tables for each test."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


class TestDockerModeAuth:
    """Tests for Docker mode (JWT) authentication."""
    
    def test_register_first_user_becomes_admin(self):
        """First registered user should automatically become admin."""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "first@test.com",
                "username": "first_user",
                "password": "SecurePass123!"
            }
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "first@test.com"
        assert data["is_admin"] is True  # First user is admin
        assert data["is_approved"] is True  # Auto-approved in Docker mode
    
    def test_register_second_user_not_admin(self):
        """Second registered user should not be admin."""
        # Register first user
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "first@test.com",
                "username": "first_user",
                "password": "SecurePass123!"
            }
        )
        
        # Register second user
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "second@test.com",
                "username": "second_user",
                "password": "SecurePass123!"
            }
        )
        
        assert response.status_code == 201
        data = response.json()
        assert data["is_admin"] is False  # Second user is not admin
        assert data["is_approved"] is True  # Auto-approved in Docker mode
    
    def test_login_approved_user_succeeds(self):
        """Approved user should be able to login."""
        # Register user (auto-approved in Docker mode)
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "user@test.com",
                "username": "testuser",
                "password": "SecurePass123!"
            }
        )
        
        # Login
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "user@test.com",
                "password": "SecurePass123!"
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "Bearer"
    
    def test_login_unapproved_user_fails(self):
        """Unapproved user should not be able to login."""
        # Manually create unapproved user
        db = TestingSessionLocal()
        user = User(
            email="unapproved@test.com",
            username="unapproved",
            password_hash=get_password_hash("SecurePass123!"),
            is_approved=False  # Not approved
        )
        db.add(user)
        db.commit()
        db.close()
        
        # Try to login
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "unapproved@test.com",
                "password": "SecurePass123!"
            }
        )
        
        assert response.status_code == 403
        assert "pending" in response.json()["detail"].lower()
    
    def test_access_protected_endpoint_with_valid_token(self):
        """User with valid token should access protected endpoint."""
        # Register and login
        client.post(
            "/api/v1/auth/register",
            json={
                "email": "user@test.com",
                "username": "testuser",
                "password": "SecurePass123!"
            }
        )
        
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "user@test.com",
                "password": "SecurePass123!"
            }
        )
        
        token = login_response.json()["access_token"]
        
        # Access protected endpoint
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "user@test.com"
    
    def test_access_protected_endpoint_without_token_fails(self):
        """Accessing protected endpoint without token should fail."""
        response = client.get("/api/v1/auth/me")
        
        # HTTPBearer returns 401 when credentials are missing
        assert response.status_code == 401
    
    def test_access_protected_endpoint_with_invalid_token_fails(self):
        """Accessing protected endpoint with invalid token should fail."""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid-token-here"}
        )
        
        assert response.status_code == 401


class TestCognitoModeSimulation:
    """Tests simulating AWS Cognito mode behavior."""
    
    def test_decode_cognito_token_checks_custom_approved(self):
        """Cognito token should be checked for custom:approved attribute."""
        from backend.projects import auth
        from backend.projects.auth import decode_access_token
        from fastapi import HTTPException
        from jose import jwt
        
        # Temporarily enable Cognito mode by directly modifying the module variable
        original = auth.USE_COGNITO
        auth.USE_COGNITO = True
        
        try:
            # Create a fake Cognito token payload (unapproved)
            payload = {
                "sub": "cognito-user-uuid-123",
                "email": "cognito@test.com",
                "custom:approved": "false"  # Not approved
            }
            
            # Create any valid JWT token (Cognito uses get_unverified_claims, so signature doesn't matter)
            fake_token = jwt.encode(payload, "any-key", algorithm="HS256")
            
            # Try to decode - should raise 403 because custom:approved is false
            with pytest.raises(HTTPException) as exc_info:
                decode_access_token(fake_token)
            
            # Check that we get 403 (approval required)
            assert exc_info.value.status_code == 403
            assert "pending" in str(exc_info.value.detail).lower()
        
        finally:
            # Restore original mode
            auth.USE_COGNITO = original
    
    def test_decode_cognito_token_approved_succeeds(self):
        """Approved Cognito token should decode successfully."""
        from backend.projects import auth
        from backend.projects.auth import decode_access_token
        from jose import jwt
        
        # Temporarily enable Cognito mode by directly modifying the module variable
        original = auth.USE_COGNITO
        auth.USE_COGNITO = True
        
        try:
            # Create a fake Cognito token payload (approved)
            payload = {
                "sub": "cognito-user-uuid-123",
                "email": "cognito@test.com",
                "custom:approved": "true"  # Approved!
            }
            
            # Encode token (any key works since we decode without verification in Cognito mode)
            fake_token = jwt.encode(payload, "any-key", algorithm="HS256")
            
            # Decode should succeed
            token_data = decode_access_token(fake_token)
            
            assert token_data.user_id == "cognito-user-uuid-123"
            assert token_data.email == "cognito@test.com"
        
        finally:
            # Restore original mode
            auth.USE_COGNITO = original


class TestUserModel:
    """Tests for updated User model fields."""
    
    def test_user_model_has_new_fields(self):
        """User model should have is_approved, is_admin, cognito_sub fields."""
        db = TestingSessionLocal()
        
        user = User(
            email="test@test.com",
            username="testuser",
            password_hash="hashed",
            is_approved=True,
            is_admin=False,
            cognito_sub="cognito-uuid-123"
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        assert user.is_approved is True
        assert user.is_admin is False
        assert user.cognito_sub == "cognito-uuid-123"
        
        db.close()
    
    def test_user_default_values(self):
        """User should have correct default values for new fields."""
        db = TestingSessionLocal()
        
        user = User(
            email="test@test.com",
            username="testuser",
            password_hash="hashed"
        )
        
        db.add(user)
        db.commit()
        db.refresh(user)
        
        assert user.is_approved is False  # Default
        assert user.is_admin is False  # Default
        assert user.cognito_sub is None  # Default (nullable)
        
        db.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
