import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import { createAdminSessionToken, verifyAdminSessionToken } from './adminAuth.js'
import {
  addSubmission,
  deleteSubmission,
  getSchema,
  getStorageMode,
  getSubmissions,
  resetDb,
  saveSchema,
} from './store.js'
import { isDriveStorageEnabled, uploadDriveFile } from './driveStorage.js'

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

function ensureDriveStorageInVercel(res) {
  if (isVercelRuntime && !isDriveStorageEnabled()) {
    res.status(500).json({
      message: 'Google Drive OAuth storage wajib aktif saat berjalan di Vercel.',
    })
    return false
  }

  return true
}

export function createApp() {
  const app = express()

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

  app.get('/api/auth/session', (req, res) => {
    res.json({ authenticated: isAuthenticated(req) })
  })

  app.post('/api/auth/login', authRateLimit, (req, res) => {
    const { username, password } = req.body

    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      res.status(400).json({ message: 'Username dan password wajib diisi.' })
      return
    }

    if (username !== adminUsername || password !== adminPassword) {
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

  app.put('/api/schema', requireAdmin, async (req, res) => {
    if (!ensureDriveStorageInVercel(res)) return

    // Validate schema data
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ message: 'Schema harus berupa objek.' })
    }

    const requiredFields = ['eventName', 'tagline', 'description', 'location', 'date', 'poster', 'fields']
    for (const field of requiredFields) {
      if (!(field in req.body)) {
        return res.status(400).json({ message: `Field ${field} wajib ada dalam schema.` })
      }
    }

    // Validate event metadata
    const stringFields = ['eventName', 'tagline', 'description', 'location', 'date', 'poster']
    for (const field of stringFields) {
      if (typeof req.body[field] !== 'string') {
        return res.status(400).json({ message: `Field ${field} harus berupa string.` })
      }
    }

    // Validate fields array
    if (!Array.isArray(req.body.fields)) {
      return res.status(400).json({ message: 'Field fields harus berupa array.' })
    }

    const fieldIds = new Set()
    for (let i = 0; i < req.body.fields.length; i++) {
      const field = req.body.fields[i]
      if (!field || typeof field !== 'object') {
        return res.status(400).json({ message: `Field pada index ${i} tidak valid.` })
      }

      const requiredFieldProps = ['id', 'label', 'type', 'required', 'placeholder', 'options']
      for (const prop of requiredFieldProps) {
        if (!(prop in field)) {
          return res.status(400).json({ message: `Field pada index ${i} kehilangan property ${prop}.` })
        }
      }

      // Check for duplicate IDs
      if (fieldIds.has(field.id)) {
        return res.status(400).json({ message: `Field ID '${field.id}' duplikat.` })
      }
      fieldIds.add(field.id)

      // Validate field types
      const validTypes = ['text', 'email', 'tel', 'number', 'select', 'textarea', 'date', 'checkbox']
      if (!validTypes.includes(field.type)) {
        return res.status(400).json({ message: `Tipe field '${field.type}' tidak valid.` })
      }

      if (typeof field.required !== 'boolean') {
        return res.status(400).json({ message: `Field required harus berupa boolean.` })
      }
    }

    const saved = await saveSchema(req.body)
    res.json(saved)
  })

  app.get('/api/submissions', requireAdmin, async (_req, res) => {
    res.json(await getSubmissions())
  })

  app.delete('/api/submissions/:id', requireAdmin, async (req, res) => {
    if (!ensureDriveStorageInVercel(res)) return
    const deleted = await deleteSubmission(req.params.id)

    if (!deleted) {
      res.status(404).json({ message: 'Data peserta tidak ditemukan.' })
      return
    }

    res.json({ success: true })
  })

  app.post('/api/submissions', async (req, res) => {
    if (!ensureDriveStorageInVercel(res)) return

    // Validate submission data
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ message: 'Request body harus berupa objek.' })
    }

    if (!Array.isArray(req.body.answers)) {
      return res.status(400).json({ message: 'Field answers harus berupa array.' })
    }

    // Validate each answer
    for (let i = 0; i < req.body.answers.length; i++) {
      const answer = req.body.answers[i]
      if (!answer || typeof answer !== 'object') {
        return res.status(400).json({ message: `Answer pada index ${i} tidak valid.` })
      }
      if (!answer.label || typeof answer.label !== 'string') {
        return res.status(400).json({ message: `Label pada answer index ${i} tidak valid.` })
      }
      if (answer.value !== undefined && typeof answer.value !== 'string' && typeof answer.value !== 'boolean') {
        return res.status(400).json({ message: `Value pada answer index ${i} harus string atau boolean.` })
      }
    }

    const now = new Date()
    const submission = {
      id: crypto.randomUUID(),
      submittedAt: now.toLocaleString('id-ID'),
      submittedAtIso: now.toISOString(),
      answers: req.body.answers,
    }

    res.status(201).json(await addSubmission(submission))
  })

  app.post('/api/upload-poster', requireAdmin, upload.single('poster'), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ message: 'File poster tidak ditemukan.' })
      return
    }

    if (!ensureDriveStorageInVercel(res)) return

    // Additional validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(req.file.mimetype)) {
      res.status(400).json({ message: 'Format gambar tidak didukung. Gunakan JPEG, PNG, WebP, atau GIF.' })
      return
    }

    // Sanitize filename
    const sanitizeFilename = (filename) => {
      return filename
        .replace(/[^a-zA-Z0-9.-]/g, '-') // Replace special chars with dash
        .replace(/-+/g, '-') // Replace multiple dashes with single dash
        .replace(/^-|-$/g, '') // Remove leading/trailing dashes
        .toLowerCase()
    }

    if (isDriveStorageEnabled()) {
      const safeName = `${Date.now()}-${sanitizeFilename(req.file.originalname)}`
      const posterUrl = await uploadDriveFile({
        fileName: safeName,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
      })

      if (!posterUrl) {
        res.status(500).json({ message: 'Upload ke Google Drive gagal.' })
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

  app.post('/api/reset', requireAdmin, async (_req, res) => {
    if (!ensureDriveStorageInVercel(res)) return
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

const app = createApp()

if (!isVercelRuntime) {
  app.listen(port, () => {
    console.log(`API server running on http://localhost:${port}`)
    console.log(`Storage mode: ${getStorageMode()}`)
    console.log(`Admin username: ${adminUsername}`)
    console.log('Admin password loaded from environment configuration.')
  })
}

export default app
