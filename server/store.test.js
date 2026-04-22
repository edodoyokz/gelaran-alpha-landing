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

test('parseScanValue - extracts voucher from structured payload', () => {
  const payload = 'event:RB SILENT BEAT RUN 2026|participant:550e8400-e29b-41d4-a716-446655440000|voucher:EVT-ABC123'
  const result = parseScanValue(payload)
  
  assert.strictEqual(result.raw, payload)
  assert.ok(result.candidates.includes('EVT-ABC123'), 'Should extract voucher code')
  assert.strictEqual(result.parsedFrom, 'structured-payload')
})

test('parseScanValue - extracts participant from structured payload', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  const payload = `event:RB SILENT BEAT RUN 2026|participant:${uuid}|voucher:EVT-ABC123`
  const result = parseScanValue(payload)
  
  assert.ok(result.candidates.includes(uuid), 'Should extract participant ID')
  assert.strictEqual(result.parsedFrom, 'structured-payload')
})

test('parseScanValue - prioritizes voucher over participant in structured payload', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  const payload = `event:RB SILENT BEAT RUN 2026|participant:${uuid}|voucher:EVT-ABC123`
  const result = parseScanValue(payload)
  
  // Voucher should come before participant in candidates array
  const voucherIndex = result.candidates.indexOf('EVT-ABC123')
  const participantIndex = result.candidates.indexOf(uuid)
  
  assert.ok(voucherIndex >= 0, 'Should have voucher in candidates')
  assert.ok(participantIndex >= 0, 'Should have participant in candidates')
  assert.ok(voucherIndex < participantIndex, 'Voucher should come before participant')
})

test('parseScanValue - includes raw payload as fallback in structured payload', () => {
  const payload = 'event:RB SILENT BEAT RUN 2026|participant:550e8400-e29b-41d4-a716-446655440000|voucher:EVT-ABC123'
  const result = parseScanValue(payload)
  
  // Raw payload should be last candidate
  assert.strictEqual(result.candidates[result.candidates.length - 1], payload, 'Raw payload should be last fallback')
})

test('parseScanValue - handles structured payload with colons in values', () => {
  const payload = 'event:Event: Special Edition|participant:550e8400-e29b-41d4-a716-446655440000|voucher:EVT-ABC123'
  const result = parseScanValue(payload)
  
  // Should still extract voucher correctly even though event name has colons
  assert.ok(result.candidates.includes('EVT-ABC123'), 'Should extract voucher despite colons in event name')
  assert.strictEqual(result.parsedFrom, 'structured-payload')
})

test('parseScanValue - handles structured payload with whitespace', () => {
  const payload = 'event: RB SILENT BEAT RUN 2026 | participant: 550e8400-e29b-41d4-a716-446655440000 | voucher: EVT-ABC123 '
  const result = parseScanValue(payload)
  
  assert.ok(result.candidates.includes('EVT-ABC123'), 'Should trim whitespace from voucher')
  assert.ok(result.candidates.includes('550e8400-e29b-41d4-a716-446655440000'), 'Should trim whitespace from participant')
  assert.strictEqual(result.parsedFrom, 'structured-payload')
})

test('parseScanValue - does not treat URL with pipe in path as structured payload', () => {
  const url = 'https://example.com/check-in/ABC123|metadata'
  const result = parseScanValue(url)
  
  // Should parse as URL, not structured payload (even though path contains pipe)
  assert.strictEqual(result.parsedFrom, 'url', 'Should recognize as URL despite pipe in path')
  // Should extract the path segment as candidate
  assert.ok(result.candidates.includes('ABC123|metadata'), 'Should extract path segment with pipe')
})

test('parseScanValue - requires recognized keys for structured payload', () => {
  const payload = 'unknown:value1|another:value2'
  const result = parseScanValue(payload)
  
  // Should NOT be treated as structured payload (no recognized keys)
  assert.notStrictEqual(result.parsedFrom, 'structured-payload', 'Should not treat as structured without recognized keys')
  // Will be treated as URL or raw depending on URL parser behavior
  assert.ok(['raw', 'url'].includes(result.parsedFrom), 'Should fall back to raw or url parsing')
})

test('parseScanValue - handles structured payload with submission field', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  const payload = `submission:${uuid}|voucher:EVT-ABC123`
  const result = parseScanValue(payload)
  
  assert.ok(result.candidates.includes('EVT-ABC123'), 'Should extract voucher')
  assert.ok(result.candidates.includes(uuid), 'Should extract submission ID')
  assert.strictEqual(result.parsedFrom, 'structured-payload')
})

test('parseScanValue - ignores invalid structured segments without colon', () => {
  const payload = 'event:RB SILENT BEAT RUN 2026|invalidsegment|voucher:EVT-ABC123'
  const result = parseScanValue(payload)
  
  assert.ok(result.candidates.includes('EVT-ABC123'), 'Should still extract valid voucher')
  assert.strictEqual(result.parsedFrom, 'structured-payload')
})

test('parseScanValue - does not treat URL as structured payload', () => {
  const url = 'https://example.com/event?voucher=ABC123'
  const result = parseScanValue(url)
  
  // Should parse as URL, not structured payload
  assert.strictEqual(result.parsedFrom, 'url', 'Should recognize as URL, not structured payload')
  assert.ok(result.candidates.includes('ABC123'))
})

test('parseScanValue - deduplicates candidates in structured payload', () => {
  const payload = 'participant:EVT-ABC123|voucher:EVT-ABC123'
  const result = parseScanValue(payload)
  
  // Should only have EVT-ABC123 once in candidates (plus raw fallback)
  const voucherCount = result.candidates.filter(c => c === 'EVT-ABC123').length
  assert.strictEqual(voucherCount, 1, 'Should deduplicate EVT-ABC123')
})

