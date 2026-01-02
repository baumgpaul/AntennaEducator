"""
Migration script: Add solver_state column to projects table
Date: 2026-01-02
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from backend.projects.database import engine, Base
from sqlalchemy import Column, JSON, inspect, text


def apply_migration():
    """Apply migration to add solver_state column."""
    print("Starting migration: add solver_state column")
    
    # Check if column already exists
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('projects')]
    
    if 'solver_state' in columns:
        print("✓ Column 'solver_state' already exists. Skipping migration.")
        return
    
    # Add column using raw SQL (works for both PostgreSQL and SQLite)
    with engine.connect() as conn:
        try:
            # SQLite uses TEXT for JSON, PostgreSQL uses JSONB
            dialect = engine.dialect.name
            
            if dialect == 'postgresql':
                sql = "ALTER TABLE projects ADD COLUMN solver_state JSONB;"
                print("Adding column with JSONB type (PostgreSQL)")
            else:
                sql = "ALTER TABLE projects ADD COLUMN solver_state TEXT;"
                print("Adding column with TEXT type (SQLite)")
            
            conn.execute(text(sql))
            conn.commit()
            
            print("✓ Migration applied successfully!")
            
            # Verify
            inspector = inspect(engine)
            columns = [col['name'] for col in inspector.get_columns('projects')]
            
            if 'solver_state' in columns:
                print("✓ Verified: Column 'solver_state' exists")
            else:
                print("✗ Error: Column was not created")
                
        except Exception as e:
            print(f"✗ Migration failed: {e}")
            conn.rollback()
            raise


if __name__ == "__main__":
    apply_migration()
    print("\nMigration complete!")
