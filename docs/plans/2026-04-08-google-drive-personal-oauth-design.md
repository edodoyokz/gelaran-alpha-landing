# Google Drive Personal OAuth Design

## Goal

Menyesuaikan integrasi storage project ini agar tetap memakai Google Drive Personal sebagai target penyimpanan, tetapi dengan mekanisme autentikasi yang benar untuk operasi read dan write.

## Problem Statement

Integrasi saat ini memakai service account dan environment variables berikut:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_DRIVE_FOLDER_ID`

Hasil verifikasi runtime menunjukkan:

- read dari folder Google Drive personal bisa berhasil,
- write ke folder yang sama gagal dengan error `Service Accounts do not have storage quota`.

Ini terjadi karena service account tidak cocok untuk menulis ke Google Drive Personal dengan model ownership dan quota seperti akun user biasa.

## Recommended Solution

Gunakan **OAuth 2.0 user-based access** dengan refresh token dari akun Google personal yang memang menjadi pemilik atau memiliki akses write ke folder target.

Dengan pendekatan ini, semua operasi Google Drive berjalan atas nama akun personal tersebut, bukan atas nama service account.

## Architecture

### 1. Authentication Model

Backend Express membuat OAuth2 client Google menggunakan credential aplikasi OAuth:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`

Lalu backend menyetel refresh token tersebut pada OAuth client dan memakai client itu untuk membangun `google.drive({ version: 'v3', auth })`.

### 2. Storage Target

Target penyimpanan tetap folder Google Drive Personal yang ditentukan oleh:

- `GOOGLE_DRIVE_FOLDER_ID`

Folder ini dimiliki atau dapat ditulis oleh akun personal yang refresh token-nya dipakai backend.

### 3. Existing Data Flow Compatibility

Kontrak fungsi storage yang sudah ada sebaiknya dipertahankan agar perubahan tidak melebar:

- `readDriveJson(fallbackValue)`
- `writeDriveJson(data)`
- `uploadDriveFile({ fileName, mimeType, buffer })`
- `isDriveStorageEnabled()`

Dengan begitu, `server/store.js` dan `server/index.js` hanya perlu menyesuaikan detail integrasi auth, bukan keseluruhan fitur aplikasi.

## Environment Variables

### Remove / deprecate

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

### Add

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`

## OAuth Token Acquisition Strategy

Untuk fase ini, strategi paling sederhana adalah **out-of-band one-time token generation** di luar aplikasi utama.

Artinya:

1. engineer membuat OAuth app di Google Cloud,
2. engineer mendapatkan refresh token satu kali,
3. refresh token dimasukkan ke `.env`,
4. backend memakai refresh token itu untuk semua operasi selanjutnya.

Ini lebih kecil scope-nya daripada membangun flow “Connect Google Drive” di admin dashboard.

## Security Model

- Semua credential OAuth tetap server-side only.
- Tidak ada client-side env untuk credential Google Drive.
- File service account JSON tidak dipakai lagi untuk integrasi ini.
- Refresh token dianggap secret yang sensitif dan tidak boleh di-commit.

## Expected Behavior After Migration

Setelah migrasi selesai:

- `GET /api/schema` tetap membaca schema dari file JSON di Google Drive personal,
- `POST /api/submissions` menulis kembali file JSON ke Google Drive personal,
- `POST /api/upload-poster` membuat file baru di folder Drive personal,
- aplikasi tidak lagi gagal dengan error quota milik service account.

## Error Handling

Backend harus memberikan error yang cukup jelas untuk kasus berikut:

- refresh token invalid atau revoked,
- client ID / secret salah,
- folder ID tidak valid,
- akun pemilik token tidak punya akses ke folder,
- permission file upload gagal dibuat public.

Error internal dari Google API tetap boleh dipertahankan, tetapi idealnya dibungkus dengan pesan yang lebih informatif untuk operator.

## Testing Strategy

Validasi minimum setelah implementasi:

1. `GET /api/health` menunjukkan storage mode Drive aktif.
2. `GET /api/schema` berhasil membaca file dari Drive personal.
3. `POST /api/submissions` berhasil menulis data baru.
4. `GET /api/submissions` mengembalikan data yang baru ditulis.
5. `POST /api/upload-poster` berhasil membuat file baru.
6. Flow submit form dari browser tidak lagi menerima `403 Forbidden`.

## Out of Scope

Hal berikut tidak wajib pada fase ini:

- dashboard untuk melakukan OAuth connect interactively,
- multi-user token management,
- per-user Drive routing,
- migrasi storage ke provider lain.

## Decision Summary

Keputusan desain untuk constraint baru ini adalah:

- tetap memakai Google Drive Personal,
- menghentikan penggunaan service account untuk write path,
- mengganti auth ke OAuth 2.0 berbasis user personal,
- mempertahankan kontrak storage yang ada agar perubahan tetap minimal.
