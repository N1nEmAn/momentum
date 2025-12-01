-- Add description and notes columns to completion_history table
-- These columns store task completion descriptions and user notes

ALTER TABLE completion_history 
ADD COLUMN description TEXT,
ADD COLUMN notes TEXT;

-- Add comments for documentation
COMMENT ON COLUMN completion_history.description IS 'Task completion description entered by user';
COMMENT ON COLUMN completion_history.notes IS 'Additional notes/comments entered by user';