test('parseScanValue - structured payload lookup simulation with voucher match', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  const voucherCode = 'EVT-ABC123'
  const payload = `event:RB SILENT BEAT RUN 2026|participant:${uuid}|voucher:${voucherCode}`
  
  // Simulate what findSubmissionByScanValue does
  const parsed = parseScanValue(payload)
  const mockSubmissions = [
    { id: uuid, voucherCode: voucherCode, answers: [] }
  ]
  
  // Try each candidate in order
  let found = null
  for (const candidate of parsed.candidates) {
    // Try voucher code first
    found = mockSubmissions.find(s => s.voucherCode === candidate)
    if (!found) {
      // Fallback to submission ID
      found = mockSubmissions.find(s => s.id === candidate)
    }
    if (found) break
  }
  
  assert.ok(found, 'Should find submission via voucher code')
  assert.strictEqual(found.voucherCode, voucherCode)
})

test('parseScanValue - structured payload lookup simulation with participant fallback', () => {
  const uuid = '550e8400-e29b-41d4-a716-446655440000'
  const payload = `event:RB SILENT BEAT RUN 2026|participant:${uuid}|voucher:WRONG-CODE`
  
  // Simulate what findSubmissionByScanValue does
  const parsed = parseScanValue(payload)
  const mockSubmissions = [
    { id: uuid, voucherCode: 'EVT-CORRECT', answers: [] }
  ]
  
  // Try each candidate in order
  let found = null
  for (const candidate of parsed.candidates) {
    // Try voucher code first
    found = mockSubmissions.find(s => s.voucherCode === candidate)
    if (!found) {
      // Fallback to submission ID
      found = mockSubmissions.find(s => s.id === candidate)
    }
    if (found) break
  }
  
  assert.ok(found, 'Should find submission via participant ID fallback')
  assert.strictEqual(found.id, uuid)
})

test('parseScanValue - structured payload lookup simulation with no match', () => {
  const payload = 'event:RB SILENT BEAT RUN 2026|participant:wrong-uuid|voucher:WRONG-CODE'
  
  // Simulate what findSubmissionByScanValue does
  const parsed = parseScanValue(payload)
  const mockSubmissions = [
    { id: '550e8400-e29b-41d4-a716-446655440000', voucherCode: 'EVT-CORRECT', answers: [] }
  ]
  
  // Try each candidate in order
  let found = undefined
  for (const candidate of parsed.candidates) {
    // Try voucher code first
    const submission = mockSubmissions.find(s => s.voucherCode === candidate)
    if (submission) {
      found = submission
      break
    }
    // Fallback to submission ID
    const submissionById = mockSubmissions.find(s => s.id === candidate)
    if (submissionById) {
      found = submissionById
      break
    }
  }
  
  assert.strictEqual(found, undefined, 'Should not find submission with wrong identifiers')
})

// Integration tests with actual findSubmissionByScanValue function
test('findSubmissionByScanValue - finds submission via structured payload voucher code', async () => {
  // This test uses the actual local file storage, so we need to set up test data
  const { addSubmission, findSubmissionByScanValue, deleteSubmission } = await import('./store.js')
  
  const testSubmission = {
    id: 'test-structured-voucher-' + Date.now(),
    voucherCode: 'TEST-VOUCHER-123',
    answers: [{ label: 'Name', value: 'Test User' }]
  }
  
  try {
    // Add test submission
    await addSubmission(testSubmission)
    
    // Test with structured payload
    const payload = `event:Test Event|participant:${testSubmission.id}|voucher:${testSubmission.voucherCode}`
    const found = await findSubmissionByScanValue(payload)
    
    assert.ok(found, 'Should find submission via structured payload')
    assert.strictEqual(found.voucherCode, testSubmission.voucherCode)
    assert.strictEqual(found.id, testSubmission.id)
  } finally {
    // Clean up test data
    await deleteSubmission(testSubmission.id)
  }
})

test('findSubmissionByScanValue - falls back to participant ID when voucher wrong', async () => {
  const { addSubmission, findSubmissionByScanValue, deleteSubmission } = await import('./store.js')
  
  const testSubmission = {
    id: 'test-structured-fallback-' + Date.now(),
    voucherCode: 'TEST-CORRECT-456',
    answers: [{ label: 'Name', value: 'Test User 2' }]
  }
  
  try {
    // Add test submission
    await addSubmission(testSubmission)
    
    // Test with structured payload where voucher is wrong but participant ID is correct
    const payload = `event:Test Event|participant:${testSubmission.id}|voucher:WRONG-VOUCHER`
    const found = await findSubmissionByScanValue(payload)
    
    assert.ok(found, 'Should find submission via participant ID fallback')
    assert.strictEqual(found.id, testSubmission.id)
    assert.strictEqual(found.voucherCode, testSubmission.voucherCode)
  } finally {
    // Clean up test data
    await deleteSubmission(testSubmission.id)
  }
})

test('findSubmissionByScanValue - returns null when no match in structured payload', async () => {
  const { findSubmissionByScanValue } = await import('./store.js')
  
  // Test with structured payload that won't match any real submission
  const payload = 'event:Test Event|participant:nonexistent-uuid-999|voucher:NONEXISTENT-VOUCHER'
  const found = await findSubmissionByScanValue(payload)
  
  assert.strictEqual(found, null, 'Should return null when no submission matches')
})
