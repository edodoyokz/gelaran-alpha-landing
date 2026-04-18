# Email Setup Guide

Fitur email otomatis telah ditambahkan ke aplikasi Gelaran. Fitur ini memungkinkan pengiriman email konfirmasi ke peserta dan notifikasi ke admin setiap ada pendaftaran baru.

## Fitur

- Email konfirmasi otomatis ke peserta setelah pendaftaran
- Notifikasi email ke admin untuk setiap pendaftaran baru
- Template email yang dapat dikustomisasi
- Test email untuk memverifikasi konfigurasi
- Support untuk variabel dinamis dalam template

## Setup

### 1. Dapatkan Resend API Key

1. Daftar di [Resend](https://resend.com)
2. Verifikasi domain Anda
3. Buat API key di dashboard Resend

### 2. Konfigurasi Email di Admin Panel

1. Login ke Admin Dashboard
2. Buka tab "Email Settings"
3. Isi konfigurasi berikut:
   - **Resend API Key**: API key dari Resend
   - **From Email**: Email pengirim (harus dari domain yang sudah diverifikasi)
   - **From Name**: Nama pengirim yang akan muncul di email

### 3. Konfigurasi Email Peserta

- **Enabled**: Aktifkan untuk mengirim email ke peserta
- **Subject**: Subject email konfirmasi
- **Body Template**: Template email dengan variabel dinamis

### 4. Konfigurasi Email Admin

- **Enabled**: Aktifkan untuk mengirim notifikasi ke admin
- **Admin Email**: Email admin yang akan menerima notifikasi
- **Subject**: Subject email notifikasi
- **Body Template**: Template email dengan variabel dinamis

### 5. Test Email

Gunakan fitur "Test Email" untuk memastikan konfigurasi bekerja dengan baik sebelum mengaktifkan email otomatis.

## Variabel Template

Gunakan variabel berikut dalam template email:

- `{{eventName}}` - Nama event
- `{{name}}` - Nama peserta (dari field pertama)
- `{{email}}` - Email peserta
- `{{location}}` - Lokasi event
- `{{date}}` - Tanggal event
- `{{fieldName}}` - Nilai dari field custom (ganti fieldName dengan nama field)

### Contoh Template Email Peserta

```
Halo {{name}},

Terima kasih telah mendaftar untuk {{eventName}}!

Detail pendaftaran Anda:
- Nama: {{name}}
- Email: {{email}}
- Lokasi: {{location}}
- Tanggal: {{date}}

Kami akan mengirimkan informasi lebih lanjut menjelang hari acara.

Salam,
Tim {{eventName}}
```

### Contoh Template Email Admin

```
Pendaftaran baru untuk {{eventName}}

Detail peserta:
- Nama: {{name}}
- Email: {{email}}

Cek dashboard admin untuk detail lengkap.
```

## Environment Variables

Untuk production, Anda dapat menggunakan environment variable:

```bash
RESEND_API_KEY=re_your_api_key_here
```

Jika environment variable diset, nilai ini akan digunakan sebagai default.

## Storage

Konfigurasi email disimpan dalam schema dan mendukung:
- Supabase Storage (production - recommended)
- Local JSON file (development)

**Important:** Email configuration is stored in the `email_config` column in Supabase's `event_schema` table. If you're migrating from an older version, you need to run the database migration to add this column.

### Verifying Email Config Persistence

After saving email configuration:
1. Restart the server
2. Check if the configuration is still loaded (not reverted to defaults)
3. Verify directly in Supabase table that `email_config` column has data

## Troubleshooting

### Email tidak terkirim

1. Pastikan Resend API key valid
2. Pastikan domain sudah diverifikasi di Resend
3. Pastikan "From Email" menggunakan domain yang sudah diverifikasi
4. Cek console log untuk error message
5. Gunakan fitur "Test Email" untuk debugging
6. Periksa apakah email config tersimpan dengan benar di database

### Email config hilang setelah restart

Jika email config hilang setelah server restart:
1. Pastikan Anda menggunakan Supabase storage (bukan local file untuk production)
2. Verifikasi kolom `email_config` ada di tabel `event_schema`
3. Jalankan migration SQL jika belum: `ALTER TABLE event_schema ADD COLUMN IF NOT EXISTS email_config JSONB DEFAULT NULL;`
4. Cek server logs untuk error saat menyimpan config

### Test email menunjukkan sukses tapi tidak terkirim

1. Cek server logs untuk pesan "skipped" atau error details
2. Pastikan Resend API key benar-benar valid (bukan placeholder)
3. Verifikasi domain sender sudah diverifikasi di Resend dashboard
4. Cek apakah ada error di Resend dashboard logs

### Email masuk spam

1. Pastikan domain sudah setup SPF, DKIM, dan DMARC records
2. Gunakan domain yang memiliki reputasi baik
3. Hindari kata-kata spam dalam subject dan body

## API Endpoints

- `GET /api/email-config` - Get email configuration
- `PUT /api/email-config` - Update email configuration
- `POST /api/email-config/test` - Send test email

## Security

- API key disimpan secara aman di server
- Email hanya dikirim setelah validasi submission berhasil
- Rate limiting diterapkan pada submission endpoint
- CSRF protection untuk semua state-changing requests
