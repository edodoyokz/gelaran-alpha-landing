-- Migration: Add voucher fields to submissions table
-- Description: Adds voucher code, QR code, and timestamp fields for e-voucher functionality
-- Safe to run: Yes - uses IF NOT EXISTS and handles existing data gracefully
-- Date: 2026-04-21

-- Add voucher_code column (unique identifier for each participant's voucher)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS voucher_code TEXT UNIQUE;

-- Add voucher_sent_at column (timestamp when e-voucher was first sent)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS voucher_sent_at TIMESTAMPTZ;

-- Add voucher_last_sent_at column (timestamp when e-voucher was last resent)
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS voucher_last_sent_at TIMESTAMPTZ;

-- Create index on voucher_code for faster lookups
CREATE INDEX IF NOT EXISTS idx_submissions_voucher_code 
ON submissions(voucher_code) 
WHERE voucher_code IS NOT NULL;

-- Add comment to document the columns
COMMENT ON COLUMN submissions.voucher_code IS 'Unique 12-character voucher code generated when payment is confirmed';
COMMENT ON COLUMN submissions.voucher_sent_at IS 'Timestamp when e-voucher email was first sent to participant';
COMMENT ON COLUMN submissions.voucher_last_sent_at IS 'Timestamp when e-voucher email was last resent (for tracking resends)';
