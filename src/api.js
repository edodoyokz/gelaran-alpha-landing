export const defaultSchema = {
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
  registrationSettings: {
    mode: 'auto',
    paidQuotaLimit: 0,
    closedMessage: 'Pendaftaran sudah ditutup. Nantikan event kami berikutnya.',
  },
}

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

let csrfToken = null

export function setCsrfToken(token) {
  csrfToken = token || null
}

export function ensureArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback
}

export function normalizeSchema(inputSchema = {}) {
  const merged = {
    ...defaultSchema,
    ...inputSchema,
  }

  return {
    ...merged,
    fields: ensureArray(inputSchema?.fields, defaultSchema.fields),
    highlights: ensureArray(inputSchema?.highlights, defaultSchema.highlights),
    features: ensureArray(inputSchema?.features, defaultSchema.features),
    registrationSettings: {
      ...defaultSchema.registrationSettings,
      ...(inputSchema?.registrationSettings || {}),
    },
  }
}

export function apiUrl(path) {
  if (/^https?:\/\//.test(path)) return path
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path
}

export async function apiFetch(path, options = {}) {
  const isFormData = options.body instanceof FormData
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method || 'GET')

  const headers = isFormData
    ? options.headers || {}
    : {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      }

  if (isStateChanging && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  return fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers,
  })
}
