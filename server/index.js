import 'dotenv/config'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import multer from 'multer'
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

const app = express()
const port = process.env.PORT || 3001
const uploadsDir = path.resolve('public/uploads')
const adminUsername = process.env.ADMIN_USERNAME || 'admin'
const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'
const sessionSecret = process.env.SESSION_SECRET || 'development-session-secret'
const cookieSecure = process.env.COOKIE_SECURE === 'true'
const activeSessions = new Set()

fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.memoryStorage()
const upload = multer({ storage })

function createSessionToken() {
  return crypto
    .createHash('sha256')
    .update(`${crypto.randomUUID()}-${sessionSecret}-${Date.now()}`)
    .digest('hex')
}

function isAuthenticated(req) {
  const token = req.cookies.admin_session
  return Boolean(token && activeSessions.has(token))
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

app.use(cors())
app.use(cookieParser())
app.use(express.json({ limit: '10mb' }))
app.use('/uploads', express.static(uploadsDir))
app.use(express.static('public'))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storageMode: getStorageMode() })
})

app.get('/api/auth/session', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) })
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body

  if (username !== adminUsername || password !== adminPassword) {
    res.status(401).json({ message: 'Username atau password salah.' })
    return
  }

  const token = createSessionToken()
  activeSessions.add(token)

  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: 1000 * 60 * 60 * 8,
  })

  res.json({ authenticated: true })
})

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies.admin_session
  if (token) activeSessions.delete(token)
  res.clearCookie('admin_session')
  res.json({ authenticated: false })
})

app.get('/api/schema', async (_req, res) => {
  res.json(await getSchema())
})

app.put('/api/schema', requireAdmin, async (req, res) => {
  const saved = await saveSchema(req.body)
  res.json(saved)
})

app.get('/api/submissions', requireAdmin, async (_req, res) => {
  res.json(await getSubmissions())
})

app.delete('/api/submissions/:id', requireAdmin, async (req, res) => {
  const deleted = await deleteSubmission(req.params.id)

  if (!deleted) {
    res.status(404).json({ message: 'Data peserta tidak ditemukan.' })
    return
  }

  res.json({ success: true })
})

app.post('/api/submissions', async (req, res) => {
  const now = new Date()
  const submission = {
    id: crypto.randomUUID(),
    submittedAt: now.toLocaleString('id-ID'),
    submittedAtIso: now.toISOString(),
    answers: req.body.answers ?? [],
  }

  res.status(201).json(await addSubmission(submission))
})

app.post('/api/upload-poster', requireAdmin, upload.single('poster'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: 'File poster tidak ditemukan.' })
    return
  }

  if (isDriveStorageEnabled()) {
    const posterUrl = await uploadDriveFile({
      fileName: req.file.originalname,
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

  const safeName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, '-').toLowerCase()}`
  fs.writeFileSync(path.join(uploadsDir, safeName), req.file.buffer)
  res.status(201).json({ posterUrl: `/uploads/${safeName}` })
})

app.post('/api/reset', requireAdmin, async (_req, res) => {
  res.json(await resetDb())
})

app.get('/api/export.csv', requireAdmin, async (req, res) => {
  const schema = await getSchema()
  const submissions = filterSubmissions(
    await getSubmissions(),
    req.query.query,
    req.query.filter,
  )
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

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`)
  console.log(`Storage mode: ${getStorageMode()}`)
  console.log(`Admin username: ${adminUsername}`)
  console.log('Admin password loaded from environment configuration.')
})
