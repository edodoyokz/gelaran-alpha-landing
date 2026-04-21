import fs from 'node:fs'
import path from 'node:path'
import { defaultSchema } from './defaultSchema.js'
import { generateVoucherCode } from './voucherService.js'
import {
  isSupabaseEnabled,
  getSupabaseSchema,
  saveSupabaseSchema,
  getSupabaseSubmissions,
  addSupabaseSubmission,
  deleteSupabaseSubmission,
  resetSupabaseDb,
  checkSupabaseDuplicate,
} from './supabaseStorage.js'

const dataDir = path.resolve('data')
const dbPath = path.join(dataDir, 'db.json')

function getInitialData() {
  return {
    schema: defaultSchema,
    submissions: [],
  }
}

function ensureLocalDb() {
  fs.mkdirSync(dataDir, { recursive: true })

  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify(getInitialData(), null, 2))
  }
}

function readLocalDb() {
  ensureLocalDb()
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
}

function writeLocalDb(data) {
  ensureLocalDb()
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
}

/**
 * Normalize submission to ensure payment status fields exist
 * Provides backward compatibility for submissions without payment status
 */
export function normalizeSubmission(submission) {
  return {
    ...submission,
    paymentStatus: submission.paymentStatus || 'registered',
    paymentConfirmedAt: submission.paymentConfirmedAt || null,
    voucherCode: submission.voucherCode || null,
    voucherSentAt: submission.voucherSentAt || null,
    voucherLastSentAt: submission.voucherLastSentAt || null,
  }
}

export async function getSchema() {
  if (isSupabaseEnabled()) {
    return getSupabaseSchema(defaultSchema)
  }

  return readLocalDb().schema
}

export async function saveSchema(schema) {
  if (isSupabaseEnabled()) {
    return saveSupabaseSchema(schema)
  }

  const data = readLocalDb()
  data.schema = schema
  writeLocalDb(data)
  return data.schema
}

export async function getSubmissions() {
  if (isSupabaseEnabled()) {
    const submissions = await getSupabaseSubmissions()
    return submissions.map(normalizeSubmission)
  }

  const submissions = readLocalDb().submissions
  return submissions.map(normalizeSubmission)
}

export async function addSubmission(submission) {
  const normalized = normalizeSubmission(submission)
  
  if (isSupabaseEnabled()) {
    return addSupabaseSubmission(normalized)
  }

  const data = readLocalDb()
  data.submissions.unshift(normalized)
  writeLocalDb(data)
  return normalized
}

export async function deleteSubmission(submissionId) {
  if (isSupabaseEnabled()) {
    return deleteSupabaseSubmission(submissionId)
  }

  const data = readLocalDb()
  const nextSubmissions = data.submissions.filter(
    (submission) => submission.id !== submissionId,
  )

  const deleted = nextSubmissions.length !== data.submissions.length
  data.submissions = nextSubmissions
  writeLocalDb(data)

  return deleted
}

export async function updateSubmissionPaymentStatus(submissionId, paymentStatus) {
  if (isSupabaseEnabled()) {
    const { updateSupabaseSubmissionPaymentStatus } = await import('./supabaseStorage.js')
    return updateSupabaseSubmissionPaymentStatus(submissionId, paymentStatus)
  }

  const data = readLocalDb()
  const submission = data.submissions.find((s) => s.id === submissionId)
  
  if (!submission) {
    return null
  }

  submission.paymentStatus = paymentStatus
  submission.paymentConfirmedAt = paymentStatus === 'paid' ? new Date().toISOString() : null
  
  // Generate voucher code when status changes to paid
  if (paymentStatus === 'paid' && !submission.voucherCode) {
    submission.voucherCode = generateVoucherCode(submissionId)
  }
  
  writeLocalDb(data)
  return normalizeSubmission(submission)
}

export async function updateSubmissionVoucherSent(submissionId) {
  if (isSupabaseEnabled()) {
    const { updateSupabaseSubmissionVoucherSent } = await import('./supabaseStorage.js')
    return updateSupabaseSubmissionVoucherSent(submissionId)
  }

  const data = readLocalDb()
  const submission = data.submissions.find((s) => s.id === submissionId)
  
  if (!submission) {
    return null
  }

  const now = new Date().toISOString()
  if (!submission.voucherSentAt) {
    submission.voucherSentAt = now
  }
  submission.voucherLastSentAt = now
  
  writeLocalDb(data)
  return normalizeSubmission(submission)
}

