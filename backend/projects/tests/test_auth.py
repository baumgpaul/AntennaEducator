"""Tests for authentication endpoints."""

import pytest
from jose import jwt
from auth import SECRET_KEY, ALGORITHM


class TestUserRegistration:
    """Test user registration functionality."""
    
    def test_register_new_user(self, client):
        """Test successful user registration."""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "securepassword123"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert "id" in data
        assert "created_at" in data
        assert "password" not in data
        assert "password_hash" not in data
    
    def test_register_duplicate_email(self, client, test_user):
        """Test registration with existing email fails."""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "test@example.com",
                "password": "anotherpassword123"
            }
        )
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()
    
    def test_register_invalid_email(self, client):
        """Test registration with invalid email fails."""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "not-an-email",
                "password": "securepassword123"
            }
        )
        assert response.status_code == 422
    
    def test_register_short_password(self, client):
        """Test registration with short password fails."""
        response = client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "short"
            }
        )
        assert response.status_code == 422


class TestUserLogin:
    """Test user login functionality."""
    
    def test_login_success(self, client, test_user):
        """Test successful login."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "password": "testpass123"  # Match fixture
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 3600
        
        # Verify token is valid JWT
        token = data["access_token"]
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["email"] == "test@example.com"
        assert int(payload["sub"]) == test_user.id  # sub is stored as string
    
    def test_login_wrong_password(self, client, test_user):
        """Test login with wrong password fails."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()
    
    def test_login_nonexistent_user(self, client):
        """Test login with non-existent email fails."""
        response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "nonexistent@example.com",
                "password": "anypassword123"
            }
        )
        assert response.status_code == 401


class TestGetCurrentUser:
    """Test getting current user information."""
    
    def test_get_current_user_success(self, client, auth_headers, test_user):
        """Test getting current user with valid token."""
        response = client.get(
            "/api/v1/auth/me",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["id"] == test_user.id
    
    def test_get_current_user_no_token(self, client):
        """Test getting current user without token fails."""
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 401
    
    def test_get_current_user_invalid_token(self, client):
        """Test getting current user with invalid token fails."""
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 401
    
    def test_get_current_user_expired_token(self, client, test_user):
        """Test getting current user with expired token fails."""
        # Create an expired token
        from datetime import datetime, timedelta
        from auth import create_access_token
        
        expired_token = create_access_token(
            data={"sub": str(test_user.id), "email": test_user.email},  # Convert to string
            expires_delta=timedelta(seconds=-1)  # Already expired
        )
        
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert response.status_code == 401


class TestPasswordSecurity:
    """Test password hashing and security."""
    
    def test_password_not_stored_plaintext(self, db_session, test_user):
        """Test that passwords are hashed, not stored in plaintext."""
        # Verify password hash is not the same as plaintext
        assert test_user.password_hash != "testpass123"
        # Verify it's a bcrypt hash (starts with $2b$)
        assert test_user.password_hash.startswith("$2b$")
    
    def test_password_verification(self, test_user):
        """Test password verification function."""
        from auth import verify_password
        
        # Correct password should verify
        assert verify_password("testpass123", test_user.password_hash)
        
        # Wrong password should not verify
        assert not verify_password("wrongpassword", test_user.password_hash)
