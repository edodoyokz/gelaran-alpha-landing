-- Migration: Add payment status tracking to submissions table
-- Created: 2026-04-21
-- Description: Adds payment_status and payment_confirmed_at columns to track participant payment status

-- Add payment_status column with default value 'registered'
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'registered' CHECK (payment_status IN ('registered', 'paid'));

-- Add payment_confirmed_at column to track when payment was confirmed
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ;

-- Create index on payment_status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_submissions_payment_status ON submissions(payment_status);

-- Update existing rows to have default payment_status if NULL
UPDATE submissions 
SET payment_status = 'registered' 
WHERE payment_status IS NULL;

-- Add comment to document the columns
COMMENT ON COLUMN submissions.payment_status IS 'Payment status: registered (default) or paid';
COMMENT ON COLUMN submissions.payment_confirmed_at IS 'Timestamp when payment was confirmed by admin';
