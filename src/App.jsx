import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PulseLoader } from 'react-spinners'
import './index.css'
import { logError } from './errorTracker.js'
import { matchesSubmissionQuery, matchesSubmissionFilter, compareSubmissions } from './submissionFilters.js'

// Custom hook for debouncing values
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

const defaultSchema = {
  eventName: 'RB SILENT BEAT RUN 2026',
  tagline: 'Run the rhythm. Feel the beat. Experience the silence.',
  description:
    'Sebuah cara baru menikmati lari hadir pertama kalinya di Solo. Bukan sekadar fun run—ini adalah pengalaman. RB Silent Beat Run menggabungkan energi lari dengan ritme musik dalam satu frekuensi yang sama. Setiap langkah bukan hanya tentang jarak, tapi tentang rasa. Dengan headphone yang terhubung langsung ke DJ, kamu akan berlari dalam duniamu sendiri—tanpa distraksi, hanya kamu, beat, dan vibe yang menyatu. Ini bukan lomba soal siapa tercepat. Ini tentang menikmati perjalanan. Ini tentang merasakan momen.',
  location: 'Ruang Bahagia, Lokananta Solo',
  date: '29 April 2026',
  poster: '/design-reference.png',
  highlights: [
    { label: 'Kategori Lari', value: 'Fun Run 5K' },
    { label: 'Benefit Eksklusif', value: 'T-Shirt Cotton' },
  ],
  features: [
    { title: 'Silent Run Experience', description: 'Nikmati pengalaman lari dengan headphone yang terhubung langsung ke DJ, menghadirkan beat dan vibe yang menyatu di setiap langkah.' },
    { title: 'Fun Run 5K', description: 'Berlari santai dalam format 5K yang fokus pada pengalaman, momen, dan keseruan menikmati ritme sepanjang rute.' },
    { title: 'Exclusive Event Tee', description: 'Setiap peserta mendapatkan benefit eksklusif berupa T-Shirt Cotton sebagai bagian dari pengalaman event.' },
  ],
  fields: [
    {
      id: 'full-name',
      label: 'Nama Lengkap',
      type: 'text',
      required: true,
      placeholder: 'Masukkan nama lengkap',
      options: '',
    },
  ],
}

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Nomor HP' },
  { value: 'number', label: 'Angka' },
  { value: 'select', label: 'Dropdown' },
  { value: 'textarea', label: 'Paragraf' },
  { value: 'date', label: 'Tanggal' },
  { value: 'checkbox', label: 'Checkbox' },
]

const submissionFilters = [
  { value: 'all', label: 'Semua data' },
  { value: 'today', label: 'Hari ini' },
  { value: 'thisWeek', label: 'Minggu ini' },
  { value: 'thisMonth', label: 'Bulan ini' },
  { value: 'withEmail', label: 'Ada email' },
  { value: 'withPhone', label: 'Ada nomor' },
  { value: 'paid', label: 'Sudah bayar' },
  { value: 'unpaid', label: 'Belum bayar' },
  { value: 'checkedIn', label: 'Sudah check-in' },
  { value: 'notCheckedIn', label: 'Belum check-in' },
]

const submissionSorts = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'oldest', label: 'Terlama' },
  { value: 'nameAsc', label: 'Nama A-Z' },
  { value: 'nameDesc', label: 'Nama Z-A' },
  { value: 'paidFirst', label: 'Lunas dulu' },
  { value: 'unpaidFirst', label: 'Belum lunas dulu' },
  { value: 'emailFirst', label: 'Ada email dulu' },
  { value: 'phoneFirst', label: 'Ada nomor dulu' },
]

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

// Store CSRF token
let csrfToken = null

function formatOptions(options = '') {
  return options
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback
}

function normalizeSchema(inputSchema = {}) {
  const merged = {
    ...defaultSchema,
    ...inputSchema,
  }

  return {
    ...merged,
    fields: ensureArray(inputSchema?.fields, defaultSchema.fields),
    highlights: ensureArray(inputSchema?.highlights, defaultSchema.highlights),
    features: ensureArray(inputSchema?.features, defaultSchema.features),
  }
}

function apiUrl(path) {
  if (/^https?:\/\//.test(path)) return path
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path
}

function getPosterUrl(posterPath) {
  const normalizedPosterPath = String(posterPath || '').trim()
  if (!normalizedPosterPath) return apiUrl(defaultSchema.poster)
  return apiUrl(normalizedPosterPath)
}

function getPrimaryAnswer(submission) {
  return String(submission.answers?.[0]?.value || '').toLowerCase()
}

function getSubmissionTimeValue(submission) {
  const isoValue = submission.submittedAtIso
  if (isoValue) {
    const parsed = Date.parse(isoValue)
    if (!Number.isNaN(parsed)) return parsed
  }

  const parsedFallback = Date.parse(String(submission.submittedAt || ''))
  return Number.isNaN(parsedFallback) ? 0 : parsedFallback
}

function formatSubmissionDate(submission) {
  if (submission.submittedAtIso) {
    const date = new Date(submission.submittedAtIso)
    return {
      day: date.toLocaleDateString('id-ID'),
      time: date.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  }

  const parts = String(submission.submittedAt || '').split(', ')
  return {
    day: parts[0] || '-',
    time: parts[1] || '-',
  }
}

async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || 'GET')

  const headers = isFormData
    ? options.headers || {}
    : {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      }

  // Add CSRF token for state-changing requests (including FormData)
  if (isStateChanging && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
  })

  return response
}

