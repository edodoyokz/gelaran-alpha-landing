import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ScannerCamera from '../components/ScannerCamera.jsx'
import { apiFetch, defaultSchema, normalizeSchema, setCsrfToken } from '../api.js'
import { logError } from '../errorTracker.js'

function isAlreadyCheckedIn(result) {
  const reason = String(result?.reason || '').toLowerCase()
  return result?.status === 'already' || reason.includes('sudah') || reason.includes('already')
}

function getResultMeta(result) {
  if (!result) {
    return {
      tone: 'idle',
      icon: '•',
      label: 'Menunggu Scan',
      scannerLabel: 'SIAP SCAN',
      accentClass: 'border-slate-700/70 bg-slate-950/80 text-slate-200',
      glowClass: 'from-emerald-400/10 via-transparent to-transparent',
      cameraStateClass: 'is-idle',
      pageStateClass: 'has-idle',
    }
  }

  if (result.status === 'accepted') {
    return {
      tone: 'accepted',
      icon: '✓',
      label: 'Check-in Berhasil',
      scannerLabel: 'VALID',
      accentClass: 'border-emerald-400/50 bg-emerald-500/15 text-emerald-50',
      glowClass: 'from-emerald-400/35 via-emerald-400/5 to-transparent',
      cameraStateClass: 'is-success',
      pageStateClass: 'has-success',
    }
  }

  if (isAlreadyCheckedIn(result)) {
    return {
      tone: 'already',
      icon: '!',
      label: 'Sudah Check-in',
      scannerLabel: 'SUDAH MASUK',
      accentClass: 'border-amber-300/60 bg-amber-400/15 text-amber-50',
      glowClass: 'from-amber-300/35 via-amber-300/5 to-transparent',
      cameraStateClass: 'is-warning',
      pageStateClass: 'has-warning',
    }
  }

  return {
    tone: 'rejected',
    icon: '✗',
    label: result.status === 'error' ? 'Error' : 'Check-in Ditolak',
    scannerLabel: 'DITOLAK',
    accentClass: 'border-rose-400/60 bg-rose-500/15 text-rose-50',
    glowClass: 'from-rose-400/35 via-rose-400/5 to-transparent',
    cameraStateClass: 'is-danger',
    pageStateClass: 'has-danger',
  }
}

function getParticipantDisplayName(result) {
  const answers = result?.submission?.answers
  if (!Array.isArray(answers)) return ''

  const nameAnswer = answers.find((answer) => {
    const label = String(answer?.label || '').toLowerCase()
    return label.includes('nama') || label.includes('name')
  })

  return String(nameAnswer?.value || answers[0]?.value || '').trim()
}

function vibrateForResult(result) {
  if (!navigator.vibrate) return
  navigator.vibrate(result.status === 'accepted' ? [80, 40, 80] : [160, 80, 160])
}

function playScanTone(result) {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  try {
    const audioContext = new AudioContext()
    const pattern = result.status === 'accepted'
      ? [{ frequency: 880, start: 0, duration: 0.12 }]
      : [
          { frequency: 220, start: 0, duration: 0.11 },
          { frequency: 220, start: 0.18, duration: 0.14 },
        ]

    pattern.forEach(({ frequency, start, duration }) => {
      const oscillator = audioContext.createOscillator()
      const gain = audioContext.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      gain.connect(audioContext.destination)
      const startAt = audioContext.currentTime + start
      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)
      oscillator.start(startAt)
      oscillator.stop(startAt + duration + 0.02)
    })

    window.setTimeout(() => audioContext.close().catch(() => {}), 700)
  } catch (error) {
    logError(error, { context: 'gateScanner:audioFeedback' })
  }
}

