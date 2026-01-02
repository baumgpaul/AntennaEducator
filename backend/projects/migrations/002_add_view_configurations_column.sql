-- Migration: Add view_configurations column to projects table
-- Date: 2026-01-02
-- Description: Adds JSONB column for storing postprocessing view configurations

-- Add view_configurations column (nullable for backward compatibility)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS view_configurations JSONB;

-- Add comment for documentation
COMMENT ON COLUMN projects.view_configurations IS 'JSON array of view configurations for postprocessing tab (max 10 views per project)';

-- Create index for faster JSON queries (optional, useful for large datasets)
CREATE INDEX IF NOT EXISTS idx_projects_view_configurations ON projects USING GIN (view_configurations);

-- Verify migration
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'projects' AND column_name = 'view_configurations';
