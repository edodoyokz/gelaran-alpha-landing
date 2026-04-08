import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = pathToFileURL(path.resolve('server/driveStorage.js')).href

const DRIVE_ENV_KEYS = [
  'GOOGLE_DRIVE_FOLDER_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
]

function resetDriveEnv() {
  for (const key of DRIVE_ENV_KEYS) {
    delete process.env[key]
  }
}

async function importDriveStorage() {
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`)
}

test('Drive mode enabled only when OAuth env is complete', async () => {
  resetDriveEnv()
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder-id'
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret'

  let driveStorage = await importDriveStorage()
  assert.equal(driveStorage.isDriveStorageEnabled(), false)

  process.env.GOOGLE_OAUTH_REFRESH_TOKEN = 'refresh-token'
  driveStorage = await importDriveStorage()
  assert.equal(driveStorage.isDriveStorageEnabled(), true)

  resetDriveEnv()
})

test('Legacy service account env no longer activates Drive mode', async () => {
  resetDriveEnv()
  process.env.GOOGLE_DRIVE_FOLDER_ID = 'folder-id'
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'service@example.com'
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'

  const driveStorage = await importDriveStorage()
  assert.equal(driveStorage.isDriveStorageEnabled(), false)

  resetDriveEnv()
})
