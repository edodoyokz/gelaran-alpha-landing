import 'dotenv/config'
import bcrypt from 'bcrypt'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { createAdminSessionToken, verifyAdminSessionToken } from './adminAuth.js'
import { validateEventSchema, validateSubmission } from '../shared/validation.js'
import {
  getSubmissions,
  addSubmission,
  deleteSubmission,
  updateSubmissionPaymentStatus,
  updateSubmissionVoucherSent,
  getSchema,
  saveSchema,
  getEmailConfig,
  saveEmailConfig,
  checkDuplicateSubmission,
  extractIdentity,
} from './store.js'
import { isR2StorageEnabled, uploadR2File } from './r2Storage.js'
import { isSupabaseEnabled } from './supabaseStorage.js'
import { sendParticipantEmail, sendAdminNotification, sendTestEmail, sendPaymentConfirmedVoucherEmail } from './emailService.js'
import { buildEmailSubmissionData } from './emailPayload.js'

// CSRF Protection Middleware
function createCsrfMiddleware() {
  function generateCsrfToken(sessionId) {
    if (!sessionId) return null

    return crypto
      .createHmac('sha256', sessionSecret)
      .update(`csrf:${sessionId}`)
      .digest('hex')
  }

  function validateCsrfToken(sessionId, token) {
    if (!sessionId || !token) return false

    const expectedToken = generateCsrfToken(sessionId)
    if (!expectedToken) return false

    const providedToken = String(token)
    if (providedToken.length !== expectedToken.length) {
      return false
    }

    return crypto.timingSafeEqual(Buffer.from(expectedToken), Buffer.from(providedToken))
  }

  return {
    generateToken: (req, res, next) => {
      if (isAuthenticated(req)) {
        const sessionId = req.cookies.admin_session
        const token = generateCsrfToken(sessionId)
        res.locals.csrfToken = token
      }
      next()
    },
    validateToken: (req, res, next) => {
      if (!isAuthenticated(req)) {
        return next()
      }

      const sessionId = req.cookies.admin_session
      const token = req.headers['x-csrf-token'] || req.body._csrf

      if (!token || !validateCsrfToken(sessionId, token)) {
        const expectedToken = generateCsrfToken(sessionId)
        console.warn('[CSRF] Invalid CSRF token', {
          ip: req.ip,
          path: req.path,
          hasSession: Boolean(sessionId),
          hasHeaderToken: Boolean(req.headers['x-csrf-token']),
          providedTokenPreview: String(token || '').slice(0, 8),
          expectedTokenPreview: String(expectedToken || '').slice(0, 8),
        })
        return res.status(403).json({ message: 'Invalid CSRF token' })
      }

      next()
    }
  }
}

const port = process.env.PORT || 3001
const uploadsDir = path.resolve('public/uploads')
const adminUsername = process.env.ADMIN_USERNAME
const adminPassword = process.env.ADMIN_PASSWORD
const sessionSecret = process.env.SESSION_SECRET
const cookieSecure = process.env.COOKIE_SECURE === 'true'
const adminSessionMaxAgeMs = 1000 * 60 * 60 * 8
const isVercelRuntime = Boolean(process.env.VERCEL)

// Validate required environment variables
function validateEnvironment() {
  const required = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'SESSION_SECRET']
  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '))
    console.error('Please set these variables in your .env file or environment.')
    process.exit(1)
  }

  // Validate session secret strength in production
  if (process.env.NODE_ENV === 'production' && sessionSecret.length < 32) {
    console.error('❌ SESSION_SECRET must be at least 32 characters long in production')
    process.exit(1)
  }
}

validateEnvironment()

if (!isVercelRuntime) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Hanya file gambar yang diperbolehkan.'))
    }
  }
})

function isAuthenticated(req) {
  const token = req.cookies.admin_session
  return Boolean(
    verifyAdminSessionToken({
      token,
      secret: sessionSecret,
    }),
  )
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    res.status(401).json({ message: 'Unauthorized' })
    return
  }

  next()
}

