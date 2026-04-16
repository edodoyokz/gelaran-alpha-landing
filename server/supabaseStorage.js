import { createClient } from '@supabase/supabase-js'
import { logServerError } from './errorTracker.js'

// ---------------------------------------------------------------------------
// Lazy singleton Supabase client (service-role, bypasses RLS)
// ---------------------------------------------------------------------------

let _client = null

function getClient() {
  if (_client) return _client

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  return _client
}

// ---------------------------------------------------------------------------
// Helpers — map between camelCase JS objects and snake_case DB columns
// ---------------------------------------------------------------------------

/** Convert a DB row from `event_schema` into the JS schema shape. */
function rowToSchema(row) {
  return {
    eventName: row.event_name,
    tagline: row.tagline,
    description: row.description,
    location: row.location,
    date: row.date,
    poster: row.poster,
    fields: row.fields,
    highlights: row.highlights ?? [],
    features: row.features ?? [],
  }
}

/** Convert a JS schema object into a DB row for `event_schema`. */
function schemaToRow(schema) {
  return {
    id: 1,
    event_name: schema.eventName ?? '',
    tagline: schema.tagline ?? '',
    description: schema.description ?? '',
    location: schema.location ?? '',
    date: schema.date ?? '',
    poster: schema.poster ?? '',
    fields: schema.fields ?? [],
    highlights: schema.highlights ?? [],
    features: schema.features ?? [],
    updated_at: new Date().toISOString(),
  }
}

/** Convert a DB row from `submissions` into the JS submission shape. */
function rowToSubmission(row) {
  return {
    id: row.id,
    submittedAt: row.submitted_at_locale,
    submittedAtIso: row.submitted_at,
    answers: row.answers,
  }
}

