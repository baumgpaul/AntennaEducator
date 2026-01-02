"""
Migration script: Add view_configurations column to projects table
Date: 2026-01-02
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from backend.projects.database import engine, Base
from sqlalchemy import Column, JSON, inspect, text


def apply_migration():
    """Apply migration to add view_configurations column."""
    print("Starting migration: add view_configurations column")
    
    # Check if column already exists
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('projects')]
    
    if 'view_configurations' in columns:
        print("✓ Column 'view_configurations' already exists. Skipping migration.")
        return
    
    # Add column using raw SQL (works for both PostgreSQL and SQLite)
    with engine.connect() as conn:
        try:
            # SQLite uses TEXT for JSON, PostgreSQL uses JSONB
            dialect = engine.dialect.name
            
            if dialect == 'postgresql':
                sql = "ALTER TABLE projects ADD COLUMN view_configurations JSONB;"
                print("Adding column with JSONB type (PostgreSQL)")
            else:
                sql = "ALTER TABLE projects ADD COLUMN view_configurations TEXT;"
                print("Adding column with TEXT type (SQLite)")
            
            conn.execute(text(sql))
            conn.commit()
            
            print("✓ Migration applied successfully!")
            
            # Verify
            inspector = inspect(engine)
            columns = [col['name'] for col in inspector.get_columns('projects')]
            
            if 'view_configurations' in columns:
                print("✓ Verified: Column 'view_configurations' exists")
            else:
                print("✗ Error: Column was not created")
                
        except Exception as e:
            print(f"✗ Migration failed: {e}")
            conn.rollback()
            raise


if __name__ == "__main__":
    apply_migration()
