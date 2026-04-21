-- Migration: Add check-in fields to submissions table
-- This migration adds support for gate scanner check-in functionality

-- Add check_in_status column with default value
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS check_in_status TEXT NOT NULL DEFAULT 'not_checked_in';

-- Add checked_in_at timestamp column
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ NULL;

-- Add check constraint for valid check-in status values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'submissions_check_in_status_check'
  ) THEN
    ALTER TABLE submissions 
    ADD CONSTRAINT submissions_check_in_status_check 
    CHECK (check_in_status IN ('not_checked_in', 'checked_in'));
  END IF;
END $$;

-- Create index on check_in_status for filtering
CREATE INDEX IF NOT EXISTS idx_submissions_check_in_status 
ON submissions(check_in_status);

-- Create index on voucher_code for scanner lookup performance
CREATE INDEX IF NOT EXISTS idx_submissions_voucher_code 
ON submissions(voucher_code);

-- Add comment for documentation
COMMENT ON COLUMN submissions.check_in_status IS 'Check-in status: not_checked_in or checked_in';
COMMENT ON COLUMN submissions.checked_in_at IS 'Timestamp when participant checked in at gate';
