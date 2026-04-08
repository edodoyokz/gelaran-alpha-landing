# Vercel + Supabase Hybrid Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Menyiapkan aplikasi event registration ini agar bisa dideploy ke Vercel dengan Supabase sebagai data store utama dan Google Drive opsional untuk poster.

**Architecture:** Frontend Vite/React tetap dipertahankan, layer persistence dipindahkan dari file lokal ke Supabase, dan credential sensitif dipindahkan ke environment variables. API contract existing dipertahankan sebisa mungkin agar perubahan UI tetap minimal.

**Tech Stack:** Vite, React, Express, Supabase, Google Drive API, Vercel

---

### Task 1: Amankan credential Google Drive

**Files:**
- Modify: `.gitignore`
- Delete/stop tracking: `skp-yk-8b3252125cd6.json`
- Modify: `.env.example`
- Test: manual verification via git status

**Step 1: Tambahkan pola ignore untuk credential sensitif**

Tambahkan pola yang memblokir file credential JSON service account agar tidak ikut commit lagi.

**Step 2: Hapus file credential dari workspace dan stop tracking di git**

Pastikan file `skp-yk-8b3252125cd6.json` tidak lagi berada di repo.

**Step 3: Dokumentasikan env yang menjadi pengganti file JSON**

Pastikan `.env.example` cukup jelas untuk:

- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

**Step 4: Verifikasi hasil**

Run: `git status`
Expected: file credential tidak lagi dilacak untuk production usage.

### Task 2: Tambahkan dependency dan konfigurasi Supabase

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `server/lib/supabase.js` atau path util yang setara
- Test: `npm install`, `npm run build`

**Step 1: Tambahkan dependency resmi Supabase**

Tambahkan package yang dibutuhkan untuk client server-side dan, bila perlu, client frontend.

**Step 2: Tambahkan env Supabase ke `.env.example`**

Minimal:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Step 3: Buat helper koneksi Supabase**

Buat util yang memusatkan pembacaan env dan pembuatan client agar tidak tersebar ke banyak file.

**Step 4: Verifikasi hasil**

Run: `npm run build`
Expected: build tetap lolos tanpa env runtime production yang bocor ke client secara salah.

### Task 3: Rancang schema database awal Supabase

**Files:**
- Create: `docs/plans/` note tambahan atau `supabase/` SQL file jika dipakai
- Create: file migration SQL yang relevan
- Test: review schema manually

**Step 1: Definisikan tabel `event_settings`**

Masukkan kolom yang memetakan state event saat ini.

**Step 2: Definisikan tabel `event_fields`**

Masukkan kolom untuk schema field dinamis dan urutannya.

**Step 3: Definisikan tabel `submissions`**

Simpan jawaban peserta dalam kolom JSON agar migrasi awal tetap sederhana.

**Step 4: Verifikasi desain schema**

Expected: schema cukup untuk menggantikan bentuk data dari `server/store.js` tanpa refactor fitur besar.

### Task 4: Ganti storage layer dari file lokal ke Supabase

**Files:**
- Modify: `server/store.js`
- Modify: `server/defaultSchema.js` bila diperlukan
- Modify: file server helper terkait
- Test: endpoint smoke test

**Step 1: Pisahkan adapter storage**

Refactor ringan agar store dapat membaca/menulis ke Supabase untuk data utama.

**Step 2: Pertahankan fungsi publik yang sudah dipakai UI**

Fungsi berikut harus tetap ada agar perubahan frontend kecil:

- `getSchema`
- `saveSchema`
- `getSubmissions`
- `addSubmission`
- `deleteSubmission`
- `resetDb`

**Step 3: Gunakan Supabase sebagai sumber data utama**

Hapus ketergantungan production pada `data/db.json`.

**Step 4: Verifikasi hasil**

Run: endpoint tests / manual API smoke tests
Expected: operasi CRUD utama tetap berjalan dengan backend storage baru.

### Task 5: Benahi auth admin agar tidak in-memory

**Files:**
- Modify: `server/index.js`
- Create/Modify: auth helper file(s)
- Test: login/logout/session smoke test

**Step 1: Ganti session store sementara yang in-memory**

Hapus ketergantungan pada `activeSessions = new Set()`.

**Step 2: Terapkan auth/session yang persisten**

Pilih implementasi paling kecil yang stabil untuk deployment target.

**Step 3: Pertahankan kontrak endpoint auth existing**

Endpoint berikut tetap tersedia:

- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`

**Step 4: Verifikasi hasil**

Expected: login admin tidak lagi bergantung pada satu proses memory lokal.

### Task 6: Pertahankan atau rapikan upload poster berbasis Google Drive

**Files:**
- Modify: `server/driveStorage.js`
- Modify: `server/index.js`
- Test: upload poster flow

**Step 1: Pastikan Google Drive hanya dipakai untuk file**

Jangan lagi menggunakannya sebagai primary database.

**Step 2: Pastikan semua credential dibaca dari env**

Tidak boleh ada lagi pembacaan file JSON credential dari repo.

**Step 3: Simpan URL poster ke data utama**

Setelah upload berhasil, URL poster harus tersimpan pada schema/settings di Supabase.

**Step 4: Verifikasi hasil**

Expected: admin bisa upload poster dan poster tampil di landing page.

### Task 7: Siapkan konfigurasi deploy Vercel

**Files:**
- Create/Modify: `vercel.json` bila diperlukan
- Modify: `package.json`
- Modify: frontend env usage di `src/App.jsx` atau helper API
- Test: `npm run build`

**Step 1: Tentukan base URL API untuk production**

Frontend harus bisa membedakan local dev dan deployment target.

**Step 2: Tambahkan env client dengan prefix `VITE_`**

Gunakan pola yang aman untuk Vite.

**Step 3: Tambahkan konfigurasi routing bila diperlukan**

Jika Vercel butuh rewrite untuk SPA, buat `vercel.json` yang sesuai.

**Step 4: Verifikasi hasil**

Run: `npm run build`
Expected: build frontend siap dideploy ke Vercel.

### Task 8: Dokumentasikan langkah deploy dan env

**Files:**
- Modify: `README.md`
- Test: manual review

**Step 1: Perbarui bagian environment variables**

Dokumentasikan env untuk local, Vercel, Supabase, dan Google Drive.

**Step 2: Perbarui bagian deploy**

Jelaskan arsitektur hybrid yang baru dan requirement production.

**Step 3: Tambahkan peringatan credential**

Tegaskan bahwa service account JSON tidak boleh disimpan di repo.

**Step 4: Verifikasi hasil**

Expected: engineer lain bisa melakukan deploy hanya dengan membaca README.

### Task 9: Validasi akhir

**Files:**
- Modify: any touched files as needed
- Test: build, lint, smoke tests

**Step 1: Jalankan lint**

Run: `npm run lint`
Expected: no new lint errors from the deployment changes.

**Step 2: Jalankan build**

Run: `npm run build`
Expected: build succeeds.

**Step 3: Jalankan smoke test flow utama**

Minimal verifikasi:

- load schema,
- submit form,
- login admin,
- update schema,
- list submissions,
- delete submission,
- upload poster,
- export CSV.

**Step 4: Review env handling**

Expected: tidak ada secret yang bocor ke client bundle dan tidak ada credential file tersisa di repo.

Plan complete and saved to `docs/plans/2026-04-08-vercel-supabase-deployment.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
