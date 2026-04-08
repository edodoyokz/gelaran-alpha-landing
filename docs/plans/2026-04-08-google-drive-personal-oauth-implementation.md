# Google Drive Personal OAuth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mengganti integrasi Google Drive berbasis service account menjadi OAuth 2.0 berbasis akun personal agar aplikasi bisa read dan write ke Google Drive Personal.

**Architecture:** Backend Express akan membuat Google OAuth2 client dari client ID, client secret, dan refresh token yang disimpan di environment variables. Storage functions yang ada akan tetap dipertahankan, tetapi sumber auth-nya dipindahkan dari service account credentials ke OAuth refresh-token flow.

**Tech Stack:** Node.js, Express, googleapis, dotenv, Google Drive API OAuth 2.0

---

### Task 1: Perbarui kontrak environment variables

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Test: manual review

**Step 1: Hapus referensi service account dari env example**

Buang atau tandai deprecated env berikut:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

**Step 2: Tambahkan env OAuth baru**

Tambahkan:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`

**Step 3: Dokumentasikan makna masing-masing env**

Pastikan engineer lain mengerti env mana yang harus didapat dari Google Cloud Console dan mana yang harus berasal dari token generation flow.

**Step 4: Verifikasi**

Expected: `.env.example` dan README konsisten dengan desain OAuth personal Drive.

### Task 2: Tambahkan util pembuatan OAuth2 client

**Files:**
- Modify: `server/driveStorage.js`
- Optional Create: `server/googleAuth.js`
- Test: runtime smoke test

**Step 1: Buat helper pembacaan env OAuth**

Helper harus membaca:

- client ID,
- client secret,
- refresh token,
- folder ID.

**Step 2: Buat Google OAuth2 client**

Gunakan `google.auth.OAuth2` dan set refresh token ke client tersebut.

**Step 3: Bangun Drive client dari OAuth2 client**

Ganti pemakaian `GoogleAuth({ credentials: ...service account... })` dengan OAuth2 client.

**Step 4: Verifikasi**

Run: custom node check / API smoke test
Expected: Drive client bisa dibuat tanpa service account credentials.

### Task 3: Pertahankan fungsi storage existing dengan auth baru

**Files:**
- Modify: `server/driveStorage.js`
- Test: API endpoint verification

**Step 1: Pastikan `isDriveStorageEnabled()` memakai env OAuth baru**

Drive mode harus aktif hanya bila env OAuth dan folder ID lengkap.

**Step 2: Pertahankan `readDriveJson()`**

Pastikan fungsi baca tetap bekerja dengan auth baru.

**Step 3: Pertahankan `writeDriveJson()`**

Pastikan update/create file JSON tetap mengikuti folder target yang sama.

**Step 4: Pertahankan `uploadDriveFile()`**

Pastikan upload poster tetap membuat file baru dan mengembalikan URL yang sesuai.

**Step 5: Verifikasi**

Expected: semua fungsi storage tetap punya kontrak yang sama tetapi memakai auth baru.

### Task 4: Buat script/token acquisition note untuk refresh token

**Files:**
- Create: `docs/plans/` note tambahan atau `scripts/` helper bila diperlukan
- Modify: `README.md`
- Test: manual review

**Step 1: Dokumentasikan cara mendapatkan refresh token**

Jelaskan langkah minimal dari Google Cloud Console hingga refresh token tersedia.

**Step 2: Jika perlu, buat helper script kecil**

Script opsional boleh membantu menghasilkan authorization URL atau menukar auth code menjadi token.

**Step 3: Verifikasi**

Expected: operator bisa menyiapkan credential OAuth tanpa menebak-nebak.

### Task 5: Jalankan verifikasi API read/write

**Files:**
- Modify: touched files as needed
- Test: live API verification

**Step 1: Jalankan server lokal**

Run: `npm run dev:api`
Expected: server start normal.

**Step 2: Verifikasi read path**

Run: `curl http://127.0.0.1:3001/api/schema`
Expected: schema terbaca dari Google Drive personal.

**Step 3: Verifikasi write path**

Run: `curl -H "Content-Type: application/json" -d '...' http://127.0.0.1:3001/api/submissions`
Expected: submission berhasil tersimpan tanpa 403 quota error.

**Step 4: Verifikasi poster upload bila env siap**

Expected: upload berhasil membuat file baru di folder target.

### Task 6: Jalankan verifikasi browser end-to-end

**Files:**
- Modify: touched files as needed
- Test: browser smoke test

**Step 1: Jalankan frontend dan backend**

Run:

- `npm run dev:api`
- `npm run dev -- --host 127.0.0.1`

**Step 2: Buka halaman publik**

Expected: form termuat dari schema yang dibaca melalui backend.

**Step 3: Submit pendaftaran dummy**

Expected: UI tidak lagi menampilkan `Gagal mengirim pendaftaran.`

**Step 4: Verifikasi data hasil submit**

Expected: data baru muncul di backend / admin flow.

### Task 7: Validasi akhir

**Files:**
- Modify: touched files as needed
- Test: lint, build, smoke tests

**Step 1: Jalankan lint**

Run: `npm run lint`
Expected: no new lint issues.

**Step 2: Jalankan build**

Run: `npm run build`
Expected: build succeeds.

**Step 3: Review env safety**

Expected: tidak ada secret OAuth yang masuk ke frontend bundle.

Plan complete and saved to `docs/plans/2026-04-08-google-drive-personal-oauth-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

Which approach?