function App() {
  const [activeView, setActiveView] = useState('public')
  const [adminTab, setAdminTab] = useState('settings')
  const [schema, setSchema] = useState(defaultSchema)

  const safeSetSchema = useCallback((fetchedSchema) => {
    setSchema(normalizeSchema(fetchedSchema))
  }, [])
  const [submissions, setSubmissions] = useState([])
  const [formData, setFormData] = useState({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [formLoadedAt] = useState(() => Date.now())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false)
   const [saving, setSaving] = useState(false)
   const [uploadingPoster, setUploadingPoster] = useState(false)
   const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
   const [loginForm, setLoginForm] = useState({ username: '', password: '' })
   const [loginError, setLoginError] = useState('')
   const [loginLoading, setLoginLoading] = useState(false)
   const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionQuery, setSubmissionQuery] = useState('')
  const [submissionFilter, setSubmissionFilter] = useState('all')
  const [submissionSort, setSubmissionSort] = useState('newest')
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState('')
  const [selectedParticipant, setSelectedParticipant] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [resendingVoucherId, setResendingVoucherId] = useState(null)
  const [emailConfig, setEmailConfig] = useState(null)
  const [testEmailRecipient, setTestEmailRecipient] = useState('')
  const [testEmailType, setTestEmailType] = useState('participant')
  const [sendingTestEmail, setSendingTestEmail] = useState(false)
  
  // Scanner state
  const [scannerInput, setScannerInput] = useState('')
  const [manualScannerInput, setManualScannerInput] = useState('')
  const [scannerLoading, setScannerLoading] = useState(false)
  const [scannerResult, setScannerResult] = useState(null)
  const scannerAutoClearTimeoutRef = useRef(null)
  const scannerInputRef = useRef(null)
  
  const fileInputRef = useRef(null)
  const pageSize = 5

  const checkSession = useCallback(async (signal) => {
    try {
      const response = await apiFetch('/api/auth/session')
      if (signal?.aborted) return

      const data = await response.json()
      if (signal?.aborted) return

      setIsAdminAuthenticated(data.authenticated)
      if (data.csrfToken) {
        csrfToken = data.csrfToken
      }
    } catch (err) {
      if (!signal?.aborted) {
        logError(err, { context: 'checkSession' })
        setIsAdminAuthenticated(false)
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadPublicData() {
      try {
        const schemaResponse = await fetch(apiUrl('/api/schema'), {
          signal: controller.signal
        })
        const schemaData = await schemaResponse.json()
        safeSetSchema(schemaData)
      } catch (err) {
        if (err.name !== 'AbortError') {
          logError(err, { context: 'loadPublicData', url: apiUrl('/api/schema') })
          setMessage('Gagal memuat data event dari server.')
        }
      } finally {
        setLoading(false)
      }
    }

    loadPublicData()
    checkSession(controller.signal)

    return () => {
      controller.abort()
    }
  }, [checkSession, safeSetSchema])

  const loadAdminData = useCallback(async () => {
    setSubmissionsLoading(true)
    try {
      const [schemaResponse, submissionsResponse, emailConfigResponse] = await Promise.all([
        apiFetch('/api/schema'),
        apiFetch('/api/submissions'),
        apiFetch('/api/email-config'),
      ])

      if (submissionsResponse.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Sesi admin berakhir. Silakan login lagi.')
        return
      }

      const [schemaData, submissionsData, emailConfigData] = await Promise.all([
        schemaResponse.json(),
        submissionsResponse.json(),
        emailConfigResponse.json(),
      ])

      safeSetSchema(schemaData)
      setSubmissions(submissionsData)
      setEmailConfig(emailConfigData)
    } catch (err) {
      logError(err, { context: 'loadAdminData' })
      setMessage('Gagal memuat data admin dari server.')
    } finally {
      setSubmissionsLoading(false)
    }
  }, [safeSetSchema])

  const debouncedSubmissionQuery = useDebounce(submissionQuery, 300)

  const filteredSubmissions = useMemo(() => {
    const filtered = submissions.filter((submission) => {
      const queryMatch = matchesSubmissionQuery(submission, debouncedSubmissionQuery)
      const filterMatch = matchesSubmissionFilter(submission, submissionFilter)
      return queryMatch && filterMatch
    })

    return filtered.toSorted((left, right) => compareSubmissions(left, right, submissionSort))
  }, [submissionFilter, debouncedSubmissionQuery, submissionSort, submissions])

  useEffect(() => {
    if (activeView === 'admin' && isAdminAuthenticated) {
      loadAdminData()
    }
  }, [activeView, isAdminAuthenticated, loadAdminData])

  useEffect(() => {
    // Only reset to page 1 if the current page would be out of bounds
    const maxPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize))
    if (currentPage > maxPages) {
      setCurrentPage(1)
    }
  }, [debouncedSubmissionQuery, submissionFilter, submissionSort, filteredSubmissions.length, pageSize, currentPage])

  const analytics = useMemo(() => {
    if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
      return {
        title: 'Belum ada field dropdown',
        breakdown: [],
      }
    }

    const selectField = schema.fields.find((field) => field.type === 'select')

    if (!selectField) {
      return {
        title: 'Belum ada field dropdown',
        breakdown: [],
      }
    }

    const counts = new Map()
    filteredSubmissions.forEach((submission) => {
      const answer = submission.answers.find((item) => item.label === selectField.label)?.value
      const key = String(answer || 'Belum diisi')
      counts.set(key, (counts.get(key) || 0) + 1)
    })

    const breakdown = Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((left, right) => right.value - left.value)

    return {
      title: `Ringkasan ${selectField.label}`,
      breakdown,
    }
  }, [filteredSubmissions, schema])

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize))
  const paginatedSubmissions = filteredSubmissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  const publicHighlights = useMemo(() => {
    // Use schema highlights if available, otherwise fallback to default
    if (schema.highlights && Array.isArray(schema.highlights) && schema.highlights.length > 0) {
      return schema.highlights
    }
    return defaultSchema.highlights
  }, [schema.highlights])

  const posterUrl = useMemo(() => getPosterUrl(schema.poster), [schema.poster])

  async function saveSchemaToServer(nextSchema) {
    setSaving(true)
    try {
      const normalizedSchema = normalizeSchema(nextSchema)
      const response = await apiFetch('/api/schema', {
        method: 'PUT',
        body: JSON.stringify(normalizedSchema),
      })

      if (response.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Anda harus login sebagai admin.')
        return
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        setMessage(errorData.message || 'Gagal menyimpan perubahan ke server.')
        return false
      }

      const savedSchema = await response.json()
      safeSetSchema(savedSchema)
      setMessage('Perubahan event berhasil disimpan ke server.')
      return true
    } catch (error) {
      logError(error, { context: 'saveSchemaToServer' })
      setMessage('Gagal menyimpan perubahan ke server.')
      return false
    } finally {
      setSaving(false)
    }
  }

  function updateEventMeta(key, value) {
    setSchema((current) => ({ ...current, [key]: value }))
  }

  function addField() {
    setSchema((current) => ({
      ...current,
      fields: [
        ...ensureArray(current.fields),
        {
          id: crypto.randomUUID(),
          label: 'Field Baru',
          type: 'text',
          required: false,
          placeholder: 'Isi jawaban',
          options: '',
        },
      ],
    }))
  }

  function updateField(id, key, value) {
    setSchema((current) => ({
      ...current,
      fields: ensureArray(current.fields).map((field) =>
        field.id === id ? { ...field, [key]: value } : field,
      ),
    }))
  }

  function removeField(id) {
    setSchema((current) => ({
      ...current,
      fields: ensureArray(current.fields).filter((field) => field.id !== id),
    }))
  }

  function addHighlight() {
    setSchema((current) => ({
      ...current,
      highlights: [
        ...ensureArray(current.highlights),
        { label: 'Label Baru', value: 'Nilai Baru' },
      ],
    }))
  }

  function updateHighlight(index, key, value) {
    setSchema((current) => ({
      ...current,
      highlights: ensureArray(current.highlights).map((highlight, i) =>
        i === index ? { ...highlight, [key]: value } : highlight
      ),
    }))
  }

  function removeHighlight(index) {
    setSchema((current) => ({
      ...current,
      highlights: ensureArray(current.highlights).filter((_, i) => i !== index),
    }))
  }

  function addFeature() {
    setSchema((current) => ({
      ...current,
      features: [
        ...ensureArray(current.features),
        { title: 'Fitur Baru', description: 'Deskripsi fitur baru.' },
      ],
    }))
  }

  function updateFeature(index, key, value) {
    setSchema((current) => ({
      ...current,
      features: ensureArray(current.features).map((feature, i) =>
        i === index ? { ...feature, [key]: value } : feature
      ),
    }))
  }

  function removeFeature(index) {
    setSchema((current) => ({
      ...current,
      features: ensureArray(current.features).filter((_, i) => i !== index),
    }))
  }

  async function handlePosterUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingPoster(true)
    const body = new FormData()
    body.append('poster', file)

    try {
      const response = await apiFetch('/api/upload-poster', {
        method: 'POST',
        body,
      })

      if (response.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Anda harus login sebagai admin.')
        return
      }

      if (!response.ok) {
        const errorData = await response.json()
        setMessage(errorData.message || 'Gagal upload poster.')
        return
      }

      const data = await response.json()
      if (!data.posterUrl) {
        setMessage('Upload berhasil, tetapi URL poster tidak valid dari server.')
        return
      }

      setSchema((current) => ({ ...current, poster: data.posterUrl }))
      setMessage('Poster berhasil diupload. Klik simpan perubahan untuk menyimpan schema.')
    } catch {
      setMessage('Gagal upload poster.')
    } finally {
      setUploadingPoster(false)
    }
  }

  function handleFormValue(id, value, type) {
    setFormData((current) => ({
      ...current,
      [id]: type === 'checkbox' ? Boolean(value) : value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setMessage('')

    // Prevent double submit while request is in flight
    if (isSubmitting) return

    if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
      setMessage('Error: Schema tidak valid. Silakan refresh halaman.')
      return
    }

    const missingField = schema.fields.find((field) => {
      if (!field.required) return false
      const value = formData[field.id]
      if (field.type === 'checkbox') return value !== true
      return value === undefined || value === null || String(value).trim() === ''
    })

    if (missingField) {
      setMessage(`Field wajib belum diisi: ${missingField.label}`)
      return
    }

    const newEntry = {
      answers: schema.fields.map((field) => ({
        id: field.id,
        label: field.label,
        value:
          field.type === 'checkbox'
            ? formData[field.id]
              ? 'Ya'
              : 'Tidak'
            : formData[field.id] || '-',
      })),
    }

    try {
      setIsSubmitting(true)
      
      const response = await apiFetch('/api/submissions', {
        method: 'POST',
        body: JSON.stringify({
          ...newEntry,
          website: formData._honeypot || '',
          _formLoadedAt: formLoadedAt,
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        
        // Handle duplicate submission (409 Conflict)
        if (response.status === 409) {
          window.alert(
            '⚠️ Pendaftaran Gagal\n\n' +
            errorData.message + '\n\n' +
            'Jika Anda merasa ini adalah kesalahan, silakan hubungi panitia.'
          )
          setMessage(errorData.message)
          return
        }
        
        // Handle other errors
        setMessage(errorData.message || 'Gagal mengirim pendaftaran.')
        return
      }
      
      const savedEntry = await response.json()
      setSubmissions((current) => [savedEntry, ...current])
      setFormData({})
      
      // Show success alert with email check reminder
      window.alert(
        '✅ Terima kasih! Pendaftaran Anda berhasil.\n\n' +
        '📧 Silakan cek inbox email Anda untuk konfirmasi.\n' +
        '⚠️ Jika tidak ada di inbox, cek juga folder Spam/Junk.'
      )
      
      setMessage('Pendaftaran berhasil dikirim. Data peserta sudah tersimpan di server.')
    } catch {
      setMessage('Gagal mengirim pendaftaran.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleSaveAll() {
    setMessage('')
    await saveSchemaToServer(normalizeSchema(schema))
  }

  async function resetDemoData() {
    try {
      const response = await apiFetch('/api/reset', { method: 'POST' })
      if (response.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Anda harus login sebagai admin.')
        return
      }
      const data = await response.json()
      safeSetSchema(data.schema)
      setSubmissions(data.submissions)
      setFormData({})
      setSubmissionQuery('')
      setSubmissionFilter('all')
      setSubmissionSort('newest')
      setCurrentPage(1)
      setMessage('Data demo berhasil direset dari server.')
    } catch {
      setMessage('Gagal reset data server.')
    }
  }

  async function deleteSubmissionById(submissionId) {
    const shouldDelete = window.confirm('Hapus data peserta ini? Tindakan ini tidak bisa dibatalkan.')
    if (!shouldDelete) return

    setDeletingSubmissionId(submissionId)
    try {
      const response = await apiFetch(`/api/submissions/${submissionId}`, {
        method: 'DELETE',
      })

      if (response.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Anda harus login sebagai admin.')
        return
      }

      if (!response.ok) {
        const data = await response.json()
        setMessage(data.message || 'Gagal menghapus data peserta.')
        return
      }

      setSubmissions((current) => current.filter((submission) => submission.id !== submissionId))
      setMessage('Data peserta berhasil dihapus.')
      
      // Close modal if the deleted participant was being viewed
      if (selectedParticipant?.id === submissionId) {
        closeParticipantDetail()
      }
    } catch {
      setMessage('Gagal menghapus data peserta.')
    } finally {
      setDeletingSubmissionId('')
    }
  }

  function openParticipantDetail(submission) {
    setSelectedParticipant(submission)
    setShowDetailModal(true)
  }

  function closeParticipantDetail() {
    setShowDetailModal(false)
    setSelectedParticipant(null)
  }

  function resetSubmissionControls() {
    setSubmissionQuery('')
    setSubmissionFilter('all')
    setSubmissionSort('newest')
    setCurrentPage(1)
  }

  async function markAsPaid(submissionId) {
    if (!submissionId) return

    // Prevent double click while request is in flight
    if (isUpdatingPayment) return

    try {
      setIsUpdatingPayment(true)
      
      const response = await apiFetch(`/api/submissions/${submissionId}/payment-status`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentStatus: 'paid' }),
      })

      if (!response.ok) {
        const data = await response.json()
        setMessage(data.message || 'Gagal mengupdate status pembayaran.')
        return
      }

      const data = await response.json()
      
      // Update submissions list
      setSubmissions((current) =>
        current.map((sub) =>
          sub.id === submissionId
            ? { 
                ...sub, 
                paymentStatus: 'paid', 
                paymentConfirmedAt: data.paymentConfirmedAt, 
                voucherCode: data.voucherCode,
                voucherSentAt: data.voucherSentAt,
                voucherLastSentAt: data.voucherLastSentAt
              }
            : sub
        )
      )

      // Update selected participant if modal is open
      if (selectedParticipant?.id === submissionId) {
        setSelectedParticipant({
          ...selectedParticipant,
          paymentStatus: 'paid',
          paymentConfirmedAt: data.paymentConfirmedAt,
          voucherCode: data.voucherCode,
          voucherSentAt: data.voucherSentAt,
          voucherLastSentAt: data.voucherLastSentAt,
        })
      }

      // Display appropriate message based on email delivery
      if (data.emailDeliveryWarning) {
        setMessage(`Status pembayaran berhasil diupdate menjadi Lunas, tetapi ${data.emailDeliveryWarning}`)
      } else {
        setMessage('Status pembayaran berhasil diupdate menjadi Lunas dan e-voucher berhasil dikirim.')
      }
    } catch {
      setMessage('Gagal mengupdate status pembayaran.')
    } finally {
      setIsUpdatingPayment(false)
    }
  }

  async function resendVoucher(submissionId) {
    if (!submissionId || resendingVoucherId === submissionId) return

    // Get participant data for contextual confirm message
    const participant = selectedParticipant?.id === submissionId 
      ? selectedParticipant 
      : submissions.find(s => s.id === submissionId)

    const isFirstSend = !participant?.voucherSentAt
    const confirmMessage = isFirstSend
      ? 'Kirim e-voucher ke email peserta sekarang?'
      : 'E-voucher sudah pernah dikirim. Kirim ulang ke email peserta?'

    const shouldResend = window.confirm(confirmMessage)
    if (!shouldResend) return

    try {
      setResendingVoucherId(submissionId)
      
      const response = await apiFetch(`/api/submissions/${submissionId}/resend-evoucher`, {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json()
        setMessage(data.message || 'Gagal mengirim ulang e-voucher.')
        return
      }

      const data = await response.json()
      
      // Update submissions list with new timestamps if available
      if (data.voucherSentAt || data.voucherLastSentAt) {
        setSubmissions((current) =>
          current.map((sub) =>
            sub.id === submissionId
              ? { 
                  ...sub, 
                  voucherSentAt: data.voucherSentAt || sub.voucherSentAt,
                  voucherLastSentAt: data.voucherLastSentAt || sub.voucherLastSentAt
                }
              : sub
          )
        )

        // Update selected participant if modal is open
        if (selectedParticipant?.id === submissionId) {
          setSelectedParticipant({
            ...selectedParticipant,
            voucherSentAt: data.voucherSentAt || selectedParticipant.voucherSentAt,
            voucherLastSentAt: data.voucherLastSentAt || selectedParticipant.voucherLastSentAt,
          })
        }
      } else {
        // Fallback to full reload if backend doesn't return timestamps
        await loadAdminData()
      }
      
      setMessage(data.message || 'E-voucher berhasil dikirim ulang.')
    } catch {
      setMessage('Gagal mengirim ulang e-voucher.')
    } finally {
      setResendingVoucherId(null)
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({
      query: debouncedSubmissionQuery,
      filter: submissionFilter,
      sort: submissionSort,
    })
    window.open(`${apiUrl('/api/export.csv')}?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  async function handleAdminLogin(event) {
    event.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(loginForm),
      })

      const data = await response.json()

      if (!response.ok) {
        setLoginError(data.message || 'Login gagal.')
        return
      }

      setIsAdminAuthenticated(data.authenticated)
      setMessage('Login admin berhasil.')
      // Refresh session to get CSRF token
      await checkSession()
      await loadAdminData()
    } catch {
      setLoginError('Tidak dapat terhubung ke server auth.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleAdminLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setIsAdminAuthenticated(false)
    setActiveView('public')
    setLoginError('')
    setMessage('Anda sudah logout dari dashboard admin.')
  }

  async function saveEmailConfig() {
    if (!emailConfig) {
      setMessage('Konfigurasi email belum dimuat.')
      return
    }

    setSaving(true)
    try {
      const response = await apiFetch('/api/email-config', {
        method: 'PUT',
        body: JSON.stringify(emailConfig),
      })

      if (response.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Anda harus login sebagai admin.')
        return
      }

      const savedConfig = await response.json()
      setEmailConfig(savedConfig)
      setMessage('Konfigurasi email berhasil disimpan.')
    } catch {
      setMessage('Gagal menyimpan konfigurasi email.')
    } finally {
      setSaving(false)
    }
  }

  async function sendTestEmail() {
    if (!emailConfig) {
      setMessage('Konfigurasi email belum dimuat.')
      return
    }

    if (!testEmailRecipient) {
      setMessage('Masukkan email penerima untuk test email.')
      return
    }

    setSendingTestEmail(true)
    setMessage('')
    try {
      const response = await apiFetch('/api/email-config/test', {
        method: 'POST',
        body: JSON.stringify({
          recipient: testEmailRecipient,
          emailType: testEmailType,
        }),
      })

      if (response.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Anda harus login sebagai admin.')
        return
      }

      const result = await response.json()
      
      // Check nested result structure (backend wraps response as { success: true, result })
      const emailResult = result.result || result
      
      if (emailResult.error) {
        setMessage(`Gagal mengirim test email: ${emailResult.message || 'Unknown error'}`)
      } else if (emailResult.skipped) {
        setMessage(`Test email tidak dikirim: ${emailResult.reason}`)
      } else {
        setMessage('Test email berhasil dikirim! Cek inbox Anda.')
      }
    } catch {
      setMessage('Gagal mengirim test email. Pastikan konfigurasi sudah benar.')
    } finally {
      setSendingTestEmail(false)
    }
  }

  function updateEmailConfig(key, value) {
    setEmailConfig((current) => {
      if (!current) return current
      return { ...current, [key]: value }
    })
  }

  function updateEmailConfigNested(section, key, value) {
    setEmailConfig((current) => {
      if (!current || !current[section]) return current
      return {
        ...current,
        [section]: { ...current[section], [key]: value },
      }
    })
  }

  function updateEmailConfigDeep(section, nestedSection, key, value) {
    setEmailConfig((current) => {
      if (!current || !current[section] || !current[section][nestedSection]) return current
      return {
        ...current,
        [section]: {
          ...current[section],
          [nestedSection]: {
            ...current[section][nestedSection],
            [key]: value,
          },
        },
      }
    })
  }

  function updateEmailPaymentInfo(key, value) {
    setEmailConfig((current) => {
      if (!current) return current
      return {
        ...current,
        paymentInfo: {
          ...(current.paymentInfo || {}),
          [key]: value,
        },
      }
    })
  }

  // Scanner handlers - React state-driven
  const submitGateScan = useCallback(async (scanValue, source = 'auto') => {
    if (!scanValue || !scanValue.trim() || scannerLoading) return

    setScannerLoading(true)
    
    // Clear any pending auto-clear timeout
    if (scannerAutoClearTimeoutRef.current) {
      clearTimeout(scannerAutoClearTimeoutRef.current)
      scannerAutoClearTimeoutRef.current = null
    }

    try {
      const response = await apiFetch('/api/submissions/check-in', {
        method: 'POST',
        body: JSON.stringify({ scanValue: scanValue.trim() }),
      })

      const data = await response.json()

      if (data.success && data.status === 'accepted') {
        // Success - check-in accepted
        setScannerResult({
          status: 'accepted',
          reason: 'Peserta berhasil check-in',
          submission: data.submission,
          checkedInAt: data.checkedInAt,
          scanValue: scanValue.trim()
        })

        // Update submissions state in-place (like markAsPaid pattern)
        setSubmissions(prev => prev.map(sub => 
          sub.id === data.submission.id 
            ? { ...sub, checkInStatus: 'checked_in', checkedInAt: data.checkedInAt }
            : sub
        ))

        // Update selectedParticipant if it's the same submission
        if (selectedParticipant?.id === data.submission.id) {
          setSelectedParticipant(prev => ({
            ...prev,
            checkInStatus: 'checked_in',
            checkedInAt: data.checkedInAt
          }))
        }
      } else {
        // Rejected
        setScannerResult({
          status: 'rejected',
          reason: data.reason || 'Peserta tidak dapat check-in',
          submission: data.submission || null,
          checkedInAt: data.checkedInAt || null,
          scanValue: scanValue.trim()
        })
      }

      // Auto-clear result after 5 seconds
      scannerAutoClearTimeoutRef.current = setTimeout(() => {
        setScannerResult(null)
        setScannerInput('')
        setManualScannerInput('')
        scannerInputRef.current?.focus()
      }, 5000)

    } catch (error) {
      console.error('Scanner error:', error)
      setScannerResult({
        status: 'error',
        reason: 'Terjadi kesalahan saat memproses scan',
        submission: null,
        checkedInAt: null,
        scanValue: scanValue.trim()
      })

      // Auto-clear error after 5 seconds
      scannerAutoClearTimeoutRef.current = setTimeout(() => {
        setScannerResult(null)
        setScannerInput('')
        setManualScannerInput('')
        scannerInputRef.current?.focus()
      }, 5000)
    } finally {
      setScannerLoading(false)
    }
  }, [scannerLoading, selectedParticipant])

  const handleScannerInputChange = useCallback((e) => {
    const value = e.target.value
    setScannerInput(value)
  }, [])

  const handleManualScannerSubmit = useCallback((e) => {
    e.preventDefault()
    if (manualScannerInput.trim()) {
      submitGateScan(manualScannerInput, 'manual')
    }
  }, [manualScannerInput, submitGateScan])

  const resetScannerResult = useCallback(() => {
    if (scannerAutoClearTimeoutRef.current) {
      clearTimeout(scannerAutoClearTimeoutRef.current)
      scannerAutoClearTimeoutRef.current = null
    }
    setScannerResult(null)
    setScannerInput('')
    setManualScannerInput('')
    scannerInputRef.current?.focus()
  }, [])

  // Scanner auto-submit effect (for external scanner devices)
  useEffect(() => {
    if (adminTab !== 'scanner' || !scannerInput.trim()) return

    const timeout = setTimeout(() => {
      if (scannerInput.trim()) {
        submitGateScan(scannerInput, 'auto')
      }
    }, 500)

    return () => clearTimeout(timeout)
  }, [scannerInput, adminTab, submitGateScan])

  // Scanner tab focus and cleanup
  useEffect(() => {
    if (adminTab === 'scanner') {
      scannerInputRef.current?.focus()
    }

    return () => {
      if (scannerAutoClearTimeoutRef.current) {
        clearTimeout(scannerAutoClearTimeoutRef.current)
        scannerAutoClearTimeoutRef.current = null
      }
    }
  }, [adminTab])

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <div className="runner-track">
          <div className="runner-icon">🏃</div>
        </div>
        <div className="loading-text">
          <h2>Sedang memuat</h2>
          <p>Menyiapkan pengalaman event...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={activeView === 'admin' ? "app-shell admin-mode" : "app-shell"}>
      <header className="topbar">
        <div>
          <p className="brand-mark">Gelaran</p>
          <h1 className="brand-title">Event registration webapp</h1>
        </div>
        <nav className="topbar-nav">
          <button
            className={activeView === 'public' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActiveView('public')}
          >
            Halaman Peserta
          </button>
          <button
            className={activeView === 'admin' ? 'nav-btn active' : 'nav-btn'}
            onClick={() => setActiveView('admin')}
          >
            Admin Dashboard
          </button>
        </nav>
      </header>

      {activeView === 'public' ? (
        <main className="page-grid">
          <section className="hero-card">
            <div className="hero-copy">
              <span className="eyebrow">Event Registration</span>
              <h2>
                Join the <span>{schema.eventName}</span>
              </h2>
              <p>{schema.tagline}</p>

              <div className="meta-row">
                <div>
                  <span>
                    <svg style={{width: 14, height: 14, marginRight: 6, display: 'inline-block', verticalAlign: 'middle', opacity: 0.6}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                    </svg>
                    Lokasi
                  </span>
                  <strong>{schema.location}</strong>
                </div>
                <div>
                  <span>
                    <svg style={{width: 14, height: 14, marginRight: 6, display: 'inline-block', verticalAlign: 'middle', opacity: 0.6}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                    </svg>
                    Tanggal
                  </span>
                  <strong>{schema.date}</strong>
                </div>
              </div>

              <div className="hero-actions">
                <a href="#registration-form" className="primary-btn">
                  Daftar Sekarang
                </a>
              </div>
            </div>

            <div className="poster-card">
              <img
                src={posterUrl}
                alt={schema.eventName}
                onError={(event) => {
                  if (event.currentTarget.dataset.fallbackApplied === 'true') return
                  event.currentTarget.dataset.fallbackApplied = 'true'
                  event.currentTarget.src = getPosterUrl(defaultSchema.poster)
                }}
              />
              <div className="poster-badge">
                <span>Poster event</span>
                <strong>{schema.eventName}</strong>
              </div>
            </div>
          </section>

          <section className="stats-row">
            {publicHighlights.map((item) => (
              <article key={item.label} className="stat-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </section>

          <section className="content-grid">
            <article className="info-panel">
              <div className="panel-head">
                <span className="eyebrow">Tentang event</span>
                <h3>{schema.eventName}</h3>
              </div>
              <p>{schema.description}</p>
              <ul className="feature-list">
                {((Array.isArray(schema.features) && schema.features.length > 0) ? schema.features : defaultSchema.features).map((feature, index) => (
                  <li key={index}><strong>{feature.title}</strong>: {feature.description}</li>
                ))}
              </ul>
            </article>

            <article className="form-panel" id="registration-form">
              <div className="panel-head">
                <span className="eyebrow">Form pendaftaran</span>
                <h3>Isi data peserta</h3>
              </div>

              <form className="registration-form" onSubmit={handleSubmit}>
                {/* Anti-bot honeypot field */}
                <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
                  <label>
                    <span>Website</span>
                    <input
                      type="text"
                      name="website"
                      value={formData._honeypot || ''}
                      onChange={(e) => handleFormValue('_honeypot', e.target.value, 'text')}
                      autoComplete="off"
                      tabIndex={-1}
                    />
                  </label>
                </div>

                {schema.fields.map((field) => {
                  const options = formatOptions(field.options)
                  const value = formData[field.id] ?? (field.type === 'checkbox' ? false : '')

                  return (
                    <label key={field.id} className="field-block">
                      <span>
                        {field.label}
                        {field.required ? <em>*</em> : null}
                      </span>

                      {field.type === 'textarea' ? (
                        <textarea
                          placeholder={field.placeholder}
                          value={value}
                          onChange={(event) => handleFormValue(field.id, event.target.value, field.type)}
                          rows="4"
                          disabled={isSubmitting}
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={value}
                          onChange={(event) => handleFormValue(field.id, event.target.value, field.type)}
                          disabled={isSubmitting}
                        >
                          <option value="">Pilih salah satu</option>
                          {options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'checkbox' ? (
                        <div className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={value}
                            onChange={(event) =>
                              handleFormValue(field.id, event.target.checked, field.type)
                            }
                            disabled={isSubmitting}
                          />
                          <p>Saya menyetujui syarat dan ketentuan pendaftaran.</p>
                        </div>
                      ) : (
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={value}
                          onChange={(event) => handleFormValue(field.id, event.target.value, field.type)}
                          disabled={isSubmitting}
                        />
                      )}
                    </label>
                  )
                })}

                <button type="submit" className="primary-btn full-width" disabled={isSubmitting}>
                  {isSubmitting ? 'Mengirim...' : 'Kirim Pendaftaran'}
                </button>
              </form>

              {message ? <p className="form-message">{message}</p> : null}
            </article>
          </section>

          <footer className="site-footer">
            <p>&copy; 2026 by hexadigiworks</p>
          </footer>
        </main>
      ) : isAdminAuthenticated ? (
        <main className="admin-layout">
          <aside className="admin-sidebar">
            <div className="sidebar-head">
              <span className="eyebrow">Admin Panel</span>
              <h2>Menu</h2>
            </div>
            <nav className="sidebar-nav">
              <button
                className={adminTab === 'settings' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setAdminTab('settings')}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                Informasi Event
              </button>
              <button
                className={adminTab === 'builder' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setAdminTab('builder')}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                Form Builder
              </button>
              <button
                className={adminTab === 'submissions' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setAdminTab('submissions')}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                Data Pendaftar ({submissions.length})
              </button>
              <button
                className={adminTab === 'email' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setAdminTab('email')}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                Email Settings
              </button>
              <button
                className={adminTab === 'scanner' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setAdminTab('scanner')}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
                Gate Scanner
              </button>
            </nav>

            <div className="sidebar-footer">
              <button className="ghost-btn full-width mb-1" onClick={resetDemoData}>
                Reset Demo
              </button>
              <button className="ghost-btn full-width" onClick={handleAdminLogout}>
                Logout
              </button>
            </div>
          </aside>

          <section className="admin-content-area">
            {adminTab === 'settings' && (
              <div className="admin-main-card scanner-card">
                <div className="panel-head inline-head">
                  <div>
                    <h3>Informasi event</h3>
                    <p>Atur nama, lokasi, tanggal, dan poster event.</p>
                  </div>
                  <button className="primary-btn" onClick={handleSaveAll}>
                    {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
                {message && <p className="form-message mb-2">{message}</p>}

                <div className="admin-form-grid settings-grid">
                  <label className="field-block">
                    <span>Nama event</span>
                    <input
                      value={schema.eventName}
                      onChange={(event) => updateEventMeta('eventName', event.target.value)}
                    />
                  </label>
                  <label className="field-block">
                    <span>Tagline</span>
                    <input
                      value={schema.tagline}
                      onChange={(event) => updateEventMeta('tagline', event.target.value)}
                    />
                  </label>
                  <label className="field-block">
                    <span>Lokasi</span>
                    <input
                      value={schema.location}
                      onChange={(event) => updateEventMeta('location', event.target.value)}
                    />
                  </label>
                  <label className="field-block">
                    <span>Tanggal</span>
                    <input
                      value={schema.date}
                      onChange={(event) => updateEventMeta('date', event.target.value)}
                    />
                  </label>
                  <label className="field-block field-full">
                    <span>Deskripsi</span>
                    <textarea
                      rows="4"
                      value={schema.description}
                      onChange={(event) => updateEventMeta('description', event.target.value)}
                    />
                  </label>
                </div>

                <div className="upload-card">
                  <div>
                    <h4>Poster event</h4>
                    <p>Upload poster baru agar langsung tampil di landing page peserta.</p>
                  </div>
                  <div className="upload-actions">
                    <img
                      src={posterUrl}
                      alt="Current poster"
                      className="mini-poster"
                      onError={(event) => {
                        if (event.currentTarget.dataset.fallbackApplied === 'true') return
                        event.currentTarget.dataset.fallbackApplied = 'true'
                        event.currentTarget.src = getPosterUrl(defaultSchema.poster)
                      }}
                    />
                    <button className="ghost-btn" onClick={() => fileInputRef.current?.click()} disabled={uploadingPoster}>
                      {uploadingPoster ? 'Mengupload...' : 'Ganti Poster'}
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handlePosterUpload}
                  />
                </div>

                <div className="admin-form-section">
                  <div className="panel-head compact-head">
                    <div>
                      <h4>Highlights Landing Page</h4>
                      <p>Statistik dan informasi penting yang tampil di landing page.</p>
                    </div>
                    <button className="ghost-btn" onClick={addHighlight}>
                      Tambah Highlight
                    </button>
                  </div>

                  <div className="builder-list">
                    {(schema.highlights || []).map((highlight, index) => (
                      <section key={index} className="builder-item">
                        <div className="builder-item-head">
                          <strong>Highlight {index + 1}</strong>
                          <button className="delete-btn" onClick={() => removeHighlight(index)}>
                            Hapus
                          </button>
                        </div>
                        <div className="admin-form-grid builder-grid">
                          <label className="field-block">
                            <span>Label</span>
                            <input
                              value={highlight.label}
                              onChange={(event) => updateHighlight(index, 'label', event.target.value)}
                              placeholder="Contoh: Kategori Lari"
                            />
                          </label>
                          <label className="field-block">
                            <span>Value</span>
                            <input
                              value={highlight.value}
                              onChange={(event) => updateHighlight(index, 'value', event.target.value)}
                              placeholder="Contoh: 5K, 10K, HM, FM"
                            />
                          </label>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>

                <div className="admin-form-section">
                  <div className="panel-head compact-head">
                    <div>
                      <h4>Fitur Unggulan</h4>
                      <p>Daftar fitur dan benefit yang tampil di landing page.</p>
                    </div>
                    <button className="ghost-btn" onClick={addFeature}>
                      Tambah Fitur
                    </button>
                  </div>

                  <div className="builder-list">
                    {(schema.features || []).map((feature, index) => (
                      <section key={index} className="builder-item">
                        <div className="builder-item-head">
                          <strong>Fitur {index + 1}</strong>
                          <button className="delete-btn" onClick={() => removeFeature(index)}>
                            Hapus
                          </button>
                        </div>
                        <div className="admin-form-grid builder-grid">
                          <label className="field-block">
                            <span>Judul</span>
                            <input
                              value={feature.title}
                              onChange={(event) => updateFeature(index, 'title', event.target.value)}
                              placeholder="Contoh: Lintasan Steril & Aman"
                            />
                          </label>
                          <label className="field-block field-full">
                            <span>Deskripsi</span>
                            <textarea
                              rows="3"
                              value={feature.description}
                              onChange={(event) => updateFeature(index, 'description', event.target.value)}
                              placeholder="Deskripsi lengkap fitur ini"
                            />
                          </label>
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {adminTab === 'builder' && (
              <div className="admin-main-card scanner-card">
                <div className="inline-head compact-head">
                  <div>
                    <h3>Form builder</h3>
                    <p>Tambah, ubah, atau hapus field pendaftaran.</p>
                  </div>
                  <div className="admin-actions">
                    <button className="primary-btn" onClick={handleSaveAll}>
                      {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                    <button className="ghost-btn" onClick={addField}>
                      Tambah Field
                    </button>
                  </div>
                </div>
                {message && <p className="form-message mb-2">{message}</p>}

                <div className="builder-list">
                  {(schema.fields || []).map((field, index) => (
                    <section key={field.id} className="builder-item">
                      <div className="builder-item-head">
                        <strong>Field {index + 1}</strong>
                        <button className="delete-btn" onClick={() => removeField(field.id)}>
                          Hapus
                        </button>
                      </div>
                      <div className="admin-form-grid builder-grid">
                        <label className="field-block">
                          <span>Label</span>
                          <input
                            value={field.label}
                            onChange={(event) => updateField(field.id, 'label', event.target.value)}
                          />
                        </label>
                        <label className="field-block">
                          <span>Tipe</span>
                          <select
                            value={field.type}
                            onChange={(event) => updateField(field.id, 'type', event.target.value)}
                          >
                            {fieldTypes.map((type) => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field-block">
                          <span>Placeholder</span>
                          <input
                            value={field.placeholder}
                            onChange={(event) =>
                              updateField(field.id, 'placeholder', event.target.value)
                            }
                          />
                        </label>
                        <label className="field-block">
                          <span>Wajib diisi</span>
                          <select
                            value={field.required ? 'yes' : 'no'}
                            onChange={(event) =>
                              updateField(field.id, 'required', event.target.value === 'yes')
                            }
                          >
                            <option value="yes">Ya</option>
                            <option value="no">Tidak</option>
                          </select>
                        </label>
                        {(field.type === 'select' || field.type === 'checkbox') && (
                          <label className="field-block field-full">
                            <span>Opsi (pisahkan dengan koma)</span>
                            <input
                              value={field.options}
                              onChange={(event) => updateField(field.id, 'options', event.target.value)}
                              placeholder="Contoh: VIP, Reguler, Komunitas"
                            />
                          </label>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            )}

            {adminTab === 'submissions' && (
              <div className="admin-main-card scanner-card">
                <div className="panel-head inline-head">
                  <div>
                    <h3>Data pendaftar</h3>
                    <p>{filteredSubmissions.length} pendaftaran cocok</p>
                  </div>
                  <button className="ghost-btn" onClick={exportCsv}>
                    Export CSV Aktif
                  </button>
                </div>
                {message && <p className="form-message mb-2">{message}</p>}

                <div className="submission-toolbar three-cols" role="search">
                  <input
                    id="submission-search"
                    aria-label="Cari data pendaftar berdasarkan nama, email, atau nomor"
                    value={submissionQuery}
                    onChange={(event) => setSubmissionQuery(event.target.value)}
                    placeholder="Cari nama, email, nomor WhatsApp..."
                  />
                  <select
                    aria-label="Filter pendaftar"
                    value={submissionFilter}
                    onChange={(event) => setSubmissionFilter(event.target.value)}
                  >
                    {submissionFilters.map((filter) => (
                      <option key={filter.value} value={filter.value}>
                        {filter.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Urutkan pendaftar"
                    value={submissionSort}
                    onChange={(event) => setSubmissionSort(event.target.value)}
                  >
                    {submissionSorts.map((sort) => (
                      <option key={sort.value} value={sort.value}>
                        {sort.label}
                      </option>
                    ))}
                  </select>
                </div>

                {(submissionQuery || submissionFilter !== 'all' || submissionSort !== 'newest') && (
                  <div style={{ marginTop: '12px', marginBottom: '8px' }}>
                    <button className="ghost-btn" onClick={resetSubmissionControls}>
                      Reset Pencarian & Filter
                    </button>
                  </div>
                )}

                <div className="analytics-strip">
                  <article className="analytics-card">
                    <span>Total hasil filter</span>
                    <strong>{filteredSubmissions.length}</strong>
                  </article>
                  <article className="analytics-card">
                    <span>{analytics.title}</span>
                    {analytics.breakdown.length === 0 ? (
                      <strong>Belum ada data</strong>
                    ) : (
                      <div className="analytics-list">
                        {analytics.breakdown.slice(0, 4).map((item) => (
                          <div key={item.label} className="analytics-item">
                            <label>{item.label}</label>
                            <div>
                              <span style={{ width: `${Math.max(12, (item.value / filteredSubmissions.length) * 100)}%` }} />
                            </div>
                            <strong>{item.value}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                </div>

                {submissionsLoading ? (
                  <p className="empty-state" role="status" aria-live="polite">Memuat data peserta...</p>
                ) : (
                  <>
                    <div className="table-responsive" role="region" aria-label="Tabel data pendaftar">
                      <table className="data-table" aria-label="Data pendaftar event">
                        <thead>
                          <tr>
                            <th>Waktu Daftar</th>
                            {(schema.fields || []).map((field) => (
                              <th key={field.id}>{field.label}</th>
                            ))}
                            <th>Status Check-in</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedSubmissions.length === 0 ? (
                            <tr>
                              <td colSpan={(schema.fields || []).length + 3} className="text-center py-4">
                                {submissions.length === 0 
                                  ? 'Belum ada data pendaftar.'
                                  : 'Tidak ada peserta yang cocok dengan pencarian dan filter saat ini.'}
                              </td>
                            </tr>
                          ) : (
                            paginatedSubmissions.map((sub) => (
                              <tr key={sub.id}>
                                <td>{formatSubmissionDate(sub).day}<br/><small>{formatSubmissionDate(sub).time}</small></td>
                {(schema.fields || []).map((field) => {
                                  const answer = sub.answers.find((a) => a.label === field.label)
                                  return <td key={field.id}>{answer ? answer.value : '-'}</td>
                                })}
                                <td>
                                  {sub.checkInStatus === 'checked_in' ? (
                                    <span className="badge badge-success">Sudah Check-in</span>
                                  ) : (
                                    <span className="badge badge-pending">Belum Check-in</span>
                                  )}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      className="ghost-btn-small"
                                      onClick={() => openParticipantDetail(sub)}
                                    >
                                      Lihat Detail
                                    </button>
                                    <button
                                      className="delete-btn-small"
                                      onClick={() => deleteSubmissionById(sub.id)}
                                      disabled={deletingSubmissionId === sub.id}
                                    >
                                      {deletingSubmissionId === sub.id ? '...' : 'Hapus'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="pagination-bar mt-2">
                      <span>
                        Halaman {currentPage} dari {totalPages}
                      </span>
                      <div className="pagination-actions">
                        <button
                          className="ghost-btn"
                          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                          disabled={currentPage === 1}
                        >
                          Sebelumnya
                        </button>
                        <button
                          className="ghost-btn"
                          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Berikutnya
                        </button>
                      </div>
                    </div>

                    {/* Modal Detail Peserta */}
                    {showDetailModal && selectedParticipant && (
                      <div className="modal-overlay" onClick={closeParticipantDetail}>
                        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                          <div className="modal-header">
                            <h3>Detail Peserta</h3>
                            <button 
                              className="modal-close-btn" 
                              onClick={closeParticipantDetail}
                              aria-label="Tutup modal"
                            >
                              ×
                            </button>
                          </div>
                          <div className="modal-body">
                            <div className="participant-detail-section">
                              <div className="participant-detail-row">
                                <span className="detail-label">ID Peserta:</span>
                                <span className="detail-value">{selectedParticipant.id}</span>
                              </div>
                              <div className="participant-detail-row">
                                <span className="detail-label">Waktu Pendaftaran:</span>
                                <span className="detail-value">
                                  {selectedParticipant.submittedAt || 
                                   new Date(selectedParticipant.submittedAtIso).toLocaleString('id-ID')}
                                </span>
                              </div>
                              <div className="participant-detail-row">
                                <span className="detail-label">Status Pembayaran:</span>
                                <span className="detail-value">
                                  <span className={`payment-badge ${selectedParticipant.paymentStatus === 'paid' ? 'paid' : 'registered'}`}>
                                    {selectedParticipant.paymentStatus === 'paid' ? 'Lunas' : 'Terdaftar'}
                                  </span>
                                  {selectedParticipant.paymentStatus === 'paid' && selectedParticipant.paymentConfirmedAt && (
                                    <small style={{ marginLeft: '8px', color: '#666' }}>
                                      Dikonfirmasi: {new Date(selectedParticipant.paymentConfirmedAt).toLocaleString('id-ID')}
                                    </small>
                                  )}
                                </span>
                              </div>
                              <div className="participant-detail-row">
                                <span className="detail-label">Status Check-in:</span>
                                <span className="detail-value">
                                  <span className={`checkin-badge ${selectedParticipant.checkInStatus === 'checked_in' ? 'checked-in' : 'not-checked-in'}`}>
                                    {selectedParticipant.checkInStatus === 'checked_in' ? 'Sudah Check-in' : 'Belum Check-in'}
                                  </span>
                                  {selectedParticipant.checkInStatus === 'checked_in' && selectedParticipant.checkedInAt && (
                                    <small style={{ marginLeft: '8px', color: '#666' }}>
                                      {new Date(selectedParticipant.checkedInAt).toLocaleString('id-ID')}
                                    </small>
                                  )}
                                </span>
                              </div>
                              {selectedParticipant.paymentStatus === 'paid' && selectedParticipant.voucherCode && (
                                <>
                                  <div className="participant-detail-row">
                                    <span className="detail-label">Kode Voucher:</span>
                                    <span className="detail-value">
                                      <strong>{selectedParticipant.voucherCode}</strong>
                                    </span>
                                  </div>
                                  <div className="participant-detail-row">
                                    <span className="detail-label">Status Pengiriman:</span>
                                    <span className="detail-value">
                                      {!selectedParticipant.voucherSentAt ? (
                                        <span style={{ color: '#666' }}>Belum pernah dikirim</span>
                                      ) : (
                                        <>
                                          Pertama dikirim: {new Date(selectedParticipant.voucherSentAt).toLocaleString('id-ID')}
                                          {selectedParticipant.voucherLastSentAt && 
                                           selectedParticipant.voucherLastSentAt !== selectedParticipant.voucherSentAt && (
                                            <div style={{ marginTop: '4px' }}>
                                              <small style={{ color: '#666' }}>
                                                Terakhir dikirim ulang: {new Date(selectedParticipant.voucherLastSentAt).toLocaleString('id-ID')}
                                              </small>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </span>
                                  </div>
                                </>
                              )}
                              <hr className="detail-divider" />
                              <h4 className="detail-section-title">Data Peserta</h4>
                              {selectedParticipant.answers.map((answer, idx) => (
                                <div key={idx} className="participant-detail-row">
                                  <span className="detail-label">{answer.label}:</span>
                                  <span className="detail-value">
                                    {typeof answer.value === 'boolean' 
                                      ? (answer.value ? 'Ya' : 'Tidak')
                                      : answer.value || '-'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="modal-footer">
                            <button 
                              className="ghost-btn" 
                              onClick={closeParticipantDetail}
                            >
                              Tutup
                            </button>
                            <div style={{ display: 'flex', gap: '12px' }}>
                              {selectedParticipant.paymentStatus !== 'paid' && (
                                <button 
                                  className="primary-btn" 
                                  onClick={() => markAsPaid(selectedParticipant.id)}
                                  disabled={isUpdatingPayment}
                                >
                                  {isUpdatingPayment ? 'Memproses...' : 'Tandai Lunas'}
                                </button>
                              )}
                              {selectedParticipant.paymentStatus === 'paid' && selectedParticipant.voucherCode && (
                                <button 
                                  className="primary-btn" 
                                  onClick={() => resendVoucher(selectedParticipant.id)}
                                  disabled={resendingVoucherId === selectedParticipant.id}
                                >
                                  {resendingVoucherId === selectedParticipant.id 
                                    ? 'Mengirim...' 
                                    : (selectedParticipant.voucherSentAt ? 'Kirim Ulang E-voucher' : 'Kirim E-voucher')
                                  }
                                </button>
                              )}
                              <button 
                                className="delete-btn" 
                                onClick={() => deleteSubmissionById(selectedParticipant.id)}
                                disabled={deletingSubmissionId === selectedParticipant.id}
                              >
                                {deletingSubmissionId === selectedParticipant.id ? 'Menghapus...' : 'Hapus Peserta'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {adminTab === 'email' && (
              <div className="admin-main-card scanner-card">
                {!emailConfig ? (
                  <p className="empty-state" role="status" aria-live="polite">Memuat konfigurasi email...</p>
                ) : (
                  <>
                    <div className="panel-head inline-head">
                      <div>
                        <h3>Email Settings</h3>
                        <p>Konfigurasi email otomatis untuk peserta dan admin</p>
                      </div>
                      <button className="primary-btn" onClick={saveEmailConfig}>
                        {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                      </button>
                    </div>
                    {message && <p className="form-message mb-2">{message}</p>}

                <div className="admin-form-section">
                  <label className="field-block">
                    <div className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={emailConfig.enabled}
                        onChange={(e) => updateEmailConfig('enabled', e.target.checked)}
                      />
                      <span>Aktifkan pengiriman email otomatis</span>
                    </div>
                  </label>

                  <label className="field-block">
                    <span>Resend API Key</span>
                    <input
                      type="password"
                      value={emailConfig.resendApiKey}
                      onChange={(e) => updateEmailConfig('resendApiKey', e.target.value)}
                      placeholder="re_..."
                    />
                  </label>

                  <label className="field-block">
                    <span>From Email</span>
                    <input
                      type="email"
                      value={emailConfig.fromEmail}
                      onChange={(e) => updateEmailConfig('fromEmail', e.target.value)}
                      placeholder="noreply@yourdomain.com"
                    />
                  </label>

                  <label className="field-block">
                    <span>From Name</span>
                    <input
                      value={emailConfig.fromName}
                      onChange={(e) => updateEmailConfig('fromName', e.target.value)}
                      placeholder="Event Team"
                    />
                  </label>
                </div>

                <div className="admin-form-section">
                  <label className="field-block">
                    <span>Reply-To Email</span>
                    <input
                      type="email"
                      value={emailConfig.replyTo || ''}
                      onChange={(e) => updateEmailConfig('replyTo', e.target.value)}
                      placeholder="support@yourdomain.com"
                    />
                  </label>

                  <div className="panel-head compact-head">
                    <div>
                      <h4>Informasi Pembayaran</h4>
                      <p>Data ini ditampilkan di email peserta dan dipakai untuk CTA WhatsApp</p>
                    </div>
                  </div>

                  <div className="admin-form-grid builder-grid">
                    <label className="field-block">
                      <span>Bank</span>
                      <input
                        value={emailConfig.paymentInfo?.bankName || ''}
                        onChange={(e) => updateEmailPaymentInfo('bankName', e.target.value)}
                        placeholder="BCA"
                      />
                    </label>

                    <label className="field-block">
                      <span>No. Rekening</span>
                      <input
                        value={emailConfig.paymentInfo?.accountNumber || ''}
                        onChange={(e) => updateEmailPaymentInfo('accountNumber', e.target.value)}
                        placeholder="0154742588"
                      />
                    </label>

                    <label className="field-block">
                      <span>Atas Nama</span>
                      <input
                        value={emailConfig.paymentInfo?.accountName || ''}
                        onChange={(e) => updateEmailPaymentInfo('accountName', e.target.value)}
                        placeholder="Nama rekening"
                      />
                    </label>

                    <label className="field-block">
                      <span>WhatsApp Konfirmasi</span>
                      <input
                        value={emailConfig.paymentInfo?.confirmWhatsapp || ''}
                        onChange={(e) => updateEmailPaymentInfo('confirmWhatsapp', e.target.value)}
                        placeholder="081231501307"
                      />
                    </label>
                  </div>
                </div>

                <div className="admin-form-section">
                  <div className="panel-head compact-head">
                    <div>
                      <h4>Email Peserta</h4>
                      <p>Email konfirmasi yang dikirim ke peserta setelah pendaftaran</p>
                    </div>
                  </div>

                  <label className="field-block">
                    <div className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={emailConfig.participantEmail.enabled}
                        onChange={(e) => updateEmailConfigNested('participantEmail', 'enabled', e.target.checked)}
                      />
                      <span>Kirim email ke peserta</span>
                    </div>
                  </label>

                  <label className="field-block">
                    <span>Subject</span>
                    <input
                      value={emailConfig.participantEmail.subject}
                      onChange={(e) => updateEmailConfigNested('participantEmail', 'subject', e.target.value)}
                      placeholder="Konfirmasi Pendaftaran"
                    />
                  </label>

                  <label className="field-block">
                    <span>Greeting</span>
                    <input
                      value={emailConfig.participantEmail.template?.greeting || ''}
                      onChange={(e) => updateEmailConfigDeep('participantEmail', 'template', 'greeting', e.target.value)}
                    />
                  </label>

                  <label className="field-block">
                    <span>Body Text</span>
                    <textarea
                      rows="5"
                      value={emailConfig.participantEmail.template?.bodyText || ''}
                      onChange={(e) => updateEmailConfigDeep('participantEmail', 'template', 'bodyText', e.target.value)}
                    />
                  </label>

                  <label className="field-block">
                    <span>Instructions</span>
                    <textarea
                      rows="6"
                      value={emailConfig.participantEmail.template?.instructions || ''}
                      onChange={(e) => updateEmailConfigDeep('participantEmail', 'template', 'instructions', e.target.value)}
                    />
                  </label>

                  <label className="field-block">
                    <span>Footer Text</span>
                    <input
                      value={emailConfig.participantEmail.template?.footerText || ''}
                      onChange={(e) => updateEmailConfigDeep('participantEmail', 'template', 'footerText', e.target.value)}
                    />
                  </label>

                  <label className="field-block">
                    <span>WhatsApp Button Text</span>
                    <input
                      value={emailConfig.participantEmail.template?.whatsappButtonText || ''}
                      onChange={(e) => updateEmailConfigDeep('participantEmail', 'template', 'whatsappButtonText', e.target.value)}
                    />
                  </label>
                </div>

                <div className="admin-form-section">
                  <div className="panel-head compact-head">
                    <div>
                      <h4>Email Admin</h4>
                      <p>Notifikasi yang dikirim ke admin setiap ada pendaftaran baru</p>
                    </div>
                  </div>

                  <label className="field-block">
                    <div className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={emailConfig.adminEmail.enabled}
                        onChange={(e) => updateEmailConfigNested('adminEmail', 'enabled', e.target.checked)}
                      />
                      <span>Kirim notifikasi ke admin</span>
                    </div>
                  </label>

                  <label className="field-block">
                    <span>Admin Email</span>
                    <input
                      type="email"
                      value={emailConfig.adminEmail.recipient}
                      onChange={(e) => updateEmailConfigNested('adminEmail', 'recipient', e.target.value)}
                      placeholder="admin@yourdomain.com"
                    />
                  </label>

                  <label className="field-block">
                    <span>Subject</span>
                    <input
                      value={emailConfig.adminEmail.subject}
                      onChange={(e) => updateEmailConfigNested('adminEmail', 'subject', e.target.value)}
                      placeholder="Pendaftaran Baru"
                    />
                  </label>

                  <label className="field-block">
                    <span>Greeting</span>
                    <input
                      value={emailConfig.adminEmail.template?.greeting || ''}
                      onChange={(e) => updateEmailConfigDeep('adminEmail', 'template', 'greeting', e.target.value)}
                    />
                  </label>

                  <label className="field-block">
                    <span>Body Text</span>
                    <textarea
                      rows="4"
                      value={emailConfig.adminEmail.template?.bodyText || ''}
                      onChange={(e) => updateEmailConfigDeep('adminEmail', 'template', 'bodyText', e.target.value)}
                    />
                  </label>
                </div>

                <div className="admin-form-section">
                  <div className="panel-head compact-head">
                    <div>
                      <h4>Test Email</h4>
                      <p>Kirim test email untuk memastikan konfigurasi bekerja dengan baik</p>
                    </div>
                  </div>

                  <div className="admin-form-grid builder-grid">
                    <label className="field-block">
                      <span>Email Recipient</span>
                      <input
                        type="email"
                        value={testEmailRecipient}
                        onChange={(e) => setTestEmailRecipient(e.target.value)}
                        placeholder="test@example.com"
                      />
                    </label>

                    <label className="field-block">
                      <span>Email Type</span>
                      <select
                        value={testEmailType}
                        onChange={(e) => setTestEmailType(e.target.value)}
                      >
                        <option value="participant">Email Peserta</option>
                        <option value="admin">Email Admin</option>
                      </select>
                    </label>
                  </div>

                  <button 
                    className="ghost-btn" 
                    onClick={sendTestEmail}
                    disabled={sendingTestEmail || !testEmailRecipient}
                  >
                    {sendingTestEmail ? 'Mengirim...' : 'Kirim Test Email'}
                  </button>
                </div>
                  </>
                )}
              </div>
            )}

            {adminTab === 'scanner' && (
              <div className="admin-main-card scanner-card">
                <div className="panel-head inline-head">
                  <div>
                    <h3>Gate Scanner</h3>
                    <p>Scan QR code voucher untuk check-in peserta</p>
                  </div>
                </div>
                {message && <p className="form-message mb-2">{message}</p>}

                <div className="scanner-container">
                  <div className="scanner-input-section">
                    <label className="field-block">
                      <span>Scan QR code (auto-detect)</span>
                      <input
                        ref={scannerInputRef}
                        type="text"
                        value={scannerInput}
                        onChange={handleScannerInputChange}
                        placeholder="Arahkan scanner ke QR code..."
                        autoFocus
                        autoComplete="off"
                        disabled={scannerLoading}
                      />
                    </label>
                    <p className="scanner-hint">Scanner akan otomatis memproses QR code yang terdeteksi</p>
                  </div>

                  <div className="scanner-divider">
                    <span>atau</span>
                  </div>

                  <div className="scanner-manual-section">
                    <form onSubmit={handleManualScannerSubmit}>
                      <label className="field-block">
                        <span>Input manual</span>
                        <input
                          type="text"
                          value={manualScannerInput}
                          onChange={(e) => setManualScannerInput(e.target.value)}
                          placeholder="Ketik kode voucher atau ID peserta..."
                          autoComplete="off"
                          disabled={scannerLoading}
                        />
                      </label>
                      <button 
                        type="submit" 
                        className="btn-primary"
                        disabled={scannerLoading || !manualScannerInput.trim()}
                      >
                        {scannerLoading ? 'Memproses...' : 'Submit Check-in'}
                      </button>
                    </form>
                  </div>

                  {scannerResult && (
                    <div className="scanner-result">
                      <div className={`scanner-status ${scannerResult.status === 'accepted' ? 'success' : 'rejected'}`}>
                        <div className="scanner-icon">
                          {scannerResult.status === 'accepted' ? '✓' : '✗'}
                        </div>
                        <h4 className="scanner-status-text">
                          {scannerResult.status === 'accepted' ? 'Check-in Berhasil' : 
                           scannerResult.status === 'error' ? 'Error' : 'Check-in Ditolak'}
                        </h4>
                        <p className="scanner-reason">{scannerResult.reason}</p>
                        {scannerResult.checkedInAt && (
                          <p className="scanner-timestamp">
                            Waktu check-in: {new Date(scannerResult.checkedInAt).toLocaleString('id-ID')}
                          </p>
                        )}
                      </div>
                      {scannerResult.submission && (
                        <div className="scanner-participant-info">
                          <h5>Informasi Peserta</h5>
                          <div className="scanner-info-grid">
                            {(scannerResult.submission.answers || []).map((answer, idx) => (
                              <div key={idx} className="scanner-info-item">
                                <strong>{answer.label}:</strong> {answer.value}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <button 
                        className="btn-secondary mt-2"
                        onClick={resetScannerResult}
                      >
                        Scan Berikutnya
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="auth-layout">
          <section className="auth-card">
            <span className="eyebrow">Admin access</span>
            <h2>Login untuk masuk dashboard</h2>
            <p>Dashboard admin dilindungi. Gunakan akun admin untuk mengelola field, poster, dan data pendaftaran.</p>
            <form
              className="registration-form"
              onSubmit={handleAdminLogin}
              aria-label="Formulir login admin"
            >
              <label className="field-block">
                <span>Username</span>
                <input
                  id="admin-username"
                  autoComplete="username"
                  aria-required="true"
                  aria-label="Username admin"
                  value={loginForm.username}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </label>
              <label className="field-block">
                <span>Password</span>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  aria-required="true"
                  aria-label="Password admin"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>
              <button
                type="submit"
                className="primary-btn full-width"
                disabled={loginLoading}
                aria-busy={loginLoading}
              >
                {loginLoading ? 'Sedang login...' : 'Login Admin'}
              </button>
            </form>
            {loginError ? <p className="form-message error" role="alert" aria-live="assertive">{loginError}</p> : null}
            <p className="helper-text">Masukkan kredensial admin yang telah dikonfigurasi.</p>
          </section>
        </main>
      )}
    </div>
  )
}

export default App