function GateScannerLogin({ loginForm, loginError, loginLoading, onChange, onSubmit, schema }) {
  return (
    <main className="gate-scanner-page gate-login-page min-h-dvh overflow-hidden bg-[#050607] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.24),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(248,113,113,0.16),transparent_28%),linear-gradient(135deg,#050607,#08110f_48%,#030404)]" />
      <section className="relative z-10 mx-auto flex min-h-dvh w-full max-w-5xl items-center justify-center px-5 py-10">
        <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.07] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
          <div className="mb-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.35em] text-emerald-300">Gate Scanner</p>
            <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">Login Admin</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Masuk untuk mengaktifkan scanner check-in {schema.eventName}.
            </p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit} aria-label="Formulir login gate scanner">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Username</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-300/10"
                autoComplete="username"
                value={loginForm.username}
                onChange={(event) => onChange({ ...loginForm, username: event.target.value })}
                disabled={loginLoading}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-200">Password</span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-300/10"
                type="password"
                autoComplete="current-password"
                value={loginForm.password}
                onChange={(event) => onChange({ ...loginForm, password: event.target.value })}
                disabled={loginLoading}
              />
            </label>
            <button
              type="submit"
              className="w-full rounded-2xl bg-emerald-300 px-5 py-3 font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loginLoading}
            >
              {loginLoading ? 'Sedang login...' : 'Aktifkan Scanner'}
            </button>
          </form>

          {loginError ? (
            <p className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/15 px-4 py-3 text-sm font-semibold text-rose-100" role="alert">
              {loginError}
            </p>
          ) : null}
          <a className="mt-6 inline-flex text-sm font-semibold text-slate-400 transition hover:text-white" href="/">
            Kembali ke halaman utama
          </a>
        </div>
      </section>
    </main>
  )
}

