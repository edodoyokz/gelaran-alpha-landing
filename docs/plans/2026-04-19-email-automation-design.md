# Email Automation Design

## Goal
Mengaktifkan email otomatis ke peserta setelah pendaftaran berhasil, dengan template branded untuk RB SILENT BEAT RUN 2026 dan tombol konfirmasi pembayaran ke WhatsApp.

## Recommended Approach
Pendekatan hybrid: struktur template email tetap reusable, tetapi copy utama, informasi pembayaran, dan CTA WhatsApp disesuaikan untuk event aktif. Ini menjaga fleksibilitas admin sambil memastikan email terasa spesifik dan rapi.

## Scope
- Rapikan label field form menjadi konsisten dan profesional.
- Tambahkan template email peserta yang sesuai event aktif.
- Tambahkan blok informasi pembayaran.
- Tambahkan tombol CTA ke WhatsApp dengan pesan otomatis.
- Gunakan konfigurasi Resend dari environment yang diberikan user.
- Pertahankan perilaku aman: jika email gagal, submission tetap sukses.

## Data Required
- RESEND_API_KEY
- FROM_EMAIL
- FROM_NAME
- REPLY_TO
- Nomor rekening pembayaran
- Nomor WhatsApp konfirmasi pembayaran

## UX Flow
1. Peserta submit form.
2. Backend menyimpan submission.
3. Backend membangun template email berdasarkan event + data peserta.
4. Email dikirim ke peserta.
5. Peserta menerima detail event, ringkasan datanya, informasi pembayaran, dan tombol konfirmasi pembayaran.

## Email Content
- Header event: RB SILENT BEAT RUN 2026
- Tagline: Run the rhythm. Feel the beat. Experience the silence.
- Detail event: tanggal + lokasi
- Ringkasan data peserta
- Informasi pembayaran:
  - BCA 0154742588
  - a.n. Eden Denta Pratama
- Tombol: Konfirmasi Pembayaran via WhatsApp
- Prefilled message ke WhatsApp penyelenggara

## Error Handling
- Jika RESEND tidak aktif/valid: submission tetap tersimpan, email dicatat sebagai skipped/error.
- Jika field email kosong/tidak valid: email peserta dilewati.
- Jika admin config belum lengkap: fallback ke env config.

## Testing
- Lint, test, build.
- Test helper/template rendering.
- Submit nyata ke endpoint lokal dan pastikan response sukses.
- Test email helper untuk memastikan payload WhatsApp dan HTML terbentuk benar.