function filterSubmissions(submissions, query, filter) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const todayIso = new Date().toISOString().slice(0, 10)

  return submissions.filter((submission) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      submission.answers.some(
        (answer) =>
          answer.label.toLowerCase().includes(normalizedQuery) ||
          String(answer.value).toLowerCase().includes(normalizedQuery),
      )

    const matchesFilter =
      filter === 'all' ||
      !filter ||
      (filter === 'today' && String(submission.submittedAtIso || '').startsWith(todayIso)) ||
      (filter === 'withEmail' &&
        submission.answers.some((answer) => answer.label.toLowerCase().includes('email')))

    return matchesQuery && matchesFilter
  })
}

function ensureStorageInVercel(res) {
  if (isVercelRuntime && !isSupabaseEnabled()) {
    res.status(500).json({
      message: 'Supabase storage wajib aktif saat berjalan di Vercel.',
    })
    return false
  }

  return true
}

export function createApp() {
  const app = express()

  // Trust proxy when behind a reverse proxy (Vercel, nginx, etc.)
  // Required for express-rate-limit to read the real client IP from X-Forwarded-For
  app.set('trust proxy', 1)

  // CSRF Protection
  const csrf = createCsrfMiddleware()

  // Rate limiting - auth endpoints
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 attempts per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' },
    handler: (req, res, _next, options) => {
      console.warn(`[AUTH] Rate limit hit — IP: ${req.ip}, Path: ${req.path}`)
      res.status(options.statusCode).json(options.message)
    },
  })

  // Rate limiting - general API
  const generalRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Terlalu banyak request. Coba lagi sesaat.' },
    skip: (req) => req.path === '/api/health',
  })

  // Rate limiting - submissions (anti-bot)
  const submissionRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 menit
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Terlalu banyak pendaftaran. Coba lagi dalam 15 menit.' },
  })

  // CORS configuration - more restrictive for production
  const corsOptions = {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true)

      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:4173',
      ]

      // In production, only allow specific origins
      if (process.env.NODE_ENV === 'production') {
        const productionOrigins = process.env.ALLOWED_ORIGINS?.split(',') || []
        allowedOrigins.push(...productionOrigins)
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  }

  app.use(cors(corsOptions))
  app.use(cookieParser())
  app.use(express.json({ limit: '10mb' }))

  if (!isVercelRuntime) {
    app.use('/uploads', express.static(uploadsDir))
    app.use(express.static('public'))
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, storageMode: getStorageMode() })
  })

  app.use(generalRateLimit)

  app.get('/api/auth/session', csrf.generateToken, (req, res) => {
    res.json({
      authenticated: isAuthenticated(req),
      csrfToken: res.locals.csrfToken
    })
  })

  app.post('/api/auth/login', authRateLimit, async (req, res) => {
    const { username, password } = req.body

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ message: 'Username dan password wajib diisi.' })
      return
    }

    if (username !== adminUsername || !await bcrypt.compare(password, hashedAdminPassword)) {
      console.warn(`[AUTH] Failed login attempt — IP: ${req.ip}, username: ${username}`)
      res.status(401).json({ message: 'Username atau password salah.' })
      return
    }

    console.info(`[AUTH] Successful login — IP: ${req.ip}, username: ${username}`)

    const token = createAdminSessionToken({
      username: adminUsername,
      secret: sessionSecret,
      maxAgeMs: adminSessionMaxAgeMs,
    })

    res.cookie('admin_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: adminSessionMaxAgeMs,
      path: '/',
    })

    res.json({ authenticated: true })
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.clearCookie('admin_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      path: '/',
    })
    res.json({ authenticated: false })
  })

  app.get('/api/schema', async (_req, res) => {
    res.json(await getSchema())
  })

  app.put('/api/schema', requireAdmin, csrf.validateToken, async (req, res) => {
    if (!ensureStorageInVercel(res)) return

    // Validate schema data
    try {
      validateEventSchema(req.body)
    } catch (error) {
      return res.status(400).json({ message: error.message })
    }

    const saved = await saveSchema(req.body)
    res.json(saved)
  })

  app.get('/api/email-config', requireAdmin, async (_req, res) => {
    res.json(await getEmailConfig())
  })

  app.put('/api/email-config', requireAdmin, csrf.validateToken, async (req, res) => {
    if (!ensureStorageInVercel(res)) return

    const saved = await saveEmailConfig(req.body)
    res.json(saved)
  })

  app.post('/api/email-config/test', requireAdmin, csrf.validateToken, async (req, res) => {
    if (!ensureStorageInVercel(res)) return

    const { recipient, emailType } = req.body

    if (!recipient || typeof recipient !== 'string') {
      return res.status(400).json({ message: 'Email recipient wajib diisi.' })
    }

    try {
      const emailConfig = await getEmailConfig()
      const schema = await getSchema()
      const result = await sendTestEmail(emailConfig, schema, recipient, emailType)
      res.json({ success: true, result })
    } catch (error) {
      console.error('[EMAIL] Test email failed:', error)
      res.status(500).json({ message: error.message || 'Gagal mengirim test email.' })
    }
  })

  app.get('/api/submissions', requireAdmin, async (_req, res) => {
    res.json(await getSubmissions())
  })

  app.delete('/api/submissions/:id', requireAdmin, csrf.validateToken, async (req, res) => {
    if (!ensureStorageInVercel(res)) return
    const deleted = await deleteSubmission(req.params.id)

    if (!deleted) {
      res.status(404).json({ message: 'Data peserta tidak ditemukan.' })
      return
    }

    res.json({ success: true })
  })

  app.patch('/api/submissions/:id/payment-status', requireAdmin, csrf.validateToken, async (req, res) => {
    if (!ensureStorageInVercel(res)) return
    
    const { paymentStatus } = req.body
    
    if (!paymentStatus || !['registered', 'paid'].includes(paymentStatus)) {
      res.status(400).json({ message: 'Status pembayaran tidak valid.' })
      return
    }

    const updated = await updateSubmissionPaymentStatus(req.params.id, paymentStatus)

    if (!updated) {
      res.status(404).json({ message: 'Data peserta tidak ditemukan.' })
      return
    }

    // Send e-voucher email when payment is confirmed
    let emailDeliveryWarning = null
    if (paymentStatus === 'paid') {
      try {
        const schema = await getSchema()
        const emailConfig = await getEmailConfig()
        
        // Prepare submission data for email using helper to extract fields from answers
        const submissionData = buildEmailSubmissionData(updated)
        
        const emailResult = await sendPaymentConfirmedVoucherEmail(emailConfig, schema, submissionData)
        
        if (emailResult.error) {
          console.error('[payment-status] E-voucher email failed:', emailResult.message || emailResult.error)
          emailDeliveryWarning = `Status pembayaran berhasil diubah, tetapi email e-voucher gagal dikirim: ${emailResult.message || 'Unknown error'}`
        } else if (emailResult.skipped) {
          console.warn('[payment-status] E-voucher email skipped:', emailResult.reason)
          emailDeliveryWarning = `Status pembayaran berhasil diubah, tetapi email e-voucher tidak dikirim: ${emailResult.reason}`
        } else {
          // Update voucher sent timestamp only on success
          await updateSubmissionVoucherSent(req.params.id)
        }
      } catch (error) {
        console.error('[payment-status] Failed to send e-voucher email:', error)
        emailDeliveryWarning = 'Status pembayaran berhasil diubah, tetapi terjadi kesalahan saat mengirim email e-voucher.'
      }
    }

    res.json({ ...updated, emailDeliveryWarning })
  })

  app.post('/api/submissions/:id/resend-evoucher', requireAdmin, csrf.validateToken, async (req, res) => {
    if (!ensureStorageInVercel(res)) return
    
    const submissions = await getSubmissions()
    const submission = submissions.find(s => s.id === req.params.id)
    
    if (!submission) {
      res.status(404).json({ message: 'Data peserta tidak ditemukan.' })
      return
    }
    
    if (submission.paymentStatus !== 'paid') {
      res.status(400).json({ message: 'E-voucher hanya dapat dikirim untuk peserta dengan status pembayaran "Lunas".' })
      return
    }
    
    if (!submission.voucherCode) {
      res.status(400).json({ message: 'Kode voucher tidak tersedia untuk peserta ini.' })
      return
    }
    
    try {
      const schema = await getSchema()
      const emailConfig = await getEmailConfig()
      
      // Prepare submission data for email using helper to extract fields from answers
      const submissionData = buildEmailSubmissionData(submission)
      
      // Preflight check: ensure QR assets can be generated before sending email
      try {
        const { buildVoucherAssets } = await import('./voucherService.js')
        await buildVoucherAssets({
          eventName: schema.eventName,
          submissionId: submission.id,
          voucherCode: submission.voucherCode,
        })
      } catch (qrError) {
        console.error('[resend-evoucher] QR generation preflight failed:', qrError)
        res.status(500).json({ message: `Gagal membuat QR code voucher: ${qrError.message}` })
        return
      }
      
      const emailResult = await sendPaymentConfirmedVoucherEmail(emailConfig, schema, submissionData)
      
      if (emailResult.error) {
        res.status(500).json({ message: `Gagal mengirim e-voucher: ${emailResult.message || emailResult.error}` })
        return
      }
      
      if (emailResult.skipped) {
        res.status(400).json({ message: `E-voucher tidak dapat dikirim: ${emailResult.reason}` })
        return
      }
      
      // Update voucher sent timestamp and get updated data
      const updatedSubmission = await updateSubmissionVoucherSent(req.params.id)
      
      res.json({ 
        success: true, 
        message: 'E-voucher berhasil dikirim ulang.',
        voucherSentAt: updatedSubmission?.voucherSentAt,
        voucherLastSentAt: updatedSubmission?.voucherLastSentAt
      })
    } catch (error) {
      console.error('[resend-evoucher] Failed to resend e-voucher:', error)
      res.status(500).json({ message: 'Terjadi kesalahan saat mengirim e-voucher.' })
    }
  })

  app.post('/api/submissions/check-in', requireAdmin, csrf.validateToken, async (req, res) => {
    if (!ensureStorageInVercel(res)) return
    
    const { scanValue } = req.body
    
    if (!scanValue || typeof scanValue !== 'string' || !scanValue.trim()) {
      res.json({
        success: false,
        status: 'rejected',
        reason: 'Nilai scan tidak valid atau kosong.'
      })
      return
    }
    
    try {
      const { findSubmissionByScanValue, updateSubmissionCheckInStatus, parseScanValue } = await import('./store.js')
      
      const trimmedScanValue = scanValue.trim()
      const parsed = parseScanValue(trimmedScanValue)
      
      // Find submission by scan value (supports multiple formats via parser)
      const submission = await findSubmissionByScanValue(trimmedScanValue)
      
      if (!submission) {
        console.warn('[check-in] Submission not found', {
          scanValue: trimmedScanValue.slice(0, 20),
          parsedFrom: parsed.parsedFrom,
          candidateCount: parsed.candidates.length
        })
        res.json({
          success: false,
          status: 'rejected',
          reason: 'Peserta tidak ditemukan.'
        })
        return
      }
      
      // Check if already checked in
      if (submission.checkInStatus === 'checked_in') {
        res.json({
          success: false,
          status: 'rejected',
          reason: 'Peserta sudah check-in.',
          checkedInAt: submission.checkedInAt,
          submission
        })
        return
      }
      
      // Update check-in status
      const updated = await updateSubmissionCheckInStatus(submission.id)
      
      if (!updated) {
        res.status(500).json({
          success: false,
          status: 'rejected',
          reason: 'Gagal memperbarui status check-in.'
        })
        return
      }
      
      console.info('[check-in] Check-in successful', {
        submissionId: updated.id,
        parsedFrom: parsed.parsedFrom
      })
      
      res.json({
        success: true,
        status: 'accepted',
        submission: updated,
        checkedInAt: updated.checkedInAt
      })
    } catch (error) {
      console.error('[check-in] Failed to process check-in:', error)
      res.status(500).json({
        success: false,
        status: 'rejected',
        reason: 'Terjadi kesalahan saat memproses check-in.'
      })
    }
  })

  app.post('/api/submissions', submissionRateLimit, async (req, res) => {
    if (!ensureStorageInVercel(res)) return

    // Anti-bot: honeypot check
    if (req.body.website) {
      return res.status(400).json({ message: 'Pendaftaran tidak valid.' })
    }

    // Anti-bot: time-based validation
    const formLoadedAt = Number(req.body._formLoadedAt)
    if (!formLoadedAt || isNaN(formLoadedAt)) {
      return res.status(400).json({ message: 'Pendaftaran tidak valid.' })
    }
    const elapsed = Date.now() - formLoadedAt
    if (elapsed < 3000) {
      return res.status(400).json({ message: 'Pendaftaran tidak valid.' })
    }
    if (elapsed > 2 * 60 * 60 * 1000) {
      return res.status(400).json({ message: 'Form sudah kadaluarsa. Silakan muat ulang halaman.' })
    }

    // Validate submission data
    try {
      validateSubmission(req.body)
    } catch (error) {
      return res.status(400).json({ message: error.message })
    }

    const now = new Date()
    const submission = {
      id: crypto.randomUUID(),
      submittedAt: now.toLocaleString('id-ID'),
      submittedAtIso: now.toISOString(),
      answers: req.body.answers,
      paymentStatus: 'registered',
      paymentConfirmedAt: null,
    }

    // Extract and add normalized identity fields for efficient duplicate detection
    const identity = extractIdentity(submission)
    submission.identity_email = identity.email || null
    submission.identity_phone = identity.phone || null

    // Check for duplicate submission (fail-closed for safety)
    try {
      const duplicate = await checkDuplicateSubmission(submission)
      if (duplicate) {
        const fieldName = duplicate.field === 'email' ? 'Email' : 'Nomor WhatsApp'
        return res.status(409).json({ 
          message: `${fieldName} ini sudah terdaftar. Silakan gunakan ${fieldName.toLowerCase()} yang berbeda.` 
        })
      }
    } catch (error) {
      console.error('[API] Duplicate check failed:', error)
      return res.status(503).json({ 
        message: 'Sistem sedang mengalami gangguan. Silakan coba lagi dalam beberapa saat.' 
      })
    }

    // Insert submission with unique constraint protection
    let savedSubmission
    try {
      savedSubmission = await addSubmission(submission)
    } catch (error) {
      // Handle unique constraint violation from database
      if (error.code === 'DUPLICATE_EMAIL') {
        return res.status(409).json({ 
          message: 'Email ini sudah terdaftar. Silakan gunakan email yang berbeda.' 
        })
      }
      if (error.code === 'DUPLICATE_PHONE') {
        return res.status(409).json({ 
          message: 'Nomor WhatsApp ini sudah terdaftar. Silakan gunakan nomor yang berbeda.' 
        })
      }
      if (error.code === 'DUPLICATE_ENTRY') {
        return res.status(409).json({ 
          message: 'Data ini sudah terdaftar. Silakan gunakan email atau nomor WhatsApp yang berbeda.' 
        })
      }
      // Generic error for other failures
      console.error('[API] Failed to save submission:', error)
      return res.status(500).json({ 
        message: 'Gagal menyimpan pendaftaran. Silakan coba lagi.' 
      })
    }

    // Send emails if enabled
    try {
      const emailConfig = await getEmailConfig()
      if (emailConfig.enabled) {
        const schema = await getSchema()
        
        // Transform answers array to object format for email service
        const submissionObject = { id: savedSubmission.id }
        savedSubmission.answers.forEach(answer => {
          // Map label to field ID from schema
          const field = schema.fields.find(f => f.label === answer.label)
          if (field) {
            submissionObject[field.id] = answer.value
          }
        })
        
        // Send participant email
        if (emailConfig.participantEmail.enabled) {
          const participantResult = await sendParticipantEmail(emailConfig, schema, submissionObject)
          if (participantResult.skipped) {
            console.warn(`[EMAIL] Participant email skipped: ${participantResult.reason}`)
          } else if (participantResult.error) {
            console.error(`[EMAIL] Participant email error: ${participantResult.error}`)
          } else {
            console.info(`[EMAIL] Participant email sent to ${submissionObject.email}`)
          }
        }

        // Send admin notification
        if (emailConfig.adminEmail.enabled) {
          const adminResult = await sendAdminNotification(emailConfig, schema, submissionObject)
          if (adminResult.skipped) {
            console.warn(`[EMAIL] Admin notification skipped: ${adminResult.reason}`)
          } else if (adminResult.error) {
            console.error(`[EMAIL] Admin notification error: ${adminResult.error}`)
          } else {
            console.info(`[EMAIL] Admin notification sent`)
          }
        }
      }
    } catch (error) {
      // Log error but don't fail the submission
      console.error('[EMAIL] Failed to send email:', error)
    }

    res.status(201).json(savedSubmission)
  })

  app.post('/api/upload-poster', requireAdmin, csrf.validateToken, upload.single('poster'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'File poster tidak ditemukan.' })
      return
    }

    if (!ensureStorageInVercel(res)) return

    // Additional validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(req.file.mimetype)) {
      res.status(400).json({ message: 'Format gambar tidak didukung. Gunakan JPEG, PNG, WebP, atau GIF.' })
      return
    }

    // Sanitize filename and prevent path traversal
    const sanitizeFilename = (filename) => {
      // Prevent path traversal by using only the basename
      const baseName = path.basename(filename)

      return baseName
        .replace(/[^a-zA-Z0-9.-]/g, '-') // Replace special chars with dash
        .replace(/-+/g, '-') // Replace multiple dashes with single dash
        .replace(/^-|-$/g, '') // Remove leading/trailing dashes
        .toLowerCase()
    }

    if (isR2StorageEnabled()) {
      const safeName = `${Date.now()}-${sanitizeFilename(req.file.originalname)}`
      const posterUrl = await uploadR2File({
        fileName: safeName,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      })

      if (!posterUrl) {
        res.status(500).json({ message: 'Upload ke Cloudflare R2 gagal.' })
        return
      }

      res.status(201).json({ posterUrl })
      return
    }

    if (isVercelRuntime) {
      res.status(500).json({ message: 'Upload lokal tidak didukung saat berjalan di Vercel.' })
      return
    }

    const safeName = `${Date.now()}-${sanitizeFilename(req.file.originalname)}`
    fs.writeFileSync(path.join(uploadsDir, safeName), req.file.buffer)
    res.status(201).json({ posterUrl: `/uploads/${safeName}` })
  })

  app.post('/api/reset', requireAdmin, csrf.validateToken, async (_req, res) => {
    if (!ensureStorageInVercel(res)) return
    res.json(await resetDb())
  })

  app.get('/api/export.csv', requireAdmin, async (req, res) => {
    const schema = await getSchema()
    let submissions = filterSubmissions(
      await getSubmissions(),
      req.query.query,
      req.query.filter,
    )

    // Apply sorting
    const sortBy = req.query.sort || 'newest'
    submissions = submissions.toSorted((left, right) => {
      const getSubmissionTimeValue = (submission) => {
        const isoValue = submission.submittedAtIso
        if (isoValue) {
          const parsed = Date.parse(isoValue)
          if (!Number.isNaN(parsed)) return parsed
        }
        const parsedFallback = Date.parse(String(submission.submittedAt || ''))
        return Number.isNaN(parsedFallback) ? 0 : parsedFallback
      }

      const getPrimaryAnswer = (submission) => {
        return String(submission.answers?.[0]?.value || '').toLowerCase()
      }

      if (sortBy === 'oldest') return getSubmissionTimeValue(left) - getSubmissionTimeValue(right)
      if (sortBy === 'nameAsc') return getPrimaryAnswer(left).localeCompare(getPrimaryAnswer(right), 'id')
      if (sortBy === 'nameDesc') return getPrimaryAnswer(right).localeCompare(getPrimaryAnswer(left), 'id')
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left) // newest first
    })

    const headers = ['submittedAt', ...schema.fields.map((field) => field.label)]

    const rows = submissions.map((submission) => {
      const answerMap = Object.fromEntries(
        submission.answers.map((answer) => [answer.label, answer.value]),
      )

      return [submission.submittedAt, ...schema.fields.map((field) => answerMap[field.label] ?? '')]
    })

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`)
          .join(','),
      )
      .join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="pendaftaran-event.csv"')
    res.send(csv)
  })

  return app
}

// Initialize admin password — hash synchronously so it's ready before any request
let hashedAdminPassword = null
if (adminPassword) {
  // Check if password is already hashed (bcrypt hashes start with $2a$, $2b$, or $2y$)
  if (adminPassword.startsWith('$2a$') || adminPassword.startsWith('$2b$') || adminPassword.startsWith('$2y$')) {
    hashedAdminPassword = adminPassword
  } else {
    // Hash plain text password synchronously so it works in both local and Vercel
    const saltRounds = 12
    hashedAdminPassword = bcrypt.hashSync(adminPassword, saltRounds)
    console.warn('⚠️  Plain text admin password detected. Consider storing a pre-hashed password in .env.')
  }
}

// Create app synchronously (required for Vercel)
const app = createApp()

// Start the server (only for local development)
function startServer() {
  app.listen(port, () => {
    console.log(`API server running on http://localhost:${port}`)
    console.log(`Storage mode: ${getStorageMode()}`)
    console.log(`Admin username: ${adminUsername}`)
    console.log('Admin password loaded from environment configuration.')
  })
}

if (!isVercelRuntime) {
  startServer()
}

export default app
