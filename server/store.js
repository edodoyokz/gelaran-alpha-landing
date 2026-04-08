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

export async function getSchema() {
  return (await readDb()).schema
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
