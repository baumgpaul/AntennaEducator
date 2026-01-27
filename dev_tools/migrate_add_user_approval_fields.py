"""
Database migration: Add approval and admin fields to User table

Adds the following columns:
- is_approved: Boolean (default False) - for admin approval workflow
- is_admin: Boolean (default False) - identifies admin users
- cognito_sub: String (nullable, unique) - AWS Cognito user ID

Usage:
    python -m dev_tools.migrate_add_user_approval_fields
"""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import logging

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_migration():
    """Add approval and admin fields to users table."""
    
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL", "postgresql://antenna_user:antenna_pass@localhost:5432/antenna_db")
    
    logger.info(f"Connecting to database...")
    engine = create_engine(database_url)
    
    with engine.connect() as conn:
        try:
            # Check if columns already exist
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='users' AND column_name IN ('is_approved', 'is_admin', 'cognito_sub')
            """))
            existing_columns = [row[0] for row in result]
            
            if 'is_approved' in existing_columns:
                logger.info("Column 'is_approved' already exists, skipping...")
            else:
                logger.info("Adding column 'is_approved'...")
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT FALSE
                """))
                conn.commit()
                logger.info("✓ Added is_approved column")
            
            if 'is_admin' in existing_columns:
                logger.info("Column 'is_admin' already exists, skipping...")
            else:
                logger.info("Adding column 'is_admin'...")
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE
                """))
                conn.commit()
                logger.info("✓ Added is_admin column")
            
            if 'cognito_sub' in existing_columns:
                logger.info("Column 'cognito_sub' already exists, skipping...")
            else:
                logger.info("Adding column 'cognito_sub'...")
                conn.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN cognito_sub VARCHAR(255) UNIQUE
                """))
                conn.commit()
                logger.info("✓ Added cognito_sub column")
            
            # Auto-approve all existing users (backwards compatibility)
            logger.info("Auto-approving existing users...")
            result = conn.execute(text("""
                UPDATE users 
                SET is_approved = TRUE 
                WHERE is_approved = FALSE
            """))
            conn.commit()
            logger.info(f"✓ Auto-approved {result.rowcount} existing users")
            
            # Make first user (by ID) an admin if no admin exists
            logger.info("Checking for admin users...")
            result = conn.execute(text("SELECT COUNT(*) FROM users WHERE is_admin = TRUE"))
            admin_count = result.fetchone()[0]
            
            if admin_count == 0:
                result = conn.execute(text("""
                    UPDATE users 
                    SET is_admin = TRUE 
                    WHERE id = (SELECT MIN(id) FROM users)
                """))
                conn.commit()
                if result.rowcount > 0:
                    logger.info(f"✓ Made first user an admin")
                else:
                    logger.info("No users in database yet")
            else:
                logger.info(f"Admin users already exist ({admin_count} admins)")
            
            logger.info("\n" + "="*60)
            logger.info("Migration completed successfully!")
            logger.info("="*60)
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise


if __name__ == "__main__":
    run_migration()
