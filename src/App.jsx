import { useEffect, useMemo, useRef, useState } from 'react'
import './index.css'

const defaultSchema = {
  eventName: 'Gelaran Heritage Fest 2026',
  tagline: 'Pendaftaran peserta event yang modern, rapi, dan tanpa Google Form.',
  description:
    'Kelola event, kumpulkan data peserta, dan publikasikan poster acara dalam satu webapp yang mudah digunakan.',
  location: 'Solo, Indonesia',
  date: '24 - 26 Agustus 2026',
  poster: '/design-reference.png',
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
  { value: 'withEmail', label: 'Ada email' },
]

const submissionSorts = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'oldest', label: 'Terlama' },
  { value: 'nameAsc', label: 'Nama A-Z' },
  { value: 'nameDesc', label: 'Nama Z-A' },
]

function formatOptions(options = '') {
  return options
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function apiUrl(path) {
  return path
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
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers: isFormData
      ? options.headers
      : {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
  })

  return response
}

function App() {
  const [activeView, setActiveView] = useState('public')
  const [adminTab, setAdminTab] = useState('settings')
  const [schema, setSchema] = useState(defaultSchema)
  const [submissions, setSubmissions] = useState([])
  const [formData, setFormData] = useState({})
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: 'admin', password: 'admin123' })
  const [loginError, setLoginError] = useState('')
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionQuery, setSubmissionQuery] = useState('')
  const [submissionFilter, setSubmissionFilter] = useState('all')
  const [submissionSort, setSubmissionSort] = useState('newest')
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingSubmissionId, setDeletingSubmissionId] = useState('')
  const fileInputRef = useRef(null)
  const pageSize = 5

  useEffect(() => {
    async function loadPublicData() {
      try {
        const schemaResponse = await fetch(apiUrl('/api/schema'))
        const schemaData = await schemaResponse.json()
        setSchema(schemaData)
      } catch {
        setMessage('Gagal memuat data event dari server.')
      } finally {
        setLoading(false)
      }
    }

    async function checkSession() {
      try {
        const response = await apiFetch('/api/auth/session')
        const data = await response.json()
        setIsAdminAuthenticated(data.authenticated)
      } catch {
        setIsAdminAuthenticated(false)
      }
    }

    loadPublicData()
    checkSession()
  }, [])

  useEffect(() => {
    if (activeView === 'admin' && isAdminAuthenticated) {
      loadAdminData()
    }
  }, [activeView, isAdminAuthenticated])

  useEffect(() => {
    setCurrentPage(1)
  }, [submissionQuery, submissionFilter, submissionSort])

  const filteredSubmissions = useMemo(() => {
    const normalizedQuery = submissionQuery.trim().toLowerCase()
    const todayIso = new Date().toISOString().slice(0, 10)

    const filtered = submissions.filter((submission) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        submission.answers.some(
          (answer) =>
            answer.label.toLowerCase().includes(normalizedQuery) ||
            String(answer.value).toLowerCase().includes(normalizedQuery),
        )

      const matchesFilter =
        submissionFilter === 'all' ||
        (submissionFilter === 'today' &&
          String(submission.submittedAtIso || '').startsWith(todayIso)) ||
        (submissionFilter === 'withEmail' &&
          submission.answers.some((answer) => answer.label.toLowerCase().includes('email')))

      return matchesQuery && matchesFilter
    })

    return filtered.toSorted((left, right) => {
      if (submissionSort === 'oldest') return getSubmissionTimeValue(left) - getSubmissionTimeValue(right)
      if (submissionSort === 'nameAsc') return getPrimaryAnswer(left).localeCompare(getPrimaryAnswer(right), 'id')
      if (submissionSort === 'nameDesc') return getPrimaryAnswer(right).localeCompare(getPrimaryAnswer(left), 'id')
      return getSubmissionTimeValue(right) - getSubmissionTimeValue(left)
    })
  }, [submissionFilter, submissionQuery, submissionSort, submissions])

  const analytics = useMemo(() => {
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
  }, [filteredSubmissions, schema.fields])

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize))
  const paginatedSubmissions = filteredSubmissions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )

  const stats = useMemo(() => {
    return [
      { label: 'Field aktif', value: schema.fields.length },
      { label: 'Total pendaftar', value: submissions.length },
      {
        label: 'Field wajib',
        value: schema.fields.filter((field) => field.required).length,
      },
    ]
  }, [schema.fields, submissions.length])

  async function loadAdminData() {
    setSubmissionsLoading(true)
    try {
      const [schemaResponse, submissionsResponse] = await Promise.all([
        apiFetch('/api/schema'),
        apiFetch('/api/submissions'),
      ])

      if (submissionsResponse.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Sesi admin berakhir. Silakan login lagi.')
        return
      }

      const [schemaData, submissionsData] = await Promise.all([
        schemaResponse.json(),
        submissionsResponse.json(),
      ])

      setSchema(schemaData)
      setSubmissions(submissionsData)
    } catch {
      setMessage('Gagal memuat data admin dari server.')
    } finally {
      setSubmissionsLoading(false)
    }
  }

  async function saveSchemaToServer(nextSchema) {
    setSaving(true)
    try {
      const response = await apiFetch('/api/schema', {
        method: 'PUT',
        body: JSON.stringify(nextSchema),
      })

      if (response.status === 401) {
        setIsAdminAuthenticated(false)
        setLoginError('Anda harus login sebagai admin.')
        return
      }

      const savedSchema = await response.json()
      setSchema(savedSchema)
      setMessage('Perubahan event berhasil disimpan ke server.')
    } catch {
      setMessage('Gagal menyimpan perubahan ke server.')
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
        ...current.fields,
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
      fields: current.fields.map((field) =>
        field.id === id ? { ...field, [key]: value } : field,
      ),
    }))
  }

  function removeField(id) {
    setSchema((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== id),
    }))
  }

  async function handlePosterUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

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

      const data = await response.json()
      setSchema((current) => ({ ...current, poster: data.posterUrl }))
      setMessage('Poster berhasil diupload. Klik simpan perubahan untuk menyimpan schema.')
    } catch {
      setMessage('Gagal upload poster.')
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
      const response = await apiFetch('/api/submissions', {
        method: 'POST',
        body: JSON.stringify(newEntry),
      })
      const savedEntry = await response.json()
      setSubmissions((current) => [savedEntry, ...current])
      setFormData({})
      setMessage('Pendaftaran berhasil dikirim. Data peserta sudah tersimpan di server.')
    } catch {
      setMessage('Gagal mengirim pendaftaran.')
    }
  }

  async function handleSaveAll() {
    setMessage('')
    await saveSchemaToServer(schema)
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
      setSchema(data.schema)
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
    } catch {
      setMessage('Gagal menghapus data peserta.')
    } finally {
      setDeletingSubmissionId('')
    }
  }

  function exportCsv() {
    const params = new URLSearchParams({
      query: submissionQuery,
      filter: submissionFilter,
    })
    window.open(`${apiUrl('/api/export.csv')}?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  async function handleAdminLogin(event) {
    event.preventDefault()
    setLoginError('')

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
      await loadAdminData()
    } catch {
      setLoginError('Tidak dapat terhubung ke server auth.')
    }
  }

  async function handleAdminLogout() {
    await apiFetch('/api/auth/logout', { method: 'POST' })
    setIsAdminAuthenticated(false)
    setActiveView('public')
    setLoginError('')
    setMessage('Anda sudah logout dari dashboard admin.')
  }

  if (loading) {
    return <div className="loading-screen">Memuat webapp event...</div>
  }

  return (
    <div className="app-shell">
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
              <span className="eyebrow">Event registration</span>
              <h2>
                Discover the <span>Soul</span> of seamless registration.
              </h2>
              <p>{schema.tagline}</p>

              <div className="meta-row">
                <div>
                  <span>Lokasi</span>
                  <strong>{schema.location}</strong>
                </div>
                <div>
                  <span>Tanggal</span>
                  <strong>{schema.date}</strong>
                </div>
              </div>

              <div className="hero-actions">
                <a href="#registration-form" className="primary-btn">
                  Daftar Sekarang
                </a>
                <button className="ghost-btn" onClick={() => setActiveView('admin')}>
                  Buka Admin
                </button>
              </div>
            </div>

            <div className="poster-card">
              <img src={schema.poster} alt={schema.eventName} />
              <div className="poster-badge">
                <span>Poster event</span>
                <strong>{schema.eventName}</strong>
              </div>
            </div>
          </section>

          <section className="stats-row">
            {stats.map((item) => (
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
                <li>Pengalaman pendaftaran lebih profesional daripada Google Form.</li>
                <li>Poster event tampil langsung di landing page.</li>
                <li>Field pendaftaran bisa diatur ulang kapan saja oleh admin.</li>
              </ul>
            </article>

            <article className="form-panel" id="registration-form">
              <div className="panel-head">
                <span className="eyebrow">Form pendaftaran</span>
                <h3>Isi data peserta</h3>
              </div>

              <form className="registration-form" onSubmit={handleSubmit}>
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
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={value}
                          onChange={(event) => handleFormValue(field.id, event.target.value, field.type)}
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
                          />
                          <p>Saya menyetujui syarat dan ketentuan pendaftaran.</p>
                        </div>
                      ) : (
                        <input
                          type={field.type}
                          placeholder={field.placeholder}
                          value={value}
                          onChange={(event) => handleFormValue(field.id, event.target.value, field.type)}
                        />
                      )}
                    </label>
                  )
                })}

                <button type="submit" className="primary-btn full-width">
                  Kirim Pendaftaran
                </button>
              </form>

              {message ? <p className="form-message">{message}</p> : null}
            </article>
          </section>
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
                Informasi Event
              </button>
              <button
                className={adminTab === 'builder' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setAdminTab('builder')}
              >
                Form Builder
              </button>
              <button
                className={adminTab === 'submissions' ? 'sidebar-btn active' : 'sidebar-btn'}
                onClick={() => setAdminTab('submissions')}
              >
                Data Pendaftar ({submissions.length})
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
              <div className="admin-main-card">
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
                    <img src={schema.poster} alt="Current poster" className="mini-poster" />
                    <button className="ghost-btn" onClick={() => fileInputRef.current?.click()}>
                      Ganti Poster
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
              </div>
            )}

            {adminTab === 'builder' && (
              <div className="admin-main-card">
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
                  {schema.fields.map((field, index) => (
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
              <div className="admin-main-card">
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

                <div className="submission-toolbar three-cols">
                  <input
                    value={submissionQuery}
                    onChange={(event) => setSubmissionQuery(event.target.value)}
                    placeholder="Cari nama, email, nomor..."
                  />
                  <select
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
                  <p className="empty-state">Memuat data peserta...</p>
                ) : (
                  <>
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Waktu Daftar</th>
                            {schema.fields.map((field) => (
                              <th key={field.id}>{field.label}</th>
                            ))}
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedSubmissions.length === 0 ? (
                            <tr>
                              <td colSpan={schema.fields.length + 2} className="text-center py-4">
                                Tidak ada data yang cocok.
                              </td>
                            </tr>
                          ) : (
                            paginatedSubmissions.map((sub) => (
                              <tr key={sub.id}>
                                <td>{formatSubmissionDate(sub).day}<br/><small>{formatSubmissionDate(sub).time}</small></td>
                                {schema.fields.map((field) => {
                                  const answer = sub.answers.find((a) => a.label === field.label)
                                  return <td key={field.id}>{answer ? answer.value : '-'}</td>
                                })}
                                <td>
                                  <button
                                    className="delete-btn-small"
                                    onClick={() => deleteSubmissionById(sub.id)}
                                    disabled={deletingSubmissionId === sub.id}
                                  >
                                    {deletingSubmissionId === sub.id ? '...' : 'Hapus'}
                                  </button>
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
                  </>
                )}
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
            <form className="registration-form" onSubmit={handleAdminLogin}>
              <label className="field-block">
                <span>Username</span>
                <input
                  value={loginForm.username}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, username: event.target.value }))
                  }
                />
              </label>
              <label className="field-block">
                <span>Password</span>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </label>
              <button type="submit" className="primary-btn full-width">
                Login Admin
              </button>
            </form>
            {loginError ? <p className="form-message error">{loginError}</p> : null}
            <p className="helper-text">Default demo login: `admin` / `admin123`</p>
          </section>
        </main>
      )}
    </div>
  )
}

export default App
