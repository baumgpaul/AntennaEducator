"""Pytest fixtures and configuration for Projects API tests."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

# Set test database URL before importing anything
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import Base, get_db, engine
from main import app
from models import User, Project, ProjectElement, Result
from auth import get_password_hash

# Test database session
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test."""
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Create session
    session = TestingSessionLocal()
    
    try:
        yield session
    finally:
        session.close()
        # Drop all tables after test
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with overridden database dependency."""
    
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session):
    """Create a test user."""
    user = User(
        email="test@example.com",
        password_hash=get_password_hash("testpass123")  # Shorter password
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def test_user2(db_session):
    """Create a second test user."""
    user = User(
        email="test2@example.com",
        password_hash=get_password_hash("testpass456")  # Shorter password
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, test_user):
    """Get authentication headers for test user."""
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@example.com",
            "password": "testpass123"  # Match shorter password
        }
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers2(client, test_user2):
    """Get authentication headers for second test user."""
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "test2@example.com",
            "password": "testpass456"  # Match shorter password
        }
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_project(db_session, test_user):
    """Create a test project."""
    project = Project(
        user_id=test_user.id,
        name="Test Antenna Project",
        description="A test project for antenna simulation"
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


@pytest.fixture
def test_element(db_session, test_project):
    """Create a test project element."""
    element = ProjectElement(
        project_id=test_project.id,
        element_name="dipole",
        config_json='{"length": 1.0, "frequency": 100e6}'
    )
    db_session.add(element)
    db_session.commit()
    db_session.refresh(element)
    return element


@pytest.fixture
def test_result(db_session, test_project):
    """Create a test result."""
    result = Result(
        project_id=test_project.id,
        frequency=100e6,
        currents_s3_key="test/currents.json",
        mesh_s3_key="test/mesh.json"
    )
    db_session.add(result)
    db_session.commit()
    db_session.refresh(result)
    return result
