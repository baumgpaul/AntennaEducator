"""
Apply database migration: Add requested_fields column to projects table.
Run this script to update your PostgreSQL database schema.
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text, inspect
from database import engine
from models import Base, Project, User, ProjectElement, Result

def apply_migration():
    """Apply the requested_fields column migration."""
    
    print("Checking database status...")
    print(f"Database URL: {os.getenv('DATABASE_URL', 'Not set (using default)')}")
    
    # Check if tables exist
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    
    if 'projects' not in tables:
        print("⚠️  Projects table doesn't exist yet. Creating all tables...")
        Base.metadata.create_all(bind=engine)
        print("✅ All tables created successfully (including requested_fields column)!")
        return
    
    # Check if requested_fields column already exists
    columns = [col['name'] for col in inspector.get_columns('projects')]
    if 'requested_fields' in columns:
        print("✅ requested_fields column already exists. No migration needed.")
        return
    
    # Apply migration for PostgreSQL
    migration_sql = """
    ALTER TABLE projects ADD COLUMN requested_fields JSONB;
    COMMENT ON COLUMN projects.requested_fields IS 'JSON array of field definitions for solver';
    CREATE INDEX idx_projects_requested_fields ON projects USING GIN (requested_fields);
    """
    
    # Apply migration for SQLite (simpler version)
    migration_sql_sqlite = """
    ALTER TABLE projects ADD COLUMN requested_fields TEXT;
    """
    
    print("Applying database migration: add requested_fields column...")
    
    try:
        with engine.connect() as connection:
            # Determine if we're using PostgreSQL or SQLite
            if 'postgresql' in str(engine.url):
                connection.execute(text(migration_sql))
            else:
                connection.execute(text(migration_sql_sqlite))
            connection.commit()
            
        print("✅ Migration applied successfully!")
        print("   - Added 'requested_fields' column to projects table")
        
    except Exception as e:
        print(f"❌ Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    apply_migration()
