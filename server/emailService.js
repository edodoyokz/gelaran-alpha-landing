import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/**
 * Replace template variables with actual values
 * Supports: {{variableName}} syntax
 */
function replaceVariables(template, variables) {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`{{${key}}}`, 'g')
    result = result.replace(regex, value || '')
  }
  return result
}

/**
 * Generate HTML email template
 */
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
  } = templateConfig

  const { eventData = {}, submissionData = {} } = variables

  // Build event details section
  let eventDetailsHTML = ''
  if (showEventDetails && eventData.eventName) {
    eventDetailsHTML = `
      <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin: 0 0 15px 0; color: #111827; font-size: 20px;">${eventData.eventName}</h2>
        ${eventData.date ? `<p style="margin: 8px 0; color: #4b5563;"><strong>📅 Tanggal:</strong> ${eventData.date}</p>` : ''}
        ${eventData.location ? `<p style="margin: 8px 0; color: #4b5563;"><strong>📍 Lokasi:</strong> ${eventData.location}</p>` : ''}
        ${eventData.description ? `<p style="margin: 12px 0 0 0; color: #6b7280; line-height: 1.6;">${eventData.description}</p>` : ''}
      </div>
    `
  }

  // Build registration data section
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

  // Build instructions section
  let instructionsHTML = ''
  if (instructions) {
    const instructionLines = instructions.split('\n').map((line) => `<p style="margin: 8px 0; color: #374151;">${line}</p>`).join('')
    instructionsHTML = `
      <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin: 0 0 15px 0; color: #92400e; font-size: 18px;">Langkah Selanjutnya</h3>
        ${instructionLines}
      </div>
    `
  }

  // Build complete HTML
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
    <!-- Header -->
    <div style="background: ${headerColor}; padding: 40px 30px; text-align: center;">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-width: 150px; height: auto; margin-bottom: 20px;" />` : ''}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">${greeting}</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 30px;">
      <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px; line-height: 1.6;">${bodyText}</p>
      
      ${eventDetailsHTML}
      ${registrationDataHTML}
      ${instructionsHTML}
    </div>
    
    <!-- Footer -->
    <div style="background: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.6;">${footerText}</p>
    </div>
  </div>
