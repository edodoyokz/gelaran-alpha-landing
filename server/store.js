import fs from 'node:fs'
import path from 'node:path'
import { defaultSchema } from './defaultSchema.js'
import {
  isSupabaseEnabled,
  getSupabaseSchema,
  saveSupabaseSchema,
  getSupabaseSubmissions,
  addSupabaseSubmission,
  deleteSupabaseSubmission,
  resetSupabaseDb,
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
    return getSupabaseSubmissions()
  }

  return readLocalDb().submissions
}

export async function addSubmission(submission) {
  if (isSupabaseEnabled()) {
    return addSupabaseSubmission(submission)
  }

  const data = readLocalDb()
  data.submissions.unshift(submission)
  writeLocalDb(data)
  return submission
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
  await saveSchema(schema)
  return emailConfig
}
