import test from 'node:test'
import assert from 'node:assert'
import { normalizeEmail, normalizePhone, findDuplicateSubmission, normalizeSubmission, parseScanValue } from './store.js'

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

test('normalizeSubmission - defaults missing check-in status to not_checked_in', () => {
  const submission = { id: '1', answers: [] }
  const normalized = normalizeSubmission(submission)

  assert.strictEqual(normalized.checkInStatus, 'not_checked_in')
  assert.strictEqual(normalized.checkedInAt, null)
})

test('normalizeSubmission - preserves existing check-in status and timestamp', () => {
  const submission = { 
    id: '1', 
    answers: [], 
    checkInStatus: 'checked_in',
    checkedInAt: '2026-04-21T10:00:00.000Z'
  }
  const normalized = normalizeSubmission(submission)

  assert.strictEqual(normalized.checkInStatus, 'checked_in')
  assert.strictEqual(normalized.checkedInAt, '2026-04-21T10:00:00.000Z')
})

test('parseScanValue - handles raw voucher code', () => {
  const result = parseScanValue('ABC12345')
  
  assert.strictEqual(result.raw, 'ABC12345')
  assert.strictEqual(result.candidates.length, 1)
  assert.strictEqual(result.candidates[0], 'ABC12345')
  assert.strictEqual(result.parsedFrom, 'raw')
})

test('parseScanValue - handles raw submission ID', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  const result = parseScanValue(uuid)
  
  assert.strictEqual(result.raw, uuid)
  assert.strictEqual(result.candidates.length, 1)
  assert.strictEqual(result.candidates[0], uuid)
  assert.strictEqual(result.parsedFrom, 'raw')
})

test('parseScanValue - extracts voucherCode from URL query parameter', () => {
  const result = parseScanValue('https://example.com/event?voucherCode=ABC12345')
  
  assert.strictEqual(result.raw, 'https://example.com/event?voucherCode=ABC12345')
  assert.ok(result.candidates.includes('ABC12345'))
  assert.strictEqual(result.parsedFrom, 'url')
})

test('parseScanValue - extracts submissionId from URL query parameter', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  const result = parseScanValue(`https://example.com/event?submissionId=${uuid}`)
  
  assert.ok(result.candidates.includes(uuid))
  assert.strictEqual(result.parsedFrom, 'url')
})

test('parseScanValue - extracts identifier from URL path segment', () => {
  const result = parseScanValue('https://example.com/event/ABC12345')
  
  assert.ok(result.candidates.includes('ABC12345'))
  assert.strictEqual(result.parsedFrom, 'url')
})

test('parseScanValue - handles empty input', () => {
  const result = parseScanValue('')
  
  assert.strictEqual(result.raw, '')
  assert.strictEqual(result.candidates.length, 0)
  assert.strictEqual(result.parsedFrom, 'empty')
})

test('parseScanValue - handles whitespace input', () => {
  const result = parseScanValue('   ')
  
  assert.strictEqual(result.raw, '')
  assert.strictEqual(result.candidates.length, 0)
  assert.strictEqual(result.parsedFrom, 'empty')
})

test('parseScanValue - trims whitespace from input', () => {
  const result = parseScanValue('  ABC12345  ')
  
  assert.strictEqual(result.raw, 'ABC12345')
  assert.strictEqual(result.candidates[0], 'ABC12345')
})

test('parseScanValue - deduplicates candidates', () => {
  // URL where path segment and query param are the same
  const result = parseScanValue('https://example.com/ABC12345?code=ABC12345')
  
  // Should only have ABC12345 once, plus the full URL as fallback
  const abc12345Count = result.candidates.filter(c => c === 'ABC12345').length
  assert.strictEqual(abc12345Count, 1, 'Should deduplicate ABC12345')
})

test('parseScanValue - handles invalid URL as raw string', () => {
  const result = parseScanValue('not-a-valid-url-but-maybe-a-code')
  
  assert.strictEqual(result.raw, 'not-a-valid-url-but-maybe-a-code')
  assert.strictEqual(result.candidates[0], 'not-a-valid-url-but-maybe-a-code')
  assert.strictEqual(result.parsedFrom, 'raw')
})

test('parseScanValue - handles URL with multiple query parameters', () => {
  const result = parseScanValue('https://example.com/event?voucher=ABC123&id=XYZ789')
  
  assert.ok(result.candidates.includes('ABC123'))
  assert.ok(result.candidates.includes('XYZ789'))
  assert.strictEqual(result.parsedFrom, 'url')
})
