import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Lazy singleton Supabase client (service-role, bypasses RLS)
// ---------------------------------------------------------------------------

let _client = null

function getClient() {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
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
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
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
    console.error('[supabaseStorage] readSupabaseDb error:', err)
    return fallbackValue
  }
}

/**
 * Write the full data object (schema + submissions) to Supabase.
 * Upserts the schema and replaces all submissions.
 */
export async function writeSupabaseDb(data) {
  try {
    const client = getClient()
    if (!client) return false

    // Upsert schema
    const { error: schemaErr } = await client
      .from('event_schema')
      .upsert(schemaToRow(data.schema), { onConflict: 'id' })

    if (schemaErr) throw schemaErr

    // Replace all submissions: delete existing, then insert new
    const { error: deleteErr } = await client
      .from('submissions')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000') // match all rows

    if (deleteErr) throw deleteErr

    if (data.submissions && data.submissions.length > 0) {
      const rows = data.submissions.map(submissionToRow)
      const { error: insertErr } = await client.from('submissions').insert(rows)
      if (insertErr) throw insertErr
    }

    return true
  } catch (err) {
    console.error('[supabaseStorage] writeSupabaseDb error:', err)
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
    console.error('[supabaseStorage] getSupabaseSchema error:', err)
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
 */
export async function resetSupabaseDb(initialData) {
  try {
    const client = getClient()
    if (!client) return null

    // Delete all submissions
    const { error: deleteErr } = await client
      .from('submissions')
      .delete()
      .gte('id', '00000000-0000-0000-0000-000000000000')

    if (deleteErr) throw deleteErr

    // Upsert schema to initial
    const { error: schemaErr } = await client
      .from('event_schema')
      .upsert(schemaToRow(initialData.schema), { onConflict: 'id' })

    if (schemaErr) throw schemaErr

    return {
      schema: initialData.schema,
      submissions: [],
    }
  } catch (err) {
    console.error('[supabaseStorage] resetSupabaseDb error:', err)
    return null
  }
}
