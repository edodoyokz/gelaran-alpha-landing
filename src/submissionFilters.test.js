import test from 'node:test'
import assert from 'node:assert'
import {
  normalizePhone,
  normalizeSearchTerm,
  tokenizeSearchQuery,
  getSubmissionSearchIndex,
  matchesSubmissionQuery,
  matchesSubmissionFilter,
  compareSubmissions,
} from './submissionFilters.js'

// Test data
const sampleSubmission = {
  id: '1',
  submittedAtIso: '2026-04-21T10:00:00Z',
  paymentStatus: 'registered',
  answers: [
    { label: 'Nama Lengkap', value: 'Budi Santoso' },
    { label: 'Email', value: 'budi@example.com' },
    { label: 'Nomor WhatsApp', value: '0812-3456-7890' },
  ],
}

const paidSubmission = {
  id: '2',
  submittedAtIso: '2026-04-20T10:00:00Z',
  paymentStatus: 'paid',
  answers: [
    { label: 'Nama Lengkap', value: 'Ani Wijaya' },
    { label: 'Email', value: 'ani@example.com' },
  ],
}

const submissionWithoutEmail = {
  id: '3',
  submittedAtIso: '2026-04-19T10:00:00Z',
  paymentStatus: 'registered',
  answers: [
    { label: 'Nama Lengkap', value: 'Citra Dewi' },
    { label: 'Nomor WhatsApp', value: '081234567890' },
  ],
}

// normalizePhone tests
test('normalizePhone - removes spaces, dashes, and parentheses', () => {
  assert.strictEqual(normalizePhone('0812-3456-7890'), '081234567890')
  assert.strictEqual(normalizePhone('(0812) 3456 7890'), '081234567890')
  assert.strictEqual(normalizePhone('+62 812 3456 7890'), '6281234567890')
})

test('normalizePhone - handles empty input', () => {
  assert.strictEqual(normalizePhone(''), '')
  assert.strictEqual(normalizePhone(null), '')
  assert.strictEqual(normalizePhone(undefined), '')
})

// normalizeSearchTerm tests
test('normalizeSearchTerm - converts to lowercase and trims', () => {
  assert.strictEqual(normalizeSearchTerm('  BUDI SANTOSO  '), 'budi santoso')
  assert.strictEqual(normalizeSearchTerm('Test@Example.COM'), 'test@example.com')
})

test('normalizeSearchTerm - handles empty input', () => {
  assert.strictEqual(normalizeSearchTerm(''), '')
  assert.strictEqual(normalizeSearchTerm(null), '')
})

// tokenizeSearchQuery tests
test('tokenizeSearchQuery - splits by whitespace', () => {
  const tokens = tokenizeSearchQuery('budi santoso')
  assert.deepStrictEqual(tokens, ['budi', 'santoso'])
})

test('tokenizeSearchQuery - handles multiple spaces', () => {
  const tokens = tokenizeSearchQuery('budi    santoso   email')
  assert.deepStrictEqual(tokens, ['budi', 'santoso', 'email'])
})

test('tokenizeSearchQuery - handles empty input', () => {
  assert.deepStrictEqual(tokenizeSearchQuery(''), [])
  assert.deepStrictEqual(tokenizeSearchQuery('   '), [])
})

// getSubmissionSearchIndex tests
test('getSubmissionSearchIndex - builds searchable fields from submission', () => {
  const index = getSubmissionSearchIndex(sampleSubmission)
  
  assert.ok(index.text.includes('budi santoso'))
  assert.ok(index.text.includes('budi@example.com'))
  assert.strictEqual(index.name, 'budi santoso')
  assert.strictEqual(index.email, 'budi@example.com')
  assert.strictEqual(index.phoneNormalized, '081234567890')
})

test('getSubmissionSearchIndex - handles submission without email', () => {
  const index = getSubmissionSearchIndex(submissionWithoutEmail)
  
  assert.strictEqual(index.email, '')
  assert.ok(index.phoneNormalized.length > 0)
})

// matchesSubmissionQuery tests
test('matchesSubmissionQuery - matches name case-insensitively', () => {
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, 'BUDI'), true)
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, 'santoso'), true)
})

test('matchesSubmissionQuery - matches email case-insensitively', () => {
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, 'BUDI@EXAMPLE.COM'), true)
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, 'budi@'), true)
})

test('matchesSubmissionQuery - matches phone across formatting', () => {
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, '0812 3456 7890'), true)
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, '081234567890'), true)
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, '0812-3456'), true)
})