export default function GateScanner() {
  const [schema, setSchema] = useState(defaultSchema)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [scannerInput, setScannerInput] = useState('')
  const [manualScannerInput, setManualScannerInput] = useState('')
  const [scannerLoading, setScannerLoading] = useState(false)
  const [scannerResult, setScannerResult] = useState(null)
  const scannerAutoClearTimeoutRef = useRef(null)
  const scannerInputRef = useRef(null)
  const scannerLoadingRef = useRef(false)

  const resultMeta = useMemo(() => getResultMeta(scannerResult), [scannerResult])

  const checkSession = useCallback(async (signal) => {
    try {
      const response = await apiFetch('/api/auth/session', { signal })
      if (signal?.aborted) return false
      const data = await response.json()
      if (signal?.aborted) return false

      setIsAdminAuthenticated(Boolean(data.authenticated))
      if (data.csrfToken) setCsrfToken(data.csrfToken)
      return Boolean(data.authenticated)
    } catch (error) {
      if (!signal?.aborted) {
        logError(error, { context: 'gateScanner:checkSession' })
        setIsAdminAuthenticated(false)
      }
      return false
    } finally {
      if (!signal?.aborted) setSessionChecked(true)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadGateData() {
      try {
        const schemaResponse = await apiFetch('/api/schema', { signal: controller.signal })
        if (schemaResponse.ok) {
          const schemaData = await schemaResponse.json()
          if (!controller.signal.aborted) setSchema(normalizeSchema(schemaData))
        }
      } catch (error) {
        if (error.name !== 'AbortError') logError(error, { context: 'gateScanner:loadSchema' })
      }

      await checkSession(controller.signal)
    }

    loadGateData()

    return () => controller.abort()
  }, [checkSession])

  useEffect(() => {
    if (isAdminAuthenticated) scannerInputRef.current?.focus()
  }, [isAdminAuthenticated])

  useEffect(() => {
    return () => {
      if (scannerAutoClearTimeoutRef.current) clearTimeout(scannerAutoClearTimeoutRef.current)
    }
  }, [])

  const scheduleClear = useCallback((source) => {
    scannerAutoClearTimeoutRef.current = window.setTimeout(() => {
      setScannerResult(null)
      setScannerInput('')
      setManualScannerInput('')
      if (source !== 'camera') scannerInputRef.current?.focus()
      scannerAutoClearTimeoutRef.current = null
    }, 5000)
  }, [])

  const submitGateScan = useCallback(async (scanValue, source = 'auto') => {
    const trimmedScanValue = scanValue.trim()
    if (!trimmedScanValue || scannerLoadingRef.current) return

    scannerLoadingRef.current = true
    setScannerLoading(true)
    if (scannerAutoClearTimeoutRef.current) {
      clearTimeout(scannerAutoClearTimeoutRef.current)
      scannerAutoClearTimeoutRef.current = null
    }

    try {
      const response = await apiFetch('/api/submissions/check-in', {
        method: 'POST',
        body: JSON.stringify({ scanValue: trimmedScanValue }),
      })

      if (response.status === 401) {
        const expiredResult = {
          status: 'error',
          reason: 'Sesi admin berakhir. Silakan login ulang untuk melanjutkan scan.',
          submission: null,
          checkedInAt: null,
          scanValue: trimmedScanValue,
        }
        setScannerResult(expiredResult)
        vibrateForResult(expiredResult)
        playScanTone(expiredResult)
        setIsAdminAuthenticated(false)
        setLoginError('Sesi admin berakhir. Silakan login ulang.')
        return
      }

      const data = await response.json()
      const nextResult = data.success && data.status === 'accepted'
        ? {
            status: 'accepted',
            reason: 'Peserta berhasil check-in',
            submission: data.submission,
            checkedInAt: data.checkedInAt,
            scanValue: trimmedScanValue,
          }
        : {
            status: isAlreadyCheckedIn(data) ? 'already' : 'rejected',
            reason: data.reason || 'Peserta tidak dapat check-in',
            submission: data.submission || null,
            checkedInAt: data.checkedInAt || null,
            scanValue: trimmedScanValue,
          }

      setScannerResult(nextResult)
      vibrateForResult(nextResult)
      playScanTone(nextResult)
      scheduleClear(source)
    } catch (error) {
      logError(error, { context: 'gateScanner:submitGateScan' })
      const errorResult = {
        status: 'error',
        reason: 'Terjadi kesalahan saat memproses scan',
        submission: null,
        checkedInAt: null,
        scanValue: trimmedScanValue,
      }
      setScannerResult(errorResult)
      vibrateForResult(errorResult)
      playScanTone(errorResult)
      scheduleClear(source)
    } finally {
      scannerLoadingRef.current = false
      setScannerLoading(false)
    }
  }, [scheduleClear])

  const handleCameraScan = useCallback((scanValue) => {
    submitGateScan(scanValue, 'camera')
  }, [submitGateScan])

  const handleScannerInputChange = useCallback((event) => {
    setScannerInput(event.target.value)
  }, [])

  const handleManualScannerSubmit = useCallback((event) => {
    event.preventDefault()
    if (manualScannerInput.trim()) submitGateScan(manualScannerInput, 'manual')
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

  useEffect(() => {
    if (!isAdminAuthenticated || !scannerInput.trim()) return undefined

    const timeout = window.setTimeout(() => {
      if (scannerInput.trim()) submitGateScan(scannerInput, 'auto')
    }, 500)

    return () => clearTimeout(timeout)
  }, [scannerInput, isAdminAuthenticated, submitGateScan])

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

      setIsAdminAuthenticated(Boolean(data.authenticated))
      await checkSession()
    } catch (error) {
      logError(error, { context: 'gateScanner:login' })
      setLoginError('Tidak dapat terhubung ke server auth.')
    } finally {
      setLoginLoading(false)
    }
  }

  if (!sessionChecked) {
    return (
      <main className="gate-scanner-page flex min-h-dvh items-center justify-center bg-[#050607] text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] px-6 py-5 text-center shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-300">Gate Scanner</p>
          <p className="mt-2 text-sm text-slate-300">Memeriksa sesi admin...</p>
        </div>
      </main>
    )
  }

  if (!isAdminAuthenticated) {
    return (
      <GateScannerLogin
        loginForm={loginForm}
        loginError={loginError}
        loginLoading={loginLoading}
        onChange={setLoginForm}
        onSubmit={handleAdminLogin}
        schema={schema}
      />
    )
  }

  return (
    <main className={`gate-scanner-page ${resultMeta.pageStateClass} min-h-dvh overflow-hidden bg-[#030505] text-white`}>
      <input
        ref={scannerInputRef}
        className="gate-hardware-input"
        type="text"
        value={scannerInput}
        onChange={handleScannerInputChange}
        autoComplete="off"
        aria-label="Input hardware scanner"
        disabled={scannerLoading}
      />

      <div className={`pointer-events-none fixed inset-0 bg-radial-gradient ${resultMeta.glowClass}`} />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/50 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.62rem] font-black uppercase tracking-[0.32em] text-emerald-300">Gate Scanner</p>
              <h1 className="truncate text-base font-black leading-tight text-white sm:text-xl">{schema.eventName}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-emerald-300/40 bg-emerald-300/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-200">Aktif</span>
              <a className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/20 sm:px-4" href="/">
                Tutup
              </a>
            </div>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-7xl flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:p-6">
          <div className={`gate-camera-shell ${resultMeta.cameraStateClass} relative min-h-[70dvh] overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-[0_25px_90px_rgba(0,0,0,0.45)] lg:min-h-0`}>
            <ScannerCamera onScan={handleCameraScan} isActive={true} dedupeCooldown={2500} />
            <div className="gate-scan-tint" aria-hidden="true" />
            {scannerLoading ? (
              <div className="absolute left-4 top-4 z-20 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-200 backdrop-blur">
                Memproses
              </div>
            ) : null}
            {scannerResult ? (
              <div className="gate-result-flash pointer-events-none absolute inset-0 z-20 grid place-items-center px-5 text-center" aria-live="assertive">
                <div className="gate-result-flash-card max-w-[min(34rem,calc(100vw-2.5rem))] rounded-[2rem] border px-6 py-7 shadow-2xl backdrop-blur-xl sm:px-8 sm:py-8">
                  <div className="mx-auto mb-4 grid size-24 place-items-center rounded-full bg-white/18 text-6xl font-black leading-none sm:size-28 sm:text-7xl">
                    {resultMeta.icon}
                  </div>
                  <p className="text-sm font-black uppercase tracking-[0.32em] opacity-80">{resultMeta.scannerLabel}</p>
                  <h2 className="mt-2 text-3xl font-black leading-tight sm:text-5xl">{resultMeta.label}</h2>
                  {getParticipantDisplayName(scannerResult) ? (
                    <p className="mt-3 truncate text-lg font-bold opacity-90 sm:text-2xl">{getParticipantDisplayName(scannerResult)}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {scannerResult ? (
              <div className={`absolute inset-x-3 bottom-3 z-30 rounded-[1.5rem] border p-4 shadow-2xl backdrop-blur-xl lg:hidden ${resultMeta.accentClass}`}>
                <div className="flex items-center gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/15 text-2xl font-black">{resultMeta.icon}</span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black">{resultMeta.label}</h2>
                    <p className="line-clamp-2 text-sm opacity-85">{scannerResult.reason}</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="flex min-h-0 flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-[0_25px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl lg:overflow-y-auto">
            <section className={`rounded-[1.5rem] border p-5 ${resultMeta.accentClass}`} aria-live="polite">
              <div className="flex items-start gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-white/15 text-3xl font-black">{resultMeta.icon}</span>
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] opacity-75">Status</p>
                  <h2 className="mt-1 text-2xl font-black leading-tight">{resultMeta.label}</h2>
                  <p className="mt-2 text-sm leading-6 opacity-85">
                    {scannerResult?.reason || 'Arahkan QR code peserta ke kamera atau gunakan scanner hardware.'}
                  </p>
                </div>
              </div>

              {scannerResult?.checkedInAt ? (
                <p className="mt-4 rounded-2xl bg-black/20 px-4 py-3 text-sm font-semibold">
                  {new Date(scannerResult.checkedInAt).toLocaleString('id-ID')}
                </p>
              ) : null}

              {scannerResult?.submission ? (
                <div className="mt-4 rounded-2xl bg-black/20 p-4">
                  <h3 className="mb-3 text-sm font-black uppercase tracking-[0.18em] opacity-80">Info Peserta</h3>
                  <div className="space-y-2">
                    {(scannerResult.submission.answers || []).map((answer, index) => (
                      <p key={`${answer.label}-${index}`} className="text-sm leading-6">
                        <span className="font-bold opacity-70">{answer.label}:</span> {answer.value}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {scannerResult ? (
                <button
                  className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-100"
                  onClick={resetScannerResult}
                >
                  Scan Berikutnya
                </button>
              ) : null}
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-black/25 p-5">
              <div className="mb-4">
                <h3 className="text-lg font-black text-white">Manual Input</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">Gunakan jika QR tidak terbaca atau scanner hardware tidak aktif.</p>
              </div>
              <form className="space-y-3" onSubmit={handleManualScannerSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-slate-200">ID / Voucher Code</span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-white outline-none transition focus:border-emerald-300 focus:ring-4 focus:ring-emerald-300/10"
                    type="text"
                    value={manualScannerInput}
                    onChange={(event) => setManualScannerInput(event.target.value)}
                    placeholder="Ketik kode peserta..."
                    autoComplete="off"
                    disabled={scannerLoading}
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={scannerLoading || !manualScannerInput.trim()}
                >
                  {scannerLoading ? 'Memproses...' : 'Submit Manual'}
                </button>
              </form>
            </section>
          </aside>
        </section>
      </div>
    </main>
  )
}
