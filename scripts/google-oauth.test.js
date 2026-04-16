// DEPRECATED: Test file for deprecated google-oauth.js. No longer in active use.
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = pathToFileURL(path.resolve('scripts/google-oauth.js')).href

const OAUTH_KEYS = [
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOOGLE_OAUTH_REDIRECT_URI',
]

function resetOauthEnv() {
  for (const key of OAUTH_KEYS) {
    delete process.env[key]
  }
}

async function importOauthHelper() {
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`)
}

test('getOauthConfig reads required OAuth env values', async () => {
  resetOauthEnv()
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'client-secret'
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3001/oauth2callback'

  const oauthHelper = await importOauthHelper()
  assert.deepEqual(oauthHelper.getOauthConfig(), {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost:3001/oauth2callback',
  })

  resetOauthEnv()
})

test('createAuthUrl throws when OAuth env is incomplete', async () => {
  resetOauthEnv()
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'client-id'

  const oauthHelper = await importOauthHelper()

  assert.throws(() => oauthHelper.createAuthUrl(), {
    message: /Missing required OAuth environment variables/,
  })

  resetOauthEnv()
})
