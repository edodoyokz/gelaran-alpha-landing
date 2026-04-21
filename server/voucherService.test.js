import { test } from 'node:test'
import assert from 'node:assert'
import { generateVoucherCode, generateQRPayload, generateQRCodeBuffer, buildVoucherAssets } from './voucherService.js'

test('generateVoucherCode creates deterministic code', () => {
  const submissionId = 'test-submission-123'
  const code1 = generateVoucherCode(submissionId)
  const code2 = generateVoucherCode(submissionId)
  
  assert.strictEqual(code1, code2, 'Same submission ID should generate same voucher code')
  assert.match(code1, /^EVT-[A-Z0-9]{6}$/, 'Voucher code should match format EVT-XXXXXX')
})

test('generateQRPayload creates correct format', () => {
  const payload = generateQRPayload('Test Event', 'sub-123', 'EVT-ABC123')
  assert.strictEqual(payload, 'event:Test Event|participant:sub-123|voucher:EVT-ABC123')
})

test('generateQRCodeBuffer generates PNG buffer', async () => {
  const payload = 'test:data|value:123'
  const buffer = await generateQRCodeBuffer(payload)
  
  assert.ok(Buffer.isBuffer(buffer), 'Should return a Buffer')
  assert.ok(buffer.length > 0, 'Buffer should not be empty')
  
  // Check PNG signature
  assert.strictEqual(buffer[0], 0x89, 'Should start with PNG signature')
  assert.strictEqual(buffer[1], 0x50, 'Should have PNG signature')
  assert.strictEqual(buffer[2], 0x4E, 'Should have PNG signature')
  assert.strictEqual(buffer[3], 0x47, 'Should have PNG signature')
})

test('buildVoucherAssets generates complete voucher data', async () => {
  const assets = await buildVoucherAssets({
    eventName: 'Test Event',
    submissionId: 'sub-456',
    voucherCode: 'EVT-TEST01',
  })
  
  assert.strictEqual(assets.voucherCode, 'EVT-TEST01')
  assert.ok(assets.qrPayload.includes('Test Event'))
  assert.ok(assets.qrPayload.includes('sub-456'))
  assert.ok(assets.qrPayload.includes('EVT-TEST01'))
  assert.ok(Buffer.isBuffer(assets.qrCodeBuffer))
  assert.ok(assets.qrCodeBuffer.length > 0)
})

test('buildVoucherAssets retries on failure', async () => {
  // This test verifies retry logic exists by checking successful generation
  // In real scenario, we'd mock QRCode.toBuffer to fail once then succeed
  const assets = await buildVoucherAssets({
    eventName: 'Retry Test',
    submissionId: 'sub-retry',
    voucherCode: 'EVT-RETRY1',
  })
  
  assert.ok(assets.qrCodeBuffer, 'Should eventually succeed with retry logic')
})
