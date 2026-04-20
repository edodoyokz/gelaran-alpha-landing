# Supabase Database Setup untuk Duplicate Prevention

## Overview

Sistem duplicate detection sudah diimplementasikan di level aplikasi, namun untuk proteksi maksimal terhadap race condition, perlu ditambahkan unique constraint di level database.

## Normalized Identity Fields

Setiap submission sekarang menyimpan 2 field tambahan:
- `identity_email`: Email yang sudah dinormalisasi (lowercase, trimmed)
- `identity_phone`: Nomor telepon yang sudah dinormalisasi (tanpa spasi, dash, parentheses)

Field ini digunakan untuk duplicate detection yang cepat dan konsisten.

## Setup Database Constraint (Recommended)

### 1. Tambahkan Kolom di Supabase

Jalankan SQL berikut di Supabase SQL Editor:

```sql
-- Tambahkan kolom identity_email dan identity_phone
ALTER TABLE submissions 
ADD COLUMN IF NOT EXISTS identity_email TEXT,
ADD COLUMN IF NOT EXISTS identity_phone TEXT;

-- Buat index untuk performa query
CREATE INDEX IF NOT EXISTS idx_submissions_identity_email 
ON submissions(identity_email) 
WHERE identity_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_identity_phone 
ON submissions(identity_phone) 
WHERE identity_phone IS NOT NULL;

-- Tambahkan unique constraint untuk mencegah duplicate
-- Note: Gunakan salah satu strategi di bawah sesuai kebutuhan
```

### 2. Pilih Strategi Unique Constraint

**Opsi A: Unique per field (Recommended)**
```sql
-- Email harus unique (jika ada)
CREATE UNIQUE INDEX idx_unique_email 
ON submissions(identity_email) 
WHERE identity_email IS NOT NULL AND identity_email != '';

-- Phone harus unique (jika ada)
CREATE UNIQUE INDEX idx_unique_phone 
ON submissions(identity_phone) 
WHERE identity_phone IS NOT NULL AND identity_phone != '';
```

**Opsi B: Unique kombinasi email ATAU phone**
```sql
-- Hanya satu dari email atau phone yang boleh sama
-- (lebih kompleks, gunakan jika benar-benar diperlukan)
CREATE UNIQUE INDEX idx_unique_identity 
ON submissions(COALESCE(identity_email, identity_phone));
```

### 3. Migrasi Data Existing (Jika Ada)

Jika sudah ada data di database, jalankan script untuk populate identity fields:

```sql
-- Update existing submissions dengan identity fields
-- (Script ini perlu disesuaikan dengan struktur answers JSONB)
UPDATE submissions
SET 
  identity_email = LOWER(TRIM(
    (SELECT value FROM jsonb_array_elements(answers) 
     WHERE (elem->>'id' = 'email' OR elem->>'label' ILIKE '%email%')
     LIMIT 1)
  )),
  identity_phone = REGEXP_REPLACE(
    (SELECT value FROM jsonb_array_elements(answers) 
     WHERE (elem->>'id' IN ('phone', 'whatsapp') OR elem->>'label' ILIKE '%whatsapp%')
     LIMIT 1),
    '[\s\-()]', '', 'g'
  )
WHERE identity_email IS NULL OR identity_phone IS NULL;
```

## Verifikasi Setup

Setelah setup, test dengan:

1. Coba submit form dengan email yang sama 2x → harus ditolak
2. Coba submit form dengan nomor WA yang sama 2x → harus ditolak
3. Check di Supabase logs untuk memastikan tidak ada error

## Troubleshooting

### Error: duplicate key value violates unique constraint

Ini berarti ada data existing yang sudah duplicate. Solusi:

1. Identifikasi duplicate:
```sql
SELECT identity_email, COUNT(*) 
FROM submissions 
WHERE identity_email IS NOT NULL 
GROUP BY identity_email 
HAVING COUNT(*) > 1;
```

2. Hapus atau merge duplicate secara manual
3. Baru tambahkan unique constraint

### Performance Issue

Jika query duplicate check lambat:
- Pastikan index sudah dibuat (lihat step 1)
- Monitor query performance di Supabase dashboard
- Pertimbangkan untuk archive old submissions

## Rollback

Jika perlu rollback:

```sql
-- Hapus unique constraint
DROP INDEX IF EXISTS idx_unique_email;
DROP INDEX IF EXISTS idx_unique_phone;

-- Hapus index (optional, tidak wajib)
DROP INDEX IF EXISTS idx_submissions_identity_email;
DROP INDEX IF EXISTS idx_submissions_identity_phone;

-- Hapus kolom (optional, tidak wajib)
ALTER TABLE submissions 
DROP COLUMN IF EXISTS identity_email,
DROP COLUMN IF EXISTS identity_phone;
```
