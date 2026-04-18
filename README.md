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
- Storage fleksibel: file lokal atau Supabase + Cloudflare R2

## Tech Stack

- Frontend: Vite + React + Tailwind CSS v4
- Backend: Express
- Upload file: Multer
- Storage: JSON file lokal atau Supabase + Cloudflare R2

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
- `SUPABASE_URL`: URL Supabase project
- `SUPABASE_SERVICE_ROLE_KEY`: service role key Supabase
- `R2_ACCOUNT_ID`: Cloudflare Account ID (untuk upload poster)
- `R2_ACCESS_KEY_ID`: R2 access key ID (untuk upload poster)
- `R2_SECRET_ACCESS_KEY`: R2 secret access key (untuk upload poster)
- `R2_BUCKET_NAME`: nama R2 bucket (untuk upload poster)
- `R2_PUBLIC_URL`: public URL R2 bucket (untuk upload poster)

## Mode Storage

### 1. File lokal

Jika env Supabase belum diisi, app otomatis memakai file lokal di `data/db.json` dan upload poster ke `public/uploads`.

### 2. Supabase + Cloudflare R2

App otomatis memakai Supabase + Cloudflare R2 jika env berikut diisi:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `R2_ACCOUNT_ID` (opsional, untuk upload poster)
- `R2_ACCESS_KEY_ID` (opsional, untuk upload poster)
- `R2_SECRET_ACCESS_KEY` (opsional, untuk upload poster)
- `R2_BUCKET_NAME` (opsional, untuk upload poster)
- `R2_PUBLIC_URL` (opsional, untuk upload poster)

Yang disimpan ke Supabase:

- database JSON pendaftaran (tabel `event_schema` dan `submissions`)

Yang diupload ke Cloudflare R2:

- file poster event

## Setup Supabase

1. Buat project baru di [Supabase](https://supabase.com)
2. Pergi ke Settings > API untuk mendapatkan:
    - `SUPABASE_URL`
    - `SUPABASE_SERVICE_ROLE_KEY`
3. Buat tabel database dengan SQL berikut:

```sql
-- Tabel untuk schema event
CREATE TABLE event_schema (
  id INTEGER PRIMARY KEY DEFAULT 1,
  event_name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  date TEXT NOT NULL,
  poster TEXT NOT NULL,
  fields JSONB NOT NULL,
  highlights JSONB DEFAULT '[]'::jsonb,
  features JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabel untuk submissions
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submitted_at TEXT NOT NULL,
  submitted_at_iso TEXT NOT NULL,
  answers JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row-Level Security (RLS) - disable untuk service role
ALTER TABLE event_schema DISABLE ROW LEVEL SECURITY;
ALTER TABLE submissions DISABLE ROW LEVEL SECURITY;

## Migration untuk Database yang Sudah Ada

Jika database Supabase sudah dibuat dengan schema lama, jalankan SQL berikut untuk menambah kolom yang diperlukan:

```sql
-- Tambah kolom highlights dan features untuk landing page
ALTER TABLE event_schema
ADD COLUMN highlights JSONB DEFAULT '[]'::jsonb,
ADD COLUMN features JSONB DEFAULT '[]'::jsonb;
```
```

## Setup Cloudflare R2 (Opsional)

1. Buat R2 bucket di [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Pergi ke R2 > [bucket Anda] > Settings > Tokens untuk mendapatkan:
    - `R2_ACCESS_KEY_ID`
    - `R2_SECRET_ACCESS_KEY`
3. Set `R2_ACCOUNT_ID` dengan Cloudflare Account ID Anda
4. Set `R2_BUCKET_NAME` dengan nama bucket
5. Set `R2_PUBLIC_URL` dengan public URL bucket (misalnya `https://[bucket].r2.cloudflarestorage.com`)

## Catatan Deploy

- Untuk production, ganti semua kredensial default
- Set `COOKIE_SECURE=true` bila menggunakan HTTPS
- Session admin masih in-memory; semua admin akan logout saat server restart
- Untuk production penuh, langkah berikutnya adalah session store terpisah dan database nyata
- Untuk storage Supabase + R2, simpan semua credential hanya di server-side environment variables
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
4. Simpan secret backend (`SUPABASE_*`, `R2_*`, `SESSION_SECRET`, dll.) hanya di environment backend, bukan di frontend Vercel

## Deploy Full App ke Vercel

Project ini sekarang mendukung backend Express dalam shape yang kompatibel untuk Vercel melalui entrypoint `api/index.js`.

Catatan penting:

- admin auth memakai signed stateless cookie, bukan session in-memory,
- storage production di Vercel mengandalkan Supabase + Cloudflare R2,
- fallback local-file/local-upload tidak boleh dijadikan mode production di Vercel.

Environment variables yang perlu tersedia untuk runtime backend Vercel:

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ubah-ke-password-aman
SESSION_SECRET=ubah-ke-random-string-panjang
COOKIE_SECURE=true
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_URL=...
RESEND_API_KEY=re_your_api_key_here
```

## Migrating Existing Deployments

If you're upgrading from an older version, you need to add missing columns to your Supabase database:

```sql
-- Add email_config, highlights, and features columns
ALTER TABLE event_schema
ADD COLUMN IF NOT EXISTS email_config JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb;
```

After running the migration:
1. Reconfigure email settings via admin UI (previous settings were not persisted)
2. Test email functionality using the "Test Email" feature
3. Verify configuration persists after server restart

For detailed email setup instructions, see [EMAIL_SETUP.md](./EMAIL_SETUP.md).

Jika frontend dan backend sama-sama ada di Vercel project ini, `VITE_API_BASE_URL` dapat dibiarkan kosong agar frontend memakai same-origin `/api/*`.
