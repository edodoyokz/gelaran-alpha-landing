import crypto from 'crypto'
import QRCode from 'qrcode'

/**
 * Generate a unique voucher code for a submission
 * @param {string} submissionId - The submission UUID
 * @returns {string} - Voucher code in format: EVT-XXXXXX
 */
export function generateVoucherCode(submissionId) {
  // Create a deterministic voucher code based on submission ID
  const hash = crypto.createHash('sha256').update(submissionId).digest('hex')
  const code = hash.substring(0, 6).toUpperCase()
  return `EVT-${code}`
}

/**
 * Generate QR code payload for a voucher
 * @param {string} eventName - Event name
 * @param {string} submissionId - Submission UUID
 * @param {string} voucherCode - Voucher code
 * @returns {string} - QR code payload
 */
export function generateQRPayload(eventName, submissionId, voucherCode) {
  return `event:${eventName}|participant:${submissionId}|voucher:${voucherCode}`
}

/**
 * Generate QR code as data URL
 * @param {string} payload - QR code payload
 * @returns {Promise<string>} - QR code data URL
 */
export async function generateQRCodeDataURL(payload) {
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      width: 300,
      margin: 2,
    })
  } catch (error) {
    console.error('Failed to generate QR code:', error)
    throw new Error('Failed to generate QR code')
  }
}

/**
 * Generate QR code as PNG buffer
 * @param {string} payload - QR code payload
 * @returns {Promise<Buffer>} - QR code PNG buffer
 */
export async function generateQRCodeBuffer(payload) {
  try {
    return await QRCode.toBuffer(payload, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: 300,
      margin: 2,
    })
  } catch (error) {
    console.error('Failed to generate QR code buffer:', error)
    throw new Error('Failed to generate QR code buffer')
  }
}

/**
 * Build voucher assets with retry logic
 * @param {Object} params - Voucher parameters
 * @returns {Promise<Object>} - Voucher assets including QR buffer
 */
export async function buildVoucherAssets({ eventName, submissionId, voucherCode }) {
  const qrPayload = generateQRPayload(eventName, submissionId, voucherCode)
  
  let qrCodeBuffer
  let lastError
  
  // Try to generate QR code with one retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      qrCodeBuffer = await generateQRCodeBuffer(qrPayload)
      break
    } catch (error) {
      lastError = error
      console.error(`[buildVoucherAssets] QR generation attempt ${attempt} failed:`, error)
      if (attempt === 2) {
        throw new Error(`Failed to generate QR code after 2 attempts: ${lastError.message}`)
      }
    }
  }
  
  return {
    voucherCode,
    qrPayload,
    qrCodeBuffer,
  }
}

/**
 * Generate e-voucher HTML content
 * @param {Object} params - Voucher parameters
 * @returns {string} - HTML content for e-voucher
 */
export function generateEVoucherHTML({ eventName, eventDate, eventLocation, participantName, voucherCode, qrCodeDataURL }) {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>E-Voucher - ${eventName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; padding: 20px; }
    .voucher { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
    .header h1 { font-size: 24px; margin-bottom: 8px; }
    .header p { font-size: 14px; opacity: 0.9; }
    .content { padding: 30px; }
    .status-badge { display: inline-block; background: #10b981; color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
    .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
    .info-label { color: #6b7280; font-size: 14px; }
    .info-value { color: #111827; font-size: 14px; font-weight: 600; text-align: right; }
    .qr-section { text-align: center; padding: 30px 0; background: #f9fafb; margin: 20px -30px; }
    .qr-section h3 { font-size: 16px; color: #374151; margin-bottom: 16px; }
    .qr-code { display: inline-block; padding: 16px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .voucher-code { text-align: center; margin: 20px 0; }
    .voucher-code-label { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
    .voucher-code-value { font-size: 24px; font-weight: 700; color: #667eea; letter-spacing: 2px; }
    .footer { padding: 20px 30px; background: #f9fafb; text-align: center; color: #6b7280; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="voucher">
    <div class="header">
      <h1>${eventName}</h1>
      <p>E-Voucher Peserta</p>
    </div>
    <div class="content">
      <div class="status-badge">✓ LUNAS</div>
      <div class="info-row">
        <span class="info-label">Nama Peserta</span>
        <span class="info-value">${participantName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Tanggal Event</span>
        <span class="info-value">${eventDate || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Lokasi</span>
        <span class="info-value">${eventLocation || '-'}</span>
      </div>
      <div class="voucher-code">
        <div class="voucher-code-label">Kode Voucher</div>
        <div class="voucher-code-value">${voucherCode}</div>
      </div>
      <div class="qr-section">
        <h3>Scan QR Code saat Check-in</h3>
        <div class="qr-code">
          <img src="${qrCodeDataURL}" alt="QR Code" width="300" height="300" />
        </div>
      </div>
    </div>
    <div class="footer">
      <p>Simpan e-voucher ini dan tunjukkan saat check-in event.</p>
      <p>Jika ada pertanyaan, silakan hubungi panitia.</p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
