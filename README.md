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
- `GOOGLE_DRIVE_FOLDER_ID`: folder tujuan di Google Drive
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: email service account Google
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: private key service account

## Mode Storage

### 1. File lokal

Jika env Google Drive belum diisi, app otomatis memakai file lokal di `data/db.json` dan upload poster ke `public/uploads`.

### 2. Google Drive

App otomatis memakai Google Drive jika ketiga env ini diisi:

- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

Yang disimpan ke Drive:

- database JSON pendaftaran (`event-registration-db.json`)
- file poster upload baru

## Setup Google Drive

1. Buat Google Cloud project
2. Aktifkan Google Drive API
3. Buat service account
4. Download credential, lalu ambil:
   - `client_email`
   - `private_key`
5. Buat folder di Google Drive
6. Share folder tersebut ke email service account dengan akses editor
7. Isi `GOOGLE_DRIVE_FOLDER_ID` dengan ID folder target

Catatan untuk private key di `.env`:

- simpan newline sebagai `\n`
- contoh: `-----BEGIN PRIVATE KEY-----\nABC...\n-----END PRIVATE KEY-----\n`

## Catatan Deploy

- Untuk production, ganti semua kredensial default
- Set `COOKIE_SECURE=true` bila menggunakan HTTPS
- Session admin masih in-memory; semua admin akan logout saat server restart
- Untuk production penuh, langkah berikutnya adalah session store terpisah dan database nyata
