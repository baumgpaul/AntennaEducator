-- Add requested_fields column to projects table
-- Migration: Add support for field definitions persistence
-- Date: 2025-12-31

ALTER TABLE projects ADD COLUMN IF NOT EXISTS requested_fields JSONB;

-- Add comment for documentation
COMMENT ON COLUMN projects.requested_fields IS 'JSON array of field definitions for solver (shapes, dimensions, sampling, etc.)';

-- Create index for better JSON query performance (optional, but recommended)
CREATE INDEX IF NOT EXISTS idx_projects_requested_fields ON projects USING GIN (requested_fields);
