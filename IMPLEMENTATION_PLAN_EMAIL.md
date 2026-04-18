# Implementation Plan: Email Notification System

## Overview
Implementasi sistem email notification setelah pendaftaran berhasil, dengan konfigurasi desain email yang dapat diatur dari admin dashboard.

## Tech Stack
- **Email Service**: Resend API (free tier: 100 emails/day)
- **Template**: Rich HTML dengan styling, logo, colors
- **Recipients**: Peserta (konfirmasi) + Admin (notifikasi)
- **Content**: Data pendaftaran + Info event + Instruksi selanjutnya

---

## 1. Backend Implementation

### 1.1 Install Dependencies
```bash
npm install resend
```

### 1.2 Environment Variables (.env)
```env
# Resend API
RESEND_API_KEY=re_xxxxxxxxxxxxx
ADMIN_EMAIL=admin@yourdomain.com
```

### 1.3 Email Configuration Schema (server/defaultSchema.js)
Tambahkan ke `defaultSchema`:
```javascript
emailConfig: {
  enabled: false,
  fromName: 'City Marathon 2026',
  fromEmail: 'noreply@yourdomain.com',
  replyTo: 'support@yourdomain.com',
  
  // Email ke peserta
  participantEmail: {
    enabled: true,
    subject: 'Konfirmasi Pendaftaran - {{eventName}}',
    template: {
      headerColor: '#2563eb',
      logoUrl: '',
      greeting: 'Terima kasih telah mendaftar!',
      bodyText: 'Pendaftaran Anda untuk {{eventName}} telah kami terima.',
      instructions: 'Langkah selanjutnya:\n1. Cek email ini sebagai bukti pendaftaran\n2. Simpan nomor registrasi Anda\n3. Tunggu konfirmasi pembayaran dari tim kami',
      footerText: 'Jika ada pertanyaan, hubungi kami di {{replyTo}}',
      showEventDetails: true,
      showRegistrationData: true,
    }
  },
  
  // Email ke admin
  adminEmail: {
    enabled: true,
    subject: 'Pendaftaran Baru - {{participantName}}',
    template: {
      headerColor: '#059669',
      greeting: 'Pendaftaran baru diterima',
      bodyText: 'Ada peserta baru yang mendaftar untuk {{eventName}}.',
      showRegistrationData: true,
    }
  }
}
```

### 1.4 Email Service Module (server/emailService.js)
File baru untuk handle email sending:
```javascript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendParticipantEmail(emailConfig, eventData, submissionData) {
  // Generate HTML template
  // Send via Resend API
}

export async function sendAdminNotification(emailConfig, eventData, submissionData) {
  // Generate HTML template
  // Send via Resend API
}

export function generateEmailHTML(template, data) {
  // Build rich HTML email with inline CSS
  // Support variables: {{eventName}}, {{participantName}}, etc.
}

export async function sendTestEmail(emailConfig, testRecipient) {
  // For testing from admin dashboard
}
```

### 1.5 Storage Integration (server/store.js)
Tambahkan fungsi untuk save/get email config:
```javascript
export async function getEmailConfig()
export async function saveEmailConfig(config)
```

### 1.6 API Endpoints (server/index.js)

**GET /api/email-config** - Get email configuration
```javascript
app.get('/api/email-config', requireAuth, async (req, res) => {
  const config = await getEmailConfig()
  res.json(config)
})
```

**PUT /api/email-config** - Update email configuration
```javascript
app.put('/api/email-config', requireAuth, csrfProtect, async (req, res) => {
  const config = await saveEmailConfig(req.body)
  res.json(config)
})
```

**POST /api/email-config/test** - Send test email
```javascript
app.post('/api/email-config/test', requireAuth, csrfProtect, async (req, res) => {
  const { recipient, type } = req.body // type: 'participant' or 'admin'
  await sendTestEmail(emailConfig, recipient, type)
  res.json({ success: true })
})
```

### 1.7 Integration with Submission Endpoint
Update `/api/submissions` POST handler:
```javascript
app.post('/api/submissions', submissionRateLimit, async (req, res) => {
  // ... existing validation ...
  
  const savedEntry = await addSubmission(newEntry)
  
  // Send emails if enabled
  const emailConfig = await getEmailConfig()
  if (emailConfig.enabled) {
    try {
      if (emailConfig.participantEmail.enabled) {
        await sendParticipantEmail(emailConfig, schema, savedEntry)
      }
      if (emailConfig.adminEmail.enabled) {
        await sendAdminNotification(emailConfig, schema, savedEntry)
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError)
      // Don't fail the submission if email fails
    }
  }
  
  res.json(savedEntry)
})
```

---

## 2. Frontend Implementation

### 2.1 Admin Dashboard - New Tab "Email Settings"
Location: `src/App.jsx`

