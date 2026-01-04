"""Database configuration and session management."""

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError, SQLAlchemyError
import os
import logging

logger = logging.getLogger(__name__)

# Get database URL from environment variable
# Default to SQLite for development if no DATABASE_URL is set and no PostgreSQL is available
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./projects.db"  # Use SQLite by default for development
)

# Create SQLAlchemy engine (don't connect yet)
# Skip engine creation if using DynamoDB (for Lambda with DISABLE_AUTH=true)
USE_DYNAMODB = os.getenv("USE_DYNAMODB", "false").lower() == "true"

if USE_DYNAMODB and os.getenv("DISABLE_AUTH", "false").lower() == "true":
    # In Lambda with DynamoDB, we don't need SQLAlchemy
    # Create dummy objects to avoid import errors
    engine = None
    SessionLocal = None
    Base = declarative_base()
    logger.info("Skipping SQLAlchemy engine creation (USE_DYNAMODB=true, DISABLE_AUTH=true)")
else:
    # Normal operation: create engine for SQLite/PostgreSQL
    connect_args = {}
    if "sqlite" in DATABASE_URL:
        connect_args = {"check_same_thread": False}
    elif "postgresql" in DATABASE_URL:
        connect_args = {"connect_timeout": 10}

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        connect_args=connect_args
    )

    # Create SessionLocal class for database sessions
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Create Base class for declarative models
    Base = declarative_base()


def get_db():
    """
    Dependency function to get database session.
    
    Yields:
        Database session that automatically closes after use.
        
    Raises:
        OperationalError: If database connection fails
        SQLAlchemyError: For other database errors
    """
    if SessionLocal is None:
        # In DynamoDB mode with auth disabled, auth endpoints won't be called
        # If they are called, raise an error
        raise RuntimeError("SQLAlchemy database not available (USE_DYNAMODB=true, DISABLE_AUTH=true)")
    
    db = SessionLocal()
    try:
        # Test connection
        db.execute(text("SELECT 1"))
        yield db
    except OperationalError as e:
        logger.error(f"Database connection failed: {e}")
        db.rollback()
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    finally:
        db.close()
