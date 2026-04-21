import test from 'node:test'
import assert from 'node:assert'
import { extractIdentity } from './store.js'

test('extractIdentity - extracts email from answers array', () => {
  const submission = {
    answers: [
      { id: 'email', label: 'Email', value: '  Test@Example.COM  ' },
      { id: 'name', label: 'Name', value: 'John Doe' },
    ],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, 'test@example.com')
})

test('extractIdentity - extracts phone from answers array', () => {
  const submission = {
    answers: [
      { id: 'whatsapp', label: 'WhatsApp', value: '  0896-0670-3094  ' },
      { id: 'name', label: 'Name', value: 'John Doe' },
    ],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.phone, '089606703094')
})

test('extractIdentity - normalizes email to lowercase and trims whitespace', () => {
  const submission = {
    answers: [{ id: 'email', label: 'Email', value: '  UPPERCASE@EXAMPLE.COM  ' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, 'uppercase@example.com')
})

test('extractIdentity - removes spaces, dashes, and parentheses from phone', () => {
  const submission = {
    answers: [{ id: 'phone', label: 'Phone', value: '(089) 606-703 094' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.phone, '089606703094')
})

test('extractIdentity - finds email by label containing "email" (case insensitive)', () => {
  const submission = {
    answers: [
      { id: 'custom-field', label: 'Your Email Address', value: 'test@example.com' },
    ],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, 'test@example.com')
})

test('extractIdentity - finds phone by label containing "whatsapp" (case insensitive)', () => {
  const submission = {
    answers: [
      { id: 'custom-field', label: 'Nomor WhatsApp', value: '089606703094' },
    ],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.phone, '089606703094')
})

test('extractIdentity - finds phone by label containing "phone" (case insensitive)', () => {
  const submission = {
    answers: [
      { id: 'custom-field', label: 'Phone Number', value: '089606703094' },
    ],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.phone, '089606703094')
})

test('extractIdentity - returns null for email if not found', () => {
  const submission = {
    answers: [{ id: 'name', label: 'Name', value: 'John Doe' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, null)
})

test('extractIdentity - returns null for phone if not found', () => {
  const submission = {
    answers: [{ id: 'name', label: 'Name', value: 'John Doe' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.phone, null)
})

test('extractIdentity - returns null for empty email value', () => {
  const submission = {
    answers: [{ id: 'email', label: 'Email', value: '   ' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, null)
})

test('extractIdentity - returns null for empty phone value', () => {
  const submission = {
    answers: [{ id: 'phone', label: 'Phone', value: '   ' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.phone, null)
})

test('extractIdentity - handles submission with both email and phone', () => {
  const submission = {
    answers: [
      { id: 'email', label: 'Email', value: 'test@example.com' },
      { id: 'whatsapp', label: 'WhatsApp', value: '089606703094' },
    ],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, 'test@example.com')
  assert.strictEqual(identity.phone, '089606703094')
})

test('extractIdentity - uses identity_email field if present', () => {
  const submission = {
    identity_email: 'direct@example.com',
    answers: [{ id: 'email', label: 'Email', value: 'fallback@example.com' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, 'direct@example.com')
})

test('extractIdentity - uses identity_phone field if present', () => {
  const submission = {
    identity_phone: '081234567890',
    answers: [{ id: 'phone', label: 'Phone', value: '089606703094' }],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.phone, '081234567890')
})

test('extractIdentity - fallbacks to answers if identity fields are empty', () => {
  const submission = {
    identity_email: '',
    identity_phone: '',
    answers: [
      { id: 'email', label: 'Email', value: 'test@example.com' },
      { id: 'phone', label: 'Phone', value: '089606703094' },
    ],
  }

  const identity = extractIdentity(submission)

  assert.strictEqual(identity.email, 'test@example.com')
  assert.strictEqual(identity.phone, '089606703094')
})
