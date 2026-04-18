-- =============================================================================
-- Supabase Migration: Event Registration Webapp
-- =============================================================================
-- Migrates from JSON file storage to Supabase PostgreSQL.
-- Run this migration once against your Supabase project database.
-- Uses IF NOT EXISTS / OR REPLACE where possible for idempotency.
-- =============================================================================


-- =============================================================================
-- 1. EVENT_SCHEMA TABLE
-- Stores the event configuration as a singleton row (id is always 1).
-- The CHECK constraint ensures only one configuration row can ever exist.
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_schema (
    id          integer      PRIMARY KEY DEFAULT 1,
    event_name  text         NOT NULL DEFAULT '',
    tagline     text         NOT NULL DEFAULT '',
    description text         NOT NULL DEFAULT '',
    location    text         NOT NULL DEFAULT '',
    date        text         NOT NULL DEFAULT '',
    poster      text         NOT NULL DEFAULT '',
    fields      jsonb        NOT NULL DEFAULT '[]'::jsonb,
    highlights  jsonb        NOT NULL DEFAULT '[]'::jsonb,
    features    jsonb        NOT NULL DEFAULT '[]'::jsonb,
    email_config jsonb       DEFAULT NULL,
    updated_at  timestamptz  NOT NULL DEFAULT now(),

    -- Singleton constraint: only id = 1 is allowed
    CONSTRAINT event_schema_singleton CHECK (id = 1)
);

-- Seed with the default event data (same as previously stored in Google Drive)
INSERT INTO event_schema (
    id, event_name, tagline, description, location, date, poster, fields
) VALUES (
    1,
    'City Marathon 2026',
    'Run For The Win! Join the biggest marathon event this year.',
    'Bersiaplah untuk memacu adrenalin di City Marathon 2026. Taklukan tantangan, cetak rekor pribadi, dan rasakan euforia lari bersama ribuan pelari lainnya di lintasan ikonik jantung kota.',
    'City Center Start/Finish',
    '19 Oktober 2026',
    '/new_running_poster.png',
    '[
      {"id": "full-name",   "label": "Nama Lengkap",            "type": "text",     "required": true,  "placeholder": "Masukkan nama lengkap",        "options": ""},
      {"id": "email",       "label": "Email",                    "type": "email",    "required": true,  "placeholder": "nama@email.com",               "options": ""},
      {"id": "phone",       "label": "Nomor WhatsApp",           "type": "tel",      "required": true,  "placeholder": "08xxxxxxxxxx",                 "options": ""},
      {"id": "category",    "label": "Kategori Peserta",         "type": "select",   "required": true,  "placeholder": "",                             "options": "Pelajar, Mahasiswa, Umum, Komunitas"},
      {"id": "motivation",  "label": "Motivasi Mengikuti Event", "type": "textarea", "required": false, "placeholder": "Ceritakan singkat alasan Anda", "options": ""}
    ]'::jsonb
) ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- 2. SUBMISSIONS TABLE
-- Stores individual event registrations. Each row holds the form answers
-- as a JSONB array and timestamps for when the submission was made.
-- =============================================================================

CREATE TABLE IF NOT EXISTS submissions (
    id                   uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    answers              jsonb        NOT NULL DEFAULT '[]'::jsonb,
    submitted_at         timestamptz  NOT NULL DEFAULT now(),
    submitted_at_locale  text         NOT NULL DEFAULT ''
);


-- =============================================================================
-- 3. INDEXES
-- Index on submitted_at for efficient sorting of registrations by date.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at
    ON submissions (submitted_at DESC);


-- =============================================================================
-- 4. AUTO-UPDATE TRIGGER FOR event_schema.updated_at
-- Automatically sets updated_at to now() whenever the event_schema row
-- is modified, so the application always knows when config last changed.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_event_schema_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate the trigger to ensure idempotency
DROP TRIGGER IF EXISTS trg_event_schema_updated_at ON event_schema;

CREATE TRIGGER trg_event_schema_updated_at
    BEFORE UPDATE ON event_schema
    FOR EACH ROW
    EXECUTE FUNCTION update_event_schema_updated_at();


-- =============================================================================
-- 5. ROW LEVEL SECURITY (RLS)
-- RLS is enabled on both tables. Policies are configured so that:
--   - The service_role (used by the server) has full access to everything.
--   - Anonymous users can only SELECT from event_schema (public read for
--     displaying event info on the landing page).
-- =============================================================================

-- Enable RLS on both tables
ALTER TABLE event_schema ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- event_schema policies
-- ---------------------------------------------------------------------------

-- Service role: full access (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Service role full access on event_schema" ON event_schema;
CREATE POLICY "Service role full access on event_schema"
    ON event_schema
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Anonymous users: read-only access (public event info)
DROP POLICY IF EXISTS "Anon read access on event_schema" ON event_schema;
CREATE POLICY "Anon read access on event_schema"
    ON event_schema
    FOR SELECT
    TO anon
    USING (true);

-- ---------------------------------------------------------------------------
-- submissions policies
-- ---------------------------------------------------------------------------

-- Service role: full access (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Service role full access on submissions" ON submissions;
CREATE POLICY "Service role full access on submissions"
    ON submissions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