Add new sidebar button:
```jsx
<button
  className={adminTab === 'email' ? 'sidebar-btn active' : 'sidebar-btn'}
  onClick={() => setAdminTab('email')}
>
  <svg>...</svg>
  Email Settings
</button>
```

### 2.2 Email Settings Panel
New section in admin dashboard:
```jsx
{adminTab === 'email' && (
  <section className="admin-panel">
    <div className="panel-head">
      <h3>Email Notification Settings</h3>
      <p>Konfigurasi email otomatis setelah pendaftaran berhasil</p>
    </div>
    
    {/* Master Toggle */}
    <label className="toggle-field">
      <input type="checkbox" checked={emailConfig.enabled} />
      <span>Aktifkan Email Notification</span>
    </label>
    
    {/* General Settings */}
    <div className="admin-form-section">
      <h4>Pengaturan Umum</h4>
      <label>From Name: <input /></label>
      <label>From Email: <input /></label>
      <label>Reply To: <input /></label>
    </div>
    
    {/* Participant Email Settings */}
    <div className="admin-form-section">
      <h4>Email ke Peserta</h4>
      <label className="toggle-field">
        <input type="checkbox" />
        <span>Kirim email konfirmasi ke peserta</span>
      </label>
      
      <label>Subject: <input /></label>
      <label>Header Color: <input type="color" /></label>
      <label>Logo URL: <input /></label>
      <label>Greeting: <input /></label>
      <label>Body Text: <textarea /></label>
      <label>Instruksi Selanjutnya: <textarea rows="5" /></label>
      <label>Footer Text: <textarea /></label>
      
      <label className="toggle-field">
        <input type="checkbox" />
        <span>Tampilkan detail event</span>
      </label>
      <label className="toggle-field">
        <input type="checkbox" />
        <span>Tampilkan data pendaftaran</span>
      </label>
    </div>
    
    {/* Admin Email Settings */}
    <div className="admin-form-section">
      <h4>Email ke Admin</h4>
      <label className="toggle-field">
        <input type="checkbox" />
        <span>Kirim notifikasi ke admin</span>
      </label>
      
      <label>Subject: <input /></label>
      <label>Header Color: <input type="color" /></label>
    </div>
    
    {/* Email Preview */}
    <div className="email-preview-card">
      <h4>Preview Email</h4>
      <div className="preview-tabs">
        <button>Peserta</button>
        <button>Admin</button>
      </div>
      <iframe className="email-preview-frame" />
    </div>
    
    {/* Test Email */}
    <div className="test-email-section">
      <h4>Test Email</h4>
      <label>
        Email Tujuan: <input type="email" />
      </label>
      <button onClick={handleSendTestEmail}>
        Kirim Test Email
      </button>
    </div>
    
    {/* Save Button */}
    <button className="primary-btn" onClick={handleSaveEmailConfig}>
      Simpan Pengaturan Email
    </button>
  </section>
)}
```

### 2.3 State Management
Add to App.jsx state:
```javascript
const [emailConfig, setEmailConfig] = useState(null)
const [emailPreviewType, setEmailPreviewType] = useState('participant')
```

### 2.4 API Integration Functions
```javascript
async function loadEmailConfig() {
  const response = await apiFetch('/api/email-config')
  setEmailConfig(await response.json())
}

async function handleSaveEmailConfig() {
  await apiFetch('/api/email-config', {
    method: 'PUT',
    body: JSON.stringify(emailConfig)
  })
  setMessage('Pengaturan email berhasil disimpan')
}

async function handleSendTestEmail() {
  await apiFetch('/api/email-config/test', {
    method: 'POST',
    body: JSON.stringify({
      recipient: testEmailRecipient,
      type: emailPreviewType
    })
  })
  setMessage('Test email berhasil dikirim')
}
```

---

## 3. Email Template Design

