import crypto from 'node:crypto'

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8')
}

function sign(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url')
}

export function createAdminSessionToken({ username, secret, maxAgeMs, now = Date.now() }) {
  const payload = JSON.stringify({ sub: username, exp: now + maxAgeMs })
  const encodedPayload = toBase64Url(payload)
  const signature = sign(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function verifyAdminSessionToken({ token, secret, now = Date.now() }) {
  if (!token || !secret) return null

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = sign(encodedPayload, secret)
  if (signature.length !== expectedSignature.length) {
    return null
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload))
  if (!payload?.sub || !payload?.exp || payload.exp <= now) {
    return null
  }

  return payload
}
