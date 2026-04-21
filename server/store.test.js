import test from 'node:test'
import assert from 'node:assert'
import { normalizeEmail, normalizePhone, findDuplicateSubmission, normalizeSubmission } from './store.js'

test('normalizeEmail - converts to lowercase and trims', () => {
  assert.strictEqual(normalizeEmail('  Test@Example.COM  '), 'test@example.com')
  assert.strictEqual(normalizeEmail('user@domain.com'), 'user@domain.com')
})

test('normalizePhone - removes spaces, dashes, and common symbols', () => {
  assert.strictEqual(normalizePhone('0812-3456-7890'), '081234567890')
  assert.strictEqual(normalizePhone('0812 3456 7890'), '081234567890')
  assert.strictEqual(normalizePhone('+62 812 3456 7890'), '+6281234567890')
  assert.strictEqual(normalizePhone('(0812) 3456-7890'), '081234567890')
})

test('findDuplicateSubmission - detects duplicate email', () => {
  const submissions = [
    {
      id: '1',
      answers: [
        { label: 'Email', value: 'test@example.com' },
        { label: 'Nomor WhatsApp', value: '08123456789' },
      ],
    },
  ]

  const newSubmission = {
    answers: [
      { label: 'Email', value: 'TEST@EXAMPLE.COM' },
      { label: 'Nomor WhatsApp', value: '08199999999' },
    ],
  }

  const duplicate = findDuplicateSubmission(submissions, newSubmission)
  assert.ok(duplicate, 'Should detect duplicate email')
  assert.strictEqual(duplicate.field, 'email')
})

test('findDuplicateSubmission - detects duplicate phone with different format', () => {
  const submissions = [
    {
      id: '1',
      answers: [
        { label: 'Email', value: 'test@example.com' },
        { label: 'Nomor WhatsApp', value: '081234567890' },
      ],
    },
  ]

  const newSubmission = {
    answers: [
      { label: 'Email', value: 'different@example.com' },
      { label: 'Nomor WhatsApp', value: '0812-3456-7890' },
    ],
  }

  const duplicate = findDuplicateSubmission(submissions, newSubmission)
  assert.ok(duplicate, 'Should detect duplicate phone')
  assert.strictEqual(duplicate.field, 'phone')
})

test('findDuplicateSubmission - allows unique submissions', () => {
  const submissions = [
    {
      id: '1',
      answers: [
        { label: 'Email', value: 'test@example.com' },
        { label: 'Nomor WhatsApp', value: '08123456789' },
      ],
    },
  ]

  const newSubmission = {
    answers: [
      { label: 'Email', value: 'unique@example.com' },
      { label: 'Nomor WhatsApp', value: '08199999999' },
    ],
  }

  const duplicate = findDuplicateSubmission(submissions, newSubmission)
  assert.strictEqual(duplicate, null, 'Should allow unique submission')
})

test('normalizeSubmission - defaults missing payment status to registered', () => {
  const submission = { id: '1', answers: [] }
  const normalized = normalizeSubmission(submission)

  assert.strictEqual(normalized.paymentStatus, 'registered')
  assert.strictEqual(normalized.paymentConfirmedAt, null)
})

test('normalizeSubmission - preserves explicit paid status', () => {
  const submission = { 
    id: '1', 
    answers: [], 
    paymentStatus: 'paid',
    paymentConfirmedAt: '2026-04-21T00:00:00.000Z'
  }
  const normalized = normalizeSubmission(submission)

  assert.strictEqual(normalized.paymentStatus, 'paid')
  assert.strictEqual(normalized.paymentConfirmedAt, '2026-04-21T00:00:00.000Z')
})