### 3.1 HTML Structure
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Inline CSS for email compatibility */
    body { font-family: Arial, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; }
    .header { background: {{headerColor}}; padding: 20px; }
    /* ... more styles ... */
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if logoUrl}}<img src="{{logoUrl}}" />{{/if}}
      <h1>{{greeting}}</h1>
    </div>
    
    <div class="content">
      <p>{{bodyText}}</p>
      
      {{#if showEventDetails}}
      <div class="event-details">
        <h2>{{eventName}}</h2>
        <p>📅 {{eventDate}}</p>
        <p>📍 {{eventLocation}}</p>
      </div>
      {{/if}}
      
      {{#if showRegistrationData}}
      <div class="registration-data">
        <h3>Data Pendaftaran Anda</h3>
        <table>
          {{#each fields}}
          <tr>
            <td>{{label}}</td>
            <td>{{value}}</td>
          </tr>
          {{/each}}
        </table>
      </div>
      {{/if}}
      
      {{#if instructions}}
      <div class="instructions">
        <h3>Langkah Selanjutnya</h3>
        <pre>{{instructions}}</pre>
      </div>
      {{/if}}
    </div>
    
    <div class="footer">
      <p>{{footerText}}</p>
    </div>
  </div>
</body>
</html>
```

### 3.2 Variable Substitution
Support template variables:
- `{{eventName}}` - Nama event
- `{{eventDate}}` - Tanggal event
- `{{eventLocation}}` - Lokasi event
- `{{participantName}}` - Nama peserta
- `{{participantEmail}}` - Email peserta
- `{{registrationId}}` - ID pendaftaran
- `{{replyTo}}` - Email reply-to
- Custom fields dari form

---

## 4. Supabase Storage Integration

### 4.1 Database Schema
Add to Supabase `event_config` table:
```sql
ALTER TABLE event_config 
ADD COLUMN email_config JSONB DEFAULT '{
  "enabled": false,
  "fromName": "",
  "fromEmail": "",
  "replyTo": "",
  "participantEmail": {...},
  "adminEmail": {...}
}'::jsonb;
```

### 4.2 Storage Functions (server/supabaseStorage.js)
```javascript
export async function getSupabaseEmailConfig(defaultConfig) {
  // Fetch from event_config table
}

export async function saveSupabaseEmailConfig(config) {
  // Update event_config table
}
```

---

## 5. Testing Plan

### 5.1 Unit Tests
- Email template generation
- Variable substitution
- HTML sanitization

### 5.2 Integration Tests
- Send test email via Resend
- Verify email delivery
- Test with/without logo
- Test with different configurations

### 5.3 Manual Testing Checklist
- [ ] Enable email notification
- [ ] Configure participant email template
- [ ] Configure admin email template
- [ ] Send test email to participant
- [ ] Send test email to admin
- [ ] Submit real registration form
- [ ] Verify both emails received
- [ ] Check email rendering in Gmail/Outlook
- [ ] Test with email disabled
- [ ] Test with missing RESEND_API_KEY

---

## 6. Security Considerations

1. **API Key Protection**: Store RESEND_API_KEY in environment variables only
2. **Rate Limiting**: Already implemented for submissions
3. **Email Validation**: Validate recipient emails before sending
4. **HTML Sanitization**: Sanitize user input in email templates
5. **CSRF Protection**: Already implemented for admin endpoints
6. **Error Handling**: Don't expose API errors to users

---

## 7. Deployment Steps

### 7.1 Vercel Environment Variables
Add to Vercel dashboard:
```
RESEND_API_KEY=re_xxxxxxxxxxxxx
ADMIN_EMAIL=admin@yourdomain.com
```

### 7.2 Resend Setup
1. Sign up at https://resend.com
2. Verify domain (optional, for custom from email)
3. Get API key from dashboard
4. Test with free tier (100 emails/day)

### 7.3 Database Migration
Run SQL migration on Supabase to add email_config column

---

## 8. Documentation

### 8.1 Admin Guide
- How to enable email notifications
- How to customize email templates
- How to send test emails
- Troubleshooting common issues

### 8.2 Developer Guide
- Email service architecture
- Template variable reference
- Adding new email types
- Debugging email delivery

---

## 9. Future Enhancements

- [ ] Email templates library (multiple pre-designed templates)
- [ ] Attachment support (PDF confirmation)
- [ ] Email scheduling (reminder emails)
- [ ] Email analytics (open rate, click rate)
- [ ] Multi-language support
- [ ] Rich text editor for email body
- [ ] Email queue system for bulk sending

---

## 10. Implementation Order

1. **Phase 1: Backend Foundation** (2-3 hours)
   - Install Resend
   - Create email service module
   - Add email config to schema
   - Implement basic email sending

2. **Phase 2: Email Templates** (2-3 hours)
   - Design HTML email template
   - Implement variable substitution
   - Test email rendering

3. **Phase 3: Admin Dashboard** (3-4 hours)
   - Add Email Settings tab
   - Build configuration UI
   - Implement preview functionality
   - Add test email feature

4. **Phase 4: Integration** (1-2 hours)
   - Connect to submission endpoint
   - Add Supabase storage support
   - Error handling

5. **Phase 5: Testing & Polish** (2-3 hours)
   - Manual testing
   - Fix bugs
   - Documentation
   - Deploy to production

**Total Estimated Time: 10-15 hours**

---

## Files to Create/Modify

### New Files
- `server/emailService.js` - Email sending logic
- `server/emailTemplates.js` - HTML template generation

### Modified Files
- `server/index.js` - Add email endpoints and integration
- `server/store.js` - Add email config storage functions
- `server/supabaseStorage.js` - Add Supabase email config functions
- `server/defaultSchema.js` - Add emailConfig to default schema
- `src/App.jsx` - Add Email Settings tab and UI
- `package.json` - Add resend dependency
- `.env.example` - Add email environment variables

### Database Changes
- Supabase: Add email_config column to event_config table
