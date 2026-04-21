import { Resend } from 'resend'
import { generateVoucherCode, buildVoucherAssets } from './voucherService.js'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

function replaceVariables(template, variables) {
  let result = String(template || '')
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g')
    result = result.replace(regex, value || '')
  }
  return result
}

function normalizePhoneNumber(value = '') {
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('62')) return digits
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

function buildWhatsAppLink(phoneNumber, message) {
  const normalized = normalizePhoneNumber(phoneNumber)
  if (!normalized) return ''
  const encoded = encodeURIComponent(message || '')
  return `https://wa.me/${normalized}?text=${encoded}`
}

function extractSubmissionFields(eventData, submissionData) {
  return Object.entries(submissionData)
    .filter(([key]) => !key.startsWith('_') && key !== 'id' && key !== 'timestamp')
    .map(([key, value]) => {
      const field = eventData.fields?.find((item) => item.id === key)
      return {
        label: field?.label || key,
        value: typeof value === 'boolean' ? (value ? 'Ya' : 'Tidak') : value,
      }
    })
}

function getDefaultEmailConfig(eventData = {}) {
  return {
    enabled: true,
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromName: process.env.FROM_NAME || eventData.eventName || 'Gelaran Admin',
    fromEmail: process.env.FROM_EMAIL || '',
    replyTo: process.env.REPLY_TO || process.env.FROM_EMAIL || '',
    paymentInfo: {
      bankName: process.env.PAYMENT_BANK || 'BCA',
      accountNumber: process.env.PAYMENT_ACCOUNT_NUMBER || '',
      accountName: process.env.PAYMENT_ACCOUNT_NAME || '',
      confirmWhatsapp: process.env.PAYMENT_CONFIRM_WHATSAPP || '',
    },
    participantEmail: {
      enabled: true,
      subject: 'Konfirmasi Pendaftaran - {{eventName}}',
      template: {
        headerColor: '#111827',
        logoUrl: '',
        greeting: 'Pendaftaran Anda Sudah Kami Terima',
        bodyText:
          'Terima kasih sudah mendaftar di {{eventName}}. Data pendaftaran Anda sudah masuk ke sistem kami. Silakan lanjutkan pembayaran sesuai informasi di bawah ini, lalu klik tombol WhatsApp untuk konfirmasi pembayaran.',
        instructions:
          'Transfer ke rekening berikut:\n{{paymentBank}} {{paymentAccountNumber}}\na.n. {{paymentAccountName}}\n\nSetelah transfer, klik tombol Konfirmasi Pembayaran via WhatsApp di bawah email ini.',
        footerText: 'Run the rhythm. Feel the beat. Experience the silence.',
        showEventDetails: true,
        showRegistrationData: true,
        showPaymentDetails: true,
        showWhatsappButton: true,
        whatsappButtonText: 'Konfirmasi Pembayaran via WhatsApp',
      },
    },
    adminEmail: {
      enabled: true,
      recipient: process.env.ADMIN_EMAIL || process.env.FROM_EMAIL || '',
      subject: 'Pendaftaran Baru - {{participantName}}',
      template: {
        headerColor: '#059669',
        logoUrl: '',
        greeting: 'Pendaftaran Baru Diterima',
        bodyText: 'Ada peserta baru yang mendaftar untuk {{eventName}}.',
        instructions: '',
        footerText: 'Notifikasi otomatis dari sistem pendaftaran.',
        showEventDetails: false,
        showRegistrationData: true,
        showPaymentDetails: false,
        showWhatsappButton: false,
        whatsappButtonText: '',
      },
    },
  }
}

function mergeEmailConfig(emailConfig, eventData) {
  const defaults = getDefaultEmailConfig(eventData)
  return {
    ...defaults,
    ...(emailConfig || {}),
    paymentInfo: {
      ...defaults.paymentInfo,
      ...(emailConfig?.paymentInfo || {}),
    },
    participantEmail: {
      ...defaults.participantEmail,
      ...(emailConfig?.participantEmail || {}),
      template: {
        ...defaults.participantEmail.template,
        ...(emailConfig?.participantEmail?.template || {}),
      },
    },
    adminEmail: {
      ...defaults.adminEmail,
      ...(emailConfig?.adminEmail || {}),
      template: {
        ...defaults.adminEmail.template,
        ...(emailConfig?.adminEmail?.template || {}),
      },
    },
  }
}

