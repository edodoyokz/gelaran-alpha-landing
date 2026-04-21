import { test } from 'node:test'
import assert from 'node:assert'
import { buildEmailSubmissionData } from './emailPayload.js'

test('buildEmailSubmissionData extracts email, full-name, and phone from answers', () => {
  const payload = buildEmailSubmissionData({
    id: '123',
    answers: [
      { id: 'full-name', label: 'Nama Lengkap', value: 'Budi Santoso' },
      { id: 'email', label: 'Email', value: 'budi@example.com' },
      { id: 'phone', label: 'Nomer Whatsapp', value: '081234567890' },
    ],
    voucherCode: 'ABC123',
  })

  assert.equal(payload.email, 'budi@example.com')
  assert.equal(payload['full-name'], 'Budi Santoso')
  assert.equal(payload.phone, '081234567890')
  assert.equal(payload.voucherCode, 'ABC123')
})

test('buildEmailSubmissionData preserves existing flat fields', () => {
  const payload = buildEmailSubmissionData({
    id: '456',
    email: 'existing@example.com',
    'full-name': 'Existing Name',
    phone: '089999999999',
    voucherCode: 'XYZ789',
    answers: [
      { id: 'email', label: 'Email', value: 'new@example.com' },
    ],
  })

  // Should preserve existing flat fields, not overwrite with answers
  assert.equal(payload.email, 'existing@example.com')
  assert.equal(payload['full-name'], 'Existing Name')
  assert.equal(payload.phone, '089999999999')
})

test('buildEmailSubmissionData handles missing answers gracefully', () => {
  const payload = buildEmailSubmissionData({
    id: '789',
    voucherCode: 'DEF456',
  })

  assert.equal(payload.id, '789')
  assert.equal(payload.voucherCode, 'DEF456')
  assert.equal(payload.email, undefined)
})

test('buildEmailSubmissionData extracts all answer fields as flat properties', () => {
  const payload = buildEmailSubmissionData({
    id: '999',
    answers: [
      { id: 'full-name', label: 'Nama Lengkap', value: 'Test User' },
      { id: 'email', label: 'Email', value: 'test@example.com' },
      { id: 'tshirt-size', label: 'Size T-Shirt', value: 'L' },
    ],
  })

  assert.equal(payload['full-name'], 'Test User')
  assert.equal(payload.email, 'test@example.com')
  assert.equal(payload['tshirt-size'], 'L')
})