</body>
</html>
  `

  // Replace variables in the final HTML
  return replaceVariables(html, variables)
}

/**
 * Send confirmation email to participant
 */
export async function sendParticipantEmail(emailConfig, eventData, submissionData) {
  // Validate email config exists
  if (!emailConfig || !emailConfig.participantEmail) {
    return { skipped: true, reason: 'Email config not configured' }
  }

  if (!emailConfig.participantEmail.enabled) {
    return { skipped: true, reason: 'Participant email disabled' }
  }

  // Check if Resend API key is configured
  if (!emailConfig.resendApiKey && !process.env.RESEND_API_KEY) {
    return { skipped: true, reason: 'Resend API key not configured' }
  }

  // Initialize Resend with config API key if not already initialized
  const resendClient = emailConfig.resendApiKey ? new Resend(emailConfig.resendApiKey) : resend
  if (!resendClient) {
    return { skipped: true, reason: 'Resend client not initialized' }
  }

  const participantEmailField = submissionData.email || submissionData['email'] || null
  if (!participantEmailField) {
    return { skipped: true, reason: 'Participant email not found in submission data' }
  }

  // Prepare variables for template
  const variables = {
    eventName: eventData.eventName,
    eventDate: eventData.date,
    eventLocation: eventData.location,
    eventDescription: eventData.description,
    participantName: submissionData['full-name'] || submissionData.name || 'Peserta',
    participantEmail: participantEmailField,
    registrationId: submissionData.id,
    replyTo: emailConfig.replyTo,
    eventData,
    submissionData: {
      ...submissionData,
      fields: Object.entries(submissionData)
        .filter(([key]) => !key.startsWith('_') && key !== 'id' && key !== 'timestamp')
        .map(([key, value]) => {
          // Find label from schema if available
          const field = eventData.fields?.find((f) => f.id === key)
          return {
            label: field?.label || key,
            value: typeof value === 'boolean' ? (value ? 'Ya' : 'Tidak') : value,
          }
        }),
    },
  }

  const subject = replaceVariables(emailConfig.participantEmail.subject, variables)
  const html = generateEmailHTML(emailConfig.participantEmail.template, variables)

  try {
    const result = await resendClient.emails.send({
      from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
      to: participantEmailField,
      replyTo: emailConfig.replyTo,
      subject,
      html,
    })

    return result
  } catch (error) {
    console.error('Failed to send participant email:', error)
    return { error: true, message: error.message }
  }
}

/**
 * Send notification email to admin
 */
export async function sendAdminNotification(emailConfig, eventData, submissionData) {
  // Validate email config exists
  if (!emailConfig || !emailConfig.adminEmail) {
    return { skipped: true, reason: 'Email config not configured' }
  }

  if (!emailConfig.adminEmail.enabled) {
    return { skipped: true, reason: 'Admin email disabled' }
  }

  // Check if Resend API key is configured
  if (!emailConfig.resendApiKey && !process.env.RESEND_API_KEY) {
    return { skipped: true, reason: 'Resend API key not configured' }
  }

  // Initialize Resend with config API key if not already initialized
  const resendClient = emailConfig.resendApiKey ? new Resend(emailConfig.resendApiKey) : resend
  if (!resendClient) {
    return { skipped: true, reason: 'Resend client not initialized' }
  }

  const adminEmail = emailConfig.adminEmail.recipient || process.env.ADMIN_EMAIL
  if (!adminEmail) {
    return { skipped: true, reason: 'Admin email recipient not configured' }
  }

  // Prepare variables for template
  const variables = {
    eventName: eventData.eventName,
    eventDate: eventData.date,
    eventLocation: eventData.location,
    participantName: submissionData['full-name'] || submissionData.name || 'Peserta',
    participantEmail: submissionData.email || submissionData['email'] || '',
    registrationId: submissionData.id,
    replyTo: emailConfig.replyTo,
    eventData,
    submissionData: {
      ...submissionData,
      fields: Object.entries(submissionData)
        .filter(([key]) => !key.startsWith('_') && key !== 'id' && key !== 'timestamp')
        .map(([key, value]) => {
          const field = eventData.fields?.find((f) => f.id === key)
          return {
            label: field?.label || key,
            value: typeof value === 'boolean' ? (value ? 'Ya' : 'Tidak') : value,
          }
        }),
    },
  }

  const subject = replaceVariables(emailConfig.adminEmail.subject, variables)
  const html = generateEmailHTML(emailConfig.adminEmail.template, variables)

  try {
    const result = await resendClient.emails.send({
      from: `${emailConfig.fromName} <${emailConfig.fromEmail}>`,
      to: adminEmail,
      replyTo: emailConfig.replyTo,
      subject,
      html,
    })

    return result
  } catch (error) {
    console.error('Failed to send admin notification:', error)
    return { error: true, message: error.message }
  }
}

/**
 * Send test email
 */
export async function sendTestEmail(emailConfig, eventData, testRecipient, emailType = 'participant') {
  // Validate email config exists
  if (!emailConfig) {
    return { error: true, message: 'Email config not configured' }
  }

  // Check if Resend API key is configured
  if (!emailConfig.resendApiKey && !process.env.RESEND_API_KEY) {
    return { error: true, message: 'Resend API key not configured' }
  }

  if (!testRecipient) {
    return { error: true, message: 'Test recipient email is required' }
  }

  // Create mock submission data for testing
  const mockSubmissionData = {
    id: 'TEST-' + Date.now(),
    timestamp: new Date().toISOString(),
    'full-name': 'John Doe (Test)',
    email: testRecipient,
    phone: '081234567890',
    category: 'Umum',
    motivation: 'Ini adalah test email untuk melihat tampilan email yang akan dikirim ke peserta.',
  }

  try {
    if (emailType === 'participant') {
      return await sendParticipantEmail(emailConfig, eventData, mockSubmissionData)
    } else {
      return await sendAdminNotification(emailConfig, eventData, mockSubmissionData)
    }
  } catch (error) {
    console.error('Failed to send test email:', error)
    return { error: true, message: error.message }
  }
}
