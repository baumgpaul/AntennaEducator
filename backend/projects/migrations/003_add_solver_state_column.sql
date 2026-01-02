-- Migration: Add solver_state column to projects table
-- Date: 2026-01-02
-- Description: Adds JSONB column for storing solver results, state, and field data

-- Add solver_state column (nullable for backward compatibility)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS solver_state JSONB;

-- Add comment for documentation
COMMENT ON COLUMN projects.solver_state IS 'JSON object containing solver results, workflow state, field data, and computation history';

-- Create index for faster JSON queries (optional, useful for large datasets)
CREATE INDEX IF NOT EXISTS idx_projects_solver_state ON projects USING GIN (solver_state);

-- Verify migration
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'projects' AND column_name = 'solver_state';