export async function resetDb() {
  if (isSupabaseEnabled()) {
    return resetSupabaseDb(getInitialData())
  }

  const data = getInitialData()
  writeLocalDb(data)
  return data
}

export function getStorageMode() {
  return isSupabaseEnabled() ? 'supabase' : 'local-file'
}

export async function getEmailConfig() {
  const schema = await getSchema()
  return schema.emailConfig || defaultSchema.emailConfig
}

export async function saveEmailConfig(emailConfig) {
  const schema = await getSchema()
  schema.emailConfig = emailConfig
  const savedSchema = await saveSchema(schema)
  
  if (!savedSchema) {
    console.error('[store] Failed to save email config - saveSchema returned null')
    throw new Error('Failed to persist email configuration')
  }
  
  // Verify persistence by reading back
  const verifySchema = await getSchema()
  if (!verifySchema.emailConfig) {
    console.error('[store] Email config not persisted after save')
    throw new Error('Email configuration was not persisted')
  }
  
  console.log('[store] Email config saved and verified successfully')
  return emailConfig
}

/**
 * Normalize email for duplicate detection
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

/**
 * Normalize phone number for duplicate detection
 * Removes spaces, dashes, parentheses, and other common formatting
 */
export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return ''
  return phone.replace(/[\s\-()]/g, '')
}

/**
 * Extract identity fields (email and phone) from submission answers
 * Uses both field ID (stable) and label (fallback) for robustness
 * Returns normalized values for duplicate detection
 */
export function extractIdentity(submission) {
  const answers = submission.answers || []
  
  // Try to find by common field IDs first (stable identifier)
  let emailAnswer = answers.find(a => a.id === 'email')
  let phoneAnswer = answers.find(a => a.id === 'phone' || a.id === 'whatsapp')
  
  // Fallback to label-based detection if field ID not found
  if (!emailAnswer) {
    emailAnswer = answers.find(a => 
      a.label && (a.label.toLowerCase().includes('email') || a.label === 'Email')
    )
  }
  
  if (!phoneAnswer) {
    phoneAnswer = answers.find(a => 
      a.label && (
        a.label.toLowerCase().includes('whatsapp') || 
        a.label.toLowerCase().includes('phone') ||
        a.label === 'Nomor WhatsApp'
      )
    )
  }
  
  return {
    email: emailAnswer ? normalizeEmail(emailAnswer.value) : '',
    phone: phoneAnswer ? normalizePhone(phoneAnswer.value) : '',
  }
}

/**
 * Find duplicate submission based on email or phone
 * Returns { field: 'email' | 'phone', submission } if duplicate found, null otherwise
 */
export function findDuplicateSubmission(existingSubmissions, newSubmission) {
  const newIdentity = extractIdentity(newSubmission)
  
  if (!newIdentity.email && !newIdentity.phone) {
    return null
  }
  
  for (const existing of existingSubmissions) {
    const existingIdentity = extractIdentity(existing)
    
    // Check email match
    if (newIdentity.email && existingIdentity.email && 
        newIdentity.email === existingIdentity.email) {
      return { field: 'email', submission: existing }
    }
    
    // Check phone match
    if (newIdentity.phone && existingIdentity.phone && 
        newIdentity.phone === existingIdentity.phone) {
      return { field: 'phone', submission: existing }
    }
  }
  
  return null
}

/**
 * Check for duplicate submission before adding
 * Routes to appropriate storage backend (Supabase or local file)
 * Throws error if duplicate check fails (fail-closed for safety)
 */
export async function checkDuplicateSubmission(newSubmission) {
  try {
    if (isSupabaseEnabled()) {
      // Use Supabase-specific duplicate check for better performance
      return await checkSupabaseDuplicate(newSubmission)
    } else {
      // Use local file-based duplicate check
      const existingSubmissions = await getSubmissions()
      return findDuplicateSubmission(existingSubmissions, newSubmission)
    }
  } catch (error) {
    console.error('[store] checkDuplicateSubmission error:', error)
    // Fail-closed: throw error instead of allowing submission
    throw new Error('Gagal memvalidasi pendaftaran. Silakan coba lagi.')
  }
}
