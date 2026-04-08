import fs from 'node:fs'
import path from 'node:path'
import { defaultSchema } from './defaultSchema.js'
import {
  isDriveStorageEnabled,
  readDriveJson,
  writeDriveJson,
} from './driveStorage.js'

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

async function readDb() {
  if (isDriveStorageEnabled()) {
    return readDriveJson(getInitialData())
  }

  ensureLocalDb()
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'))
}

async function writeDb(data) {
  if (isDriveStorageEnabled()) {
    await writeDriveJson(data)
    return
  }

  ensureLocalDb()
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
}

// Migrates deprecated drive.google.com/uc?id= poster URLs to the
// thumbnail API format which is reliably served as an image in all browsers.
function migratePosterUrl(schema) {
  if (!schema?.poster) return schema
  const match = schema.poster.match(/drive\.google\.com\/uc\?(?:.*&)?id=([^&]+)/)
  if (match) {
    return { ...schema, poster: `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1200` }
  }
  return schema
}

export async function getSchema() {
  const schema = (await readDb()).schema
  return migratePosterUrl(schema)
}

export async function saveSchema(schema) {
  const data = await readDb()
  data.schema = schema
  await writeDb(data)
  return data.schema
}

export async function getSubmissions() {
  return (await readDb()).submissions
}

export async function addSubmission(submission) {
  const data = await readDb()
  data.submissions.unshift(submission)
  await writeDb(data)
  return submission
}

export async function deleteSubmission(submissionId) {
  const data = await readDb()
  const nextSubmissions = data.submissions.filter(
    (submission) => submission.id !== submissionId,
  )

  const deleted = nextSubmissions.length !== data.submissions.length
  data.submissions = nextSubmissions
  await writeDb(data)

  return deleted
}

export async function resetDb() {
  const data = getInitialData()
  await writeDb(data)
  return data
}

export function getStorageMode() {
  return isDriveStorageEnabled() ? 'google-drive' : 'local-file'
}
