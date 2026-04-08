# Event Registration Webapp

Webapp pendaftaran peserta event dengan landing page publik dan admin dashboard untuk menggantikan Google Form.

## Fitur

- Landing page peserta dengan referensi visual clean white theme
- Form pendaftaran dinamis berbasis schema
- Admin dashboard untuk:
  - mengubah informasi event
  - menambah, mengubah, dan menghapus field form
  - upload poster event
  - melihat data pendaftaran masuk
  - export data peserta ke CSV
  - search, filter, sorting, pagination, dan analytics ringan
- Login admin sederhana berbasis session cookie
- Storage fleksibel: file lokal atau Google Drive

## Tech Stack

- Frontend: Vite + React + Tailwind CSS v4
- Backend: Express
- Upload file: Multer
- Storage: JSON file lokal atau Google Drive API

## Menjalankan Project

1. Copy file environment:

```bash
cp .env.example .env
```

2. Ubah kredensial admin di `.env`

3. Install dependencies:

```bash
npm install
```

4. Jalankan API server:

```bash
npm run dev:api
```

5. Jalankan frontend:

```bash
npm run dev -- --host 0.0.0.0
```

## Environment Variables

- `PORT`: port API server
- `ADMIN_USERNAME`: username admin
- `ADMIN_PASSWORD`: password admin
- `SESSION_SECRET`: secret untuk generate session token
- `COOKIE_SECURE`: set `true` jika deploy dengan HTTPS penuh
- `VITE_API_BASE_URL`: base URL backend untuk frontend production. Kosongkan saat local dev dengan proxy Vite.
- `GOOGLE_DRIVE_FOLDER_ID`: folder tujuan di Google Drive personal
- `GOOGLE_OAUTH_CLIENT_ID`: client ID OAuth Google
- `GOOGLE_OAUTH_CLIENT_SECRET`: client secret OAuth Google
- `GOOGLE_OAUTH_REFRESH_TOKEN`: refresh token OAuth akun Google personal
- `GOOGLE_OAUTH_REDIRECT_URI`: redirect URI OAuth, default `http://localhost:3001/oauth2callback`

## Mode Storage

### 1. File lokal

Jika env Google Drive belum diisi, app otomatis memakai file lokal di `data/db.json` dan upload poster ke `public/uploads`.

### 2. Google Drive

App otomatis memakai Google Drive jika env berikut diisi:

- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

Yang disimpan ke Drive:

- database JSON pendaftaran (`event-registration-db.json`)
- file poster upload baru

## Setup Google Drive

1. Buat Google Cloud project
2. Aktifkan Google Drive API
3. Buat OAuth Client ID untuk aplikasi desktop atau web
4. Ambil:
   - `client_id`
   - `client_secret`
5. Jalankan flow OAuth untuk mendapatkan `refresh_token` akun Google personal yang akan dipakai aplikasi
6. Buat atau pilih folder di Google Drive personal
7. Isi `GOOGLE_DRIVE_FOLDER_ID` dengan ID folder target
8. Isi `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, dan `GOOGLE_OAUTH_REFRESH_TOKEN` di `.env`

### Mengambil refresh token dengan helper script

1. Isi dulu `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, dan `GOOGLE_OAUTH_REDIRECT_URI` di `.env`
2. Generate authorization URL:

```bash
node scripts/google-oauth.js auth-url
```

3. Buka URL yang keluar di browser, login dengan akun Google personal target, lalu approve akses Drive
4. Ambil `code` dari redirect/callback URL
5. Tukar code menjadi tokens:

```bash
node scripts/google-oauth.js exchange-code --code="PASTE_AUTH_CODE_HERE"
```

6. Ambil `refresh_token` dari output JSON, lalu simpan ke `.env` sebagai `GOOGLE_OAUTH_REFRESH_TOKEN`

Catatan penting:

- Integrasi write ke Google Drive personal **tidak** memakai service account
- Service account bisa gagal untuk write karena tidak punya storage quota pada Google Drive personal
- Refresh token OAuth harus dianggap sebagai secret dan tidak boleh di-commit

## Catatan Deploy

- Untuk production, ganti semua kredensial default
- Set `COOKIE_SECURE=true` bila menggunakan HTTPS
- Session admin masih in-memory; semua admin akan logout saat server restart
- Untuk production penuh, langkah berikutnya adalah session store terpisah dan database nyata
- Untuk storage Google Drive personal, simpan semua credential OAuth hanya di server-side environment variables
- Frontend Vite bisa dideploy ke Vercel, tetapi backend Express saat ini tetap perlu dijalankan sebagai service terpisah atau dimigrasikan ke platform/serverless yang sesuai
- Saat frontend dideploy terpisah, isi `VITE_API_BASE_URL` dengan origin backend production, misalnya `https://api-domain-anda.example.com`
- Jangan commit `.env` atau file credential JSON ke repository

## Deploy Frontend ke Vercel

1. Deploy frontend ini sebagai project Vite biasa
2. Set environment variable berikut di Vercel:

```bash
VITE_API_BASE_URL=https://backend-anda.example.com
```

3. Pastikan backend mengizinkan origin frontend production bila CORS diperketat nanti
4. Simpan secret backend (`GOOGLE_OAUTH_*`, `GOOGLE_DRIVE_FOLDER_ID`, `SESSION_SECRET`, dll.) hanya di environment backend, bukan di frontend Vercel

## Deploy Full App ke Vercel

Project ini sekarang mendukung backend Express dalam shape yang kompatibel untuk Vercel melalui entrypoint `api/index.js`.

Catatan penting:

- admin auth memakai signed stateless cookie, bukan session in-memory,
- storage production di Vercel mengandalkan Google Drive OAuth,
- fallback local-file/local-upload tidak boleh dijadikan mode production di Vercel.

Environment variables yang perlu tersedia untuk runtime backend Vercel:

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ubah-ke-password-aman
SESSION_SECRET=ubah-ke-random-string-panjang
COOKIE_SECURE=true
GOOGLE_DRIVE_FOLDER_ID=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REFRESH_TOKEN=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/oauth2callback
```

Jika frontend dan backend sama-sama ada di Vercel project ini, `VITE_API_BASE_URL` dapat dibiarkan kosong agar frontend memakai same-origin `/api/*`.
