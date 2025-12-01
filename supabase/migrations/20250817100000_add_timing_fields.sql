-- Add missing timing fields to completion_history table
-- These fields track actual task duration and timing mode

ALTER TABLE completion_history 
ADD COLUMN IF NOT EXISTS actual_duration INTEGER,
ADD COLUMN IF NOT EXISTS is_forward_timed BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN completion_history.actual_duration IS 'Actual time spent on task in minutes';
COMMENT ON COLUMN completion_history.is_forward_timed IS 'Whether task used forward timing mode';