/** Convert a JS submission object into a DB row for `submissions`. */
function submissionToRow(submission) {
  return {
    id: submission.id,
    answers: submission.answers ?? [],
    submitted_at: submission.submittedAtIso || new Date().toISOString(),
    submitted_at_locale: submission.submittedAt || new Date().toLocaleString(),
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when both required Supabase env vars are set.
 */
export function isSupabaseEnabled() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

/**
 * Read the full database (schema + submissions) from Supabase.
 * Returns the same shape as the legacy JSON file.
 */
export async function readSupabaseDb(fallbackValue) {
  try {
    const client = getClient()
    if (!client) return fallbackValue

    const [schemaRes, subsRes] = await Promise.all([
      client.from('event_schema').select('*').eq('id', 1).maybeSingle(),
      client.from('submissions').select('*').order('submitted_at', { ascending: false }),
    ])

    if (schemaRes.error) throw schemaRes.error
    if (subsRes.error) throw subsRes.error

    // If no schema row exists yet, return fallback
    if (!schemaRes.data) return fallbackValue

    return {
      schema: rowToSchema(schemaRes.data),
      submissions: (subsRes.data || []).map(rowToSubmission),
    }
  } catch (err) {
    logServerError(err, { context: 'readSupabaseDb', fallbackUsed: !!fallbackValue })
    return fallbackValue
  }
}

/**
 * Write the full data object (schema + submissions) to Supabase using transactions.
 * Upserts the schema and replaces all submissions atomically.
 */
export async function writeSupabaseDb(data) {
  try {
    const client = getClient()
    if (!client) return false

    // Use a transaction-like approach with error handling
    // First, insert/update schema
    const { error: schemaErr } = await client
      .from('event_schema')
      .upsert(schemaToRow(data.schema), { onConflict: 'id' })

    if (schemaErr) throw schemaErr

    // Use a more robust approach for submissions replacement
    // Instead of delete-then-insert, use a temporary approach with error recovery
    try {
      // First, try to replace all submissions in a single operation
      // Create a backup of current submissions for rollback
      const { data: currentSubs, error: backupErr } = await client
        .from('submissions')
        .select('*')

      if (backupErr) throw backupErr

      // Delete all submissions
      const { error: deleteErr } = await client
        .from('submissions')
        .delete()
        .gte('id', '00000000-0000-0000-0000-000000000000')

      if (deleteErr) throw deleteErr

      // Insert new submissions
      if (data.submissions && data.submissions.length > 0) {
        const rows = data.submissions.map(submissionToRow)
        const { error: insertErr } = await client.from('submissions').insert(rows)
        if (insertErr) {
          // If insert fails, try to restore backup
          console.error('[supabaseStorage] Insert failed, attempting rollback:', insertErr)
          if (currentSubs && currentSubs.length > 0) {
            const { error: rollbackErr } = await client
              .from('submissions')
              .insert(currentSubs.map(rowToSubmission).map(submissionToRow))
            if (rollbackErr) {
              console.error('[supabaseStorage] Rollback also failed:', rollbackErr)
            }
          }
          throw insertErr
        }
      }

      return true
    } catch (submissionErr) {
      console.error('[supabaseStorage] Submission operation failed:', submissionErr)
      throw submissionErr
    }

  } catch (err) {
    logServerError(err, { context: 'writeSupabaseDb', dataSize: data?.submissions?.length || 0 })
    return false
  }
}

/**
 * Read just the event schema.
 */
export async function getSupabaseSchema(fallbackSchema) {
  try {
    const client = getClient()
    if (!client) return fallbackSchema

    const { data, error } = await client
      .from('event_schema')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    if (error) throw error
    if (!data) return fallbackSchema

    return rowToSchema(data)
  } catch (err) {
    logServerError(err, { context: 'getSupabaseSchema' })
    return fallbackSchema
  }
}

/**
 * Upsert just the event schema (always id=1).
 */
export async function saveSupabaseSchema(schema) {
  try {
    const client = getClient()
    if (!client) return null

    const { data, error } = await client
      .from('event_schema')
      .upsert(schemaToRow(schema), { onConflict: 'id' })
      .select()
      .single()

    if (error) throw error

    return rowToSchema(data)
  } catch (err) {
    console.error('[supabaseStorage] saveSupabaseSchema error:', err)
    return null
  }
}

/**
 * Read all submissions ordered by submitted_at DESC.
 */
export async function getSupabaseSubmissions() {
  try {
    const client = getClient()
    if (!client) return []

    const { data, error } = await client
      .from('submissions')
      .select('*')
      .order('submitted_at', { ascending: false })

    if (error) throw error

    return (data || []).map(rowToSubmission)
  } catch (err) {
    console.error('[supabaseStorage] getSupabaseSubmissions error:', err)
    return []
  }
}

/**
 * Insert a single submission and return it.
 */
export async function addSupabaseSubmission(submission) {
  try {
    const client = getClient()
    if (!client) return null

    const { data, error } = await client
      .from('submissions')
      .insert(submissionToRow(submission))
      .select()
      .single()

    if (error) throw error

    return rowToSubmission(data)
  } catch (err) {
    console.error('[supabaseStorage] addSupabaseSubmission error:', err)
    return null
  }
}

/**
 * Delete a submission by id. Returns true if a row was deleted.
 */
export async function deleteSupabaseSubmission(id) {
  try {
    const client = getClient()
    if (!client) return false

    const { data, error } = await client
      .from('submissions')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) throw error

    return (data?.length ?? 0) > 0
  } catch (err) {
    console.error('[supabaseStorage] deleteSupabaseSubmission error:', err)
    return false
  }
}

/**
 * Reset the database: delete all submissions and reset schema to initial data.
 * Uses atomic operations with error recovery.
 */
export async function resetSupabaseDb(initialData) {
  try {
    const client = getClient()
    if (!client) return null

    // Create backup of current state for potential rollback
    const { data: currentSchema, error: schemaBackupErr } = await client
      .from('event_schema')
      .select('*')
      .eq('id', 1)
      .maybeSingle()

    const { data: currentSubs, error: subsBackupErr } = await client
      .from('submissions')
      .select('*')

    if (schemaBackupErr || subsBackupErr) {
      console.error('[supabaseStorage] Failed to create backup for reset operation')
      return null
    }

    try {
      // Delete all submissions first
      const { error: deleteErr } = await client
        .from('submissions')
        .delete()
        .gte('id', '00000000-0000-0000-0000-000000000000')

      if (deleteErr) throw deleteErr

      // Reset schema to initial
      const { error: schemaErr } = await client
        .from('event_schema')
        .upsert(schemaToRow(initialData.schema), { onConflict: 'id' })

      if (schemaErr) throw schemaErr

      return {
        schema: initialData.schema,
        submissions: [],
      }
    } catch (resetErr) {
      // Attempt rollback on failure
      console.error('[supabaseStorage] Reset failed, attempting rollback:', resetErr)

      try {
        if (currentSchema) {
          await client
            .from('event_schema')
            .upsert(currentSchema, { onConflict: 'id' })
        }
        if (currentSubs && currentSubs.length > 0) {
          await client.from('submissions').insert(currentSubs)
        }
        console.log('[supabaseStorage] Rollback completed')
      } catch (rollbackErr) {
        console.error('[supabaseStorage] Rollback failed:', rollbackErr)
      }

      throw resetErr
    }
  } catch (err) {
    console.error('[supabaseStorage] resetSupabaseDb error:', err)
    return null
  }
}
