import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const modulePath = pathToFileURL(path.resolve('server/adminAuth.js')).href

async function importAdminAuth() {
  return import(`${modulePath}?t=${Date.now()}-${Math.random()}`)
}

test('creates and verifies a signed admin session token', async () => {
  const { createAdminSessionToken, verifyAdminSessionToken } = await importAdminAuth()

  const token = createAdminSessionToken({
    username: 'admin',
    secret: 'test-secret',
    maxAgeMs: 60_000,
    now: 1_000,
  })

  const payload = verifyAdminSessionToken({
    token,
    secret: 'test-secret',
    now: 2_000,
  })

  assert.equal(payload?.sub, 'admin')
  assert.equal(payload?.exp, 61_000)
})

test('rejects expired or tampered session tokens', async () => {
  const { createAdminSessionToken, verifyAdminSessionToken } = await importAdminAuth()

  const token = createAdminSessionToken({
    username: 'admin',
    secret: 'test-secret',
    maxAgeMs: 10,
    now: 100,
  })

  assert.equal(
    verifyAdminSessionToken({ token, secret: 'test-secret', now: 200 }),
    null,
  )

  const tampered = `${token}x`
  assert.equal(
    verifyAdminSessionToken({ token: tampered, secret: 'test-secret', now: 105 }),
    null,
  )
})