export function generateEmailHTML(templateConfig, variables) {
  const {
    headerColor = '#2563eb',
    logoUrl = '',
    greeting = '',
    bodyText = '',
    instructions = '',
    footerText = '',
    showEventDetails = false,
    showRegistrationData = false,
    showPaymentDetails = false,
    showWhatsappButton = false,
    whatsappButtonText = 'Konfirmasi via WhatsApp',
  } = templateConfig || {}

  const { eventData = {}, submissionData = {}, paymentInfo = {}, whatsappLink = '' } = variables

  let eventDetailsHTML = ''
  if (showEventDetails && eventData.eventName) {
    eventDetailsHTML = `
      <div style="background: #f9fafb; padding: 20px; border-radius: 12px; margin: 20px 0;">
        <h2 style="margin: 0 0 15px 0; color: #111827; font-size: 22px;">${eventData.eventName}</h2>
        ${eventData.date ? `<p style="margin: 8px 0; color: #4b5563;"><strong>📅 Tanggal:</strong> ${eventData.date}</p>` : ''}
        ${eventData.location ? `<p style="margin: 8px 0; color: #4b5563;"><strong>📍 Lokasi:</strong> ${eventData.location}</p>` : ''}
        ${eventData.tagline ? `<p style="margin: 12px 0 0 0; color: #111827; font-style: italic;">${eventData.tagline}</p>` : ''}
      </div>
    `
  }

  let registrationDataHTML = ''
  if (showRegistrationData && submissionData.fields) {
    const rows = submissionData.fields
      .map(
        (field) => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #6b7280; font-weight: 500;">${field.label}</td>
        <td style="padding: 10px; border-bottom: 1px solid #e5e7eb; color: #111827;">${field.value}</td>
      </tr>
    `,
      )
      .join('')

    registrationDataHTML = `
      <div style="margin: 20px 0;">
        <h3 style="margin: 0 0 15px 0; color: #111827; font-size: 18px;">Data Pendaftaran Anda</h3>
        <table style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
          ${rows}
        </table>
      </div>
    `
  }

  let paymentDetailsHTML = ''
  if (showPaymentDetails && paymentInfo.accountNumber) {
    paymentDetailsHTML = `
      <div style="background: #eff6ff; padding: 20px; border-radius: 12px; margin: 20px 0; border: 1px solid #bfdbfe;">
        <h3 style="margin: 0 0 15px 0; color: #1d4ed8; font-size: 18px;">Informasi Pembayaran</h3>
        <p style="margin: 8px 0; color: #1f2937;"><strong>Bank:</strong> ${paymentInfo.bankName || '-'}</p>
        <p style="margin: 8px 0; color: #1f2937;"><strong>No. Rekening:</strong> ${paymentInfo.accountNumber || '-'}</p>
        <p style="margin: 8px 0; color: #1f2937;"><strong>Atas Nama:</strong> ${paymentInfo.accountName || '-'}</p>
      </div>
    `
  }

  let instructionsHTML = ''
  if (instructions) {
    const resolvedInstructions = replaceVariables(String(instructions), variables)
    const instructionLines = resolvedInstructions
      .split('\n')
      .map((line) => `<p style="margin: 8px 0; color: #374151;">${line}</p>`)
      .join('')
    instructionsHTML = `
      <div style="background: #fef3c7; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin: 0 0 15px 0; color: #92400e; font-size: 18px;">Langkah Selanjutnya</h3>
        ${instructionLines}
      </div>
    `
  }

  const whatsappButtonHTML = showWhatsappButton && whatsappLink
    ? `
      <div style="margin: 28px 0; text-align: center;">
        <a href="${whatsappLink}" style="display: inline-block; background: #16a34a; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 999px; font-weight: 600; font-size: 15px;">${whatsappButtonText}</a>
      </div>
    `
    : ''

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${greeting}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: ${headerColor}; padding: 40px 30px; text-align: center;">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-width: 150px; height: auto; margin-bottom: 20px;" />` : ''}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${greeting}</h1>
    </div>
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.7;">${bodyText}</p>
      ${eventDetailsHTML}
      ${registrationDataHTML}
      ${paymentDetailsHTML}
      ${instructionsHTML}
      ${whatsappButtonHTML}
    </div>
    <div style="background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">${footerText}</p>
    </div>
  </div>
</body>
</html>
  `

  return replaceVariables(html, variables)
}

export async function sendParticipantEmail(emailConfig, eventData, submissionData) {
  const config = mergeEmailConfig(emailConfig, eventData)

  if (!config.enabled || !config.participantEmail.enabled) {
    return { skipped: true, reason: 'Participant email disabled' }
  }

  const resendClient = config.resendApiKey ? new Resend(config.resendApiKey) : resend
  if (!resendClient) {
    return { skipped: true, reason: 'Resend client not initialized' }
  }

  const participantEmail = submissionData.email || submissionData['email'] || null
  if (!participantEmail) {
    return { skipped: true, reason: 'Participant email not found in submission data' }
  }

  const participantName = submissionData['full-name'] || submissionData.name || 'Peserta'
  const whatsappMessage = `Halo, saya ingin konfirmasi pembayaran ${eventData.eventName}. Nama: ${participantName}. Email: ${participantEmail}. No. WhatsApp: ${submissionData.phone || ''}.`
  const whatsappLink = buildWhatsAppLink(config.paymentInfo.confirmWhatsapp, whatsappMessage)

  const variables = {
    eventName: eventData.eventName,
    eventDate: eventData.date,
    eventLocation: eventData.location,
    participantName,
    participantEmail,
    registrationId: submissionData.id,
    paymentBank: config.paymentInfo.bankName,
    paymentAccountNumber: config.paymentInfo.accountNumber,
    paymentAccountName: config.paymentInfo.accountName,
    confirmWhatsapp: config.paymentInfo.confirmWhatsapp,
    replyTo: config.replyTo,
    eventData,
    paymentInfo: config.paymentInfo,
    whatsappLink,
    submissionData: {
      ...submissionData,
      fields: extractSubmissionFields(eventData, submissionData),
    },
  }

  const subject = replaceVariables(config.participantEmail.subject, variables)
  const html = generateEmailHTML(config.participantEmail.template, variables)

  try {
    return await resendClient.emails.send({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: participantEmail,
      replyTo: config.replyTo,
      subject,
      html,
    })
  } catch (error) {
    console.error('Failed to send participant email:', error)
    return { error: true, message: error.message }
  }
}

export async function sendAdminNotification(emailConfig, eventData, submissionData) {
  const config = mergeEmailConfig(emailConfig, eventData)

  if (!config.enabled || !config.adminEmail.enabled) {
    return { skipped: true, reason: 'Admin email disabled' }
  }

  const resendClient = config.resendApiKey ? new Resend(config.resendApiKey) : resend
  if (!resendClient) {
    return { skipped: true, reason: 'Resend client not initialized' }
  }

  const adminEmail = config.adminEmail.recipient || process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return { skipped: true, reason: 'Admin email recipient not configured' }
  }

  const variables = {
    eventName: eventData.eventName,
    participantName: submissionData['full-name'] || submissionData.name || 'Peserta',
    participantEmail: submissionData.email || submissionData['email'] || '',
    registrationId: submissionData.id,
    replyTo: config.replyTo,
    eventData,
    paymentInfo: config.paymentInfo,
    whatsappLink: '',
    submissionData: {
      ...submissionData,
      fields: extractSubmissionFields(eventData, submissionData),
    },
  }

  const subject = replaceVariables(config.adminEmail.subject, variables)
  const html = generateEmailHTML(config.adminEmail.template, variables)

  try {
    return await resendClient.emails.send({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: adminEmail,
      replyTo: config.replyTo,
      subject,
      html,
    })
  } catch (error) {
    console.error('Failed to send admin email:', error)
    return { error: true, message: error.message }
  }
}

export async function sendPaymentConfirmedVoucherEmail(emailConfig, eventData, submissionData) {
  const config = mergeEmailConfig(emailConfig, eventData)

  if (!config.enabled) {
    return { skipped: true, reason: 'Email disabled' }
  }

  const resendClient = config.resendApiKey ? new Resend(config.resendApiKey) : resend
  if (!resendClient) {
    return { skipped: true, reason: 'Resend client not initialized' }
  }

  const participantEmail = submissionData.email || submissionData['email'] || null
  if (!participantEmail) {
    return { skipped: true, reason: 'Participant email not found in submission data' }
  }

  const participantName = submissionData['full-name'] || submissionData.name || 'Peserta'
  const voucherCode = submissionData.voucherCode || generateVoucherCode(submissionData.id)

  // Build voucher assets with retry logic
  let voucherAssets
  try {
    voucherAssets = await buildVoucherAssets({
      eventName: eventData.eventName,
      submissionId: submissionData.id,
      voucherCode,
    })
  } catch (error) {
    console.error('[sendPaymentConfirmedVoucherEmail] Failed to build voucher assets:', error)
    return { error: true, message: `Failed to generate voucher QR code: ${error.message}` }
  }

  const { qrCodeBuffer } = voucherAssets

  // Email subject and body
  const subject = `Pembayaran Terkonfirmasi - ${eventData.eventName}`
  const emailBody = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Pembayaran Terkonfirmasi!</h1>
    </div>
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.7;">
        Halo <strong>${participantName}</strong>,
      </p>
      <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.7;">
        Pembayaran Anda untuk <strong>${eventData.eventName}</strong> telah dikonfirmasi oleh admin. Berikut adalah e-voucher Anda:
      </p>
      <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <div style="text-align: center; margin-bottom: 16px;">
          <span style="display: inline-block; background: #10b981; color: white; padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 600;">✓ LUNAS</span>
        </div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Nama Peserta</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${participantName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Kode Voucher</td>
            <td style="padding: 8px 0; color: #667eea; font-size: 16px; font-weight: 700; text-align: right; letter-spacing: 1px;">${voucherCode}</td>
          </tr>
          ${eventData.date ? `<tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Tanggal Event</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${eventData.date}</td>
          </tr>` : ''}
          ${eventData.location ? `<tr>
            <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Lokasi</td>
            <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${eventData.location}</td>
          </tr>` : ''}
        </table>
      </div>
      <div style="text-align: center; padding: 30px 0; background: #f9fafb; margin: 20px -30px;">
        <h3 style="font-size: 16px; color: #374151; margin: 0 0 16px 0;">Scan QR Code saat Check-in</h3>
        <div style="display: inline-block; padding: 16px; background: white; border-radius: 8px;">
          <img src="cid:voucher-qr" alt="QR Code" width="250" height="250" style="display: block;" />
        </div>
      </div>
      <p style="margin: 20px 0 0 0; color: #374151; font-size: 14px; line-height: 1.7;">
        QR code juga dilampirkan sebagai file gambar. Simpan e-voucher dan tunjukkan saat check-in event.
      </p>
    </div>
    <div style="background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
        Jika ada pertanyaan, silakan hubungi panitia.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()

  try {
    return await resendClient.emails.send({
      from: `${config.fromName} <${config.fromEmail}>`,
      to: participantEmail,
      replyTo: config.replyTo,
      subject,
      html: emailBody,
      attachments: [
        {
          filename: `voucher-qr-${voucherCode}.png`,
          content: qrCodeBuffer.toString('base64'),
          contentType: 'image/png',
          contentId: 'voucher-qr',
        },
      ],
    })
  } catch (error) {
    console.error('[sendPaymentConfirmedVoucherEmail] Failed to send email:', error)
    return { error: true, message: error.message }
  }
}

export async function sendTestEmail(emailConfig, eventData, testRecipient, emailType = 'participant') {
  const mockSubmissionData = {
    id: `TEST-${Date.now()}`,
    'full-name': 'John Doe (Test)',
    email: testRecipient,
    phone: '081234567890',
    'tshirt-size': 'L',
  }

  if (emailType === 'participant') {
    return sendParticipantEmail(emailConfig, eventData, mockSubmissionData)
  }

  return sendAdminNotification(emailConfig, eventData, mockSubmissionData)
}