test('matchesSubmissionQuery - requires all tokens to match (AND logic)', () => {
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, 'budi 7890'), true)
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, 'budi example'), true)
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, 'budi jakarta'), false)
})

test('matchesSubmissionQuery - returns true for empty query', () => {
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, ''), true)
  assert.strictEqual(matchesSubmissionQuery(sampleSubmission, '   '), true)
})

// matchesSubmissionFilter tests
test('matchesSubmissionFilter - matches all filter', () => {
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'all'), true)
  assert.strictEqual(matchesSubmissionFilter(paidSubmission, 'all'), true)
})

test('matchesSubmissionFilter - matches today filter', () => {
  const now = new Date('2026-04-21T15:00:00Z')
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'today', now), true)
  assert.strictEqual(matchesSubmissionFilter(paidSubmission, 'today', now), false)
})

test('matchesSubmissionFilter - matches thisWeek filter', () => {
  const now = new Date('2026-04-21T15:00:00Z')
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'thisWeek', now), true)
  assert.strictEqual(matchesSubmissionFilter(paidSubmission, 'thisWeek', now), true)
  
  const oldSubmission = {
    ...sampleSubmission,
    submittedAtIso: '2026-04-01T10:00:00Z',
  }
  assert.strictEqual(matchesSubmissionFilter(oldSubmission, 'thisWeek', now), false)
})

test('matchesSubmissionFilter - matches thisMonth filter', () => {
  const now = new Date('2026-04-21T15:00:00Z')
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'thisMonth', now), true)
  
  const oldSubmission = {
    ...sampleSubmission,
    submittedAtIso: '2026-03-01T10:00:00Z',
  }
  assert.strictEqual(matchesSubmissionFilter(oldSubmission, 'thisMonth', now), false)
})

test('matchesSubmissionFilter - matches withEmail filter', () => {
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'withEmail'), true)
  assert.strictEqual(matchesSubmissionFilter(submissionWithoutEmail, 'withEmail'), false)
})

test('matchesSubmissionFilter - matches withPhone filter', () => {
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'withPhone'), true)
  assert.strictEqual(matchesSubmissionFilter(paidSubmission, 'withPhone'), false)
})

test('matchesSubmissionFilter - matches paid filter', () => {
  assert.strictEqual(matchesSubmissionFilter(paidSubmission, 'paid'), true)
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'paid'), false)
})

test('matchesSubmissionFilter - matches unpaid filter', () => {
  assert.strictEqual(matchesSubmissionFilter(sampleSubmission, 'unpaid'), true)
  assert.strictEqual(matchesSubmissionFilter(paidSubmission, 'unpaid'), false)
})

// compareSubmissions tests
test('compareSubmissions - sorts by newest', () => {
  const result = compareSubmissions(sampleSubmission, paidSubmission, 'newest')
  assert.ok(result < 0) // sampleSubmission is newer, should come first
})

test('compareSubmissions - sorts by oldest', () => {
  const result = compareSubmissions(sampleSubmission, paidSubmission, 'oldest')
  assert.ok(result > 0) // paidSubmission is older, should come first
})

test('compareSubmissions - sorts by nameAsc', () => {
  const result = compareSubmissions(sampleSubmission, paidSubmission, 'nameAsc')
  assert.ok(result > 0) // "Ani" comes before "Budi"
})

test('compareSubmissions - sorts by nameDesc', () => {
  const result = compareSubmissions(sampleSubmission, paidSubmission, 'nameDesc')
  assert.ok(result < 0) // "Budi" comes after "Ani" in desc
})

test('compareSubmissions - sorts by paidFirst', () => {
  const result = compareSubmissions(sampleSubmission, paidSubmission, 'paidFirst')
  assert.ok(result > 0) // paidSubmission should come first
})

test('compareSubmissions - sorts by unpaidFirst', () => {
  const result = compareSubmissions(sampleSubmission, paidSubmission, 'unpaidFirst')
  assert.ok(result < 0) // sampleSubmission (unpaid) should come first
})

test('compareSubmissions - sorts by emailFirst', () => {
  const result = compareSubmissions(submissionWithoutEmail, sampleSubmission, 'emailFirst')
  assert.ok(result > 0) // sampleSubmission (has email) should come first
})

test('compareSubmissions - sorts by phoneFirst', () => {
  const result = compareSubmissions(paidSubmission, sampleSubmission, 'phoneFirst')
  assert.ok(result > 0) // sampleSubmission (has phone) should come first
})
