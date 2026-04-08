# Vercel + Supabase Hybrid Deployment Design

## Goal

Menyiapkan project event registration ini agar layak deploy ke production dengan arsitektur hybrid: frontend di Vercel, data utama di Supabase, dan Google Drive tetap opsional hanya untuk file poster jika masih dibutuhkan.

## Current State Summary

Repository ini saat ini adalah aplikasi full-stack ringan dengan karakteristik berikut:

- Frontend memakai Vite + React.
- Backend memakai Express di `server/index.js`.
- Data utama masih disimpan di `data/db.json` atau Google Drive melalui `server/store.js` dan `server/driveStorage.js`.
- Auth admin masih memakai session in-memory melalui `activeSessions = new Set()`.
- Upload poster bisa disimpan lokal ke `public/uploads` atau ke Google Drive.

Konfigurasi ini cukup untuk local development, tetapi tidak cocok untuk production di Vercel karena filesystem tidak persisten dan session in-memory tidak stabil pada runtime serverless.

## Recommended Architecture

### 1. Frontend Hosting

Frontend tetap dibangun dengan Vite dan dideploy ke Vercel.

Tujuannya:

- memanfaatkan pipeline build yang sederhana dari Vite,
- memudahkan deployment preview,
- menjaga UI tetap terpisah dari concern storage dan persistence.

### 2. Primary Data Store

Semua data utama dipindahkan ke Supabase, minimal mencakup:

- event settings / event schema,
- daftar submissions,
- metadata poster bila poster URL dikelola dari backend.

Supabase dipilih karena:

- persistence-nya stabil untuk production,
- cocok untuk CRUD data admin dan pendaftar,
- menghilangkan ketergantungan pada `data/db.json`,
- lebih sesuai untuk export, query, dan pengembangan berikutnya.

### 3. File Storage

Google Drive tetap dipertahankan sebagai adapter file opsional untuk poster.

Aturan desainnya:

- Google Drive tidak lagi menjadi sumber data utama.
- Jika poster tetap di-upload ke Google Drive, backend hanya mengembalikan URL file.
- URL poster tersebut disimpan di Supabase bersama schema / settings event.

Pendekatan ini menjaga integrasi yang sudah ada sambil mengurangi scope migrasi.

### 4. Authentication

Auth admin saat ini tidak layak production karena state session hanya hidup di memory proses.

Pengganti yang dibutuhkan:

- session yang persisten, atau
- auth yang berbasis Supabase / token / cookie yang tervalidasi secara server-side.

Untuk fase persiapan deploy, target minimumnya adalah menghapus ketergantungan pada in-memory session sehingga login admin tidak hilang saat runtime berganti instance.

### 5. API Layer

Kontrak API yang sudah ada sebaiknya dipertahankan sebisa mungkin agar perubahan di UI tetap kecil.

Endpoint penting yang perlu tetap tersedia:

- `GET /api/schema`
- `PUT /api/schema`
- `GET /api/submissions`
- `POST /api/submissions`
- `DELETE /api/submissions/:id`
- `POST /api/upload-poster`
- `GET /api/export.csv`
- login/logout/session endpoints admin

Yang berubah terutama adalah implementation detail storage dan auth, bukan bentuk fitur.

## Proposed Data Model

Model awal dibuat sesederhana mungkin agar migrasi fokus pada deploy-readiness.

### `event_settings`

Menyimpan:

- event name,
- tagline,
- description,
- location,
- date,
- poster URL.

### `event_fields`

Menyimpan field schema dinamis untuk form:

- field id,
- label,
- type,
- required,
- placeholder,
- options,
- ordering.

### `submissions`

Menyimpan data pendaftaran peserta, termasuk:

- id,
- submittedAt,
- submittedAtIso,
- payload jawaban.

Payload jawaban bisa disimpan dalam bentuk JSON agar migrasi dari struktur sekarang tetap sederhana.

## Environment Strategy

### Client-side variables

Semua variable yang perlu diakses frontend harus memakai prefix `VITE_`.

Contoh:

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Server-side secrets

Secret server-side tetap tanpa prefix `VITE_`.

Contoh:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

## Security Requirements

File `skp-yk-8b3252125cd6.json` harus dianggap sebagai secret yang sudah terekspos.

Tindakan wajib:

1. rotate Google service account key,
2. hapus file credential dari repo,
3. pindahkan credential ke environment variables deployment,
4. cegah file credential serupa ikut ter-commit lagi.

Ini bukan improvement opsional; ini blocker untuk production.

## Deployment Readiness Requirements

Agar arsitektur ini dianggap siap deploy, kondisi berikut harus terpenuhi:

1. Frontend build berhasil di Vercel.
2. API tidak lagi bergantung pada local JSON storage atau local upload persistence.
3. Data utama sudah dibaca dan ditulis ke Supabase.
4. Login admin tidak lagi memakai session in-memory.
5. Credential Google Drive tidak lagi berasal dari file JSON yang tersimpan di repo.
6. Dokumentasi env dan langkah deploy tersedia.

## Testing Strategy

Validasi minimum setelah implementasi:

- build frontend berhasil,
- schema event bisa dimuat,
- submission publik tersimpan ke Supabase,
- admin login berhasil,
- admin bisa update schema,
- admin bisa melihat dan menghapus submissions,
- export CSV tetap berfungsi,
- upload poster tetap bekerja pada jalur storage yang dipilih.

## Out of Scope

Hal-hal berikut tidak wajib dikerjakan pada fase ini kecuali dibutuhkan saat implementasi:

- redesign UI,
- perubahan fitur produk,
- analytics yang lebih kompleks,
- multi-admin role management,
- migrasi penuh poster ke Supabase Storage.

## Decision Summary

Keputusan desain untuk fase ini:

- **Vercel** untuk frontend,
- **Supabase** untuk data utama,
- **Google Drive** tetap opsional untuk poster/file,
- auth admin harus dibuat persisten,
- local JSON dan local upload storage tidak dipakai lagi untuk production.
