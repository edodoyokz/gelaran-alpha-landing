import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

let s3Client = null

function normalizePublicUrl(publicUrl) {
  const rawValue = String(publicUrl || '').trim()
  if (!rawValue) return ''

  const normalizedProtocolUrl = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`
  const match = normalizedProtocolUrl.match(/^https?:\/\/[^/\s]+/i)
  if (!match) return ''

  return match[0].replace(/\/+$/, '')
}

function isValidPublicUrl(publicUrl) {
  if (!publicUrl) return false

  try {
    const parsed = new URL(publicUrl)
    return /^https?:$/.test(parsed.protocol) && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucketName = process.env.R2_BUCKET_NAME
  const publicUrl = normalizePublicUrl(process.env.R2_PUBLIC_URL)

  return {
    enabled: Boolean(accessKeyId && secretAccessKey && bucketName && isValidPublicUrl(publicUrl)),
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl,
  }
}

function getS3Client() {
  if (s3Client) return s3Client

  const config = getR2Config()
  if (!config.enabled) return null

  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  })

  return s3Client
}

export function isR2StorageEnabled() {
  return getR2Config().enabled
}

export async function uploadR2File({ fileName, mimeType, buffer }) {
  try {
    const client = getS3Client()
    const config = getR2Config()
    if (!client || !config.enabled) {
      console.error('R2 upload skipped: invalid or incomplete R2 configuration')
      return null
    }

    const key = `posters/${Date.now()}-${fileName}`

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    )

    return `${config.publicUrl}/${key}`
  } catch (error) {
    console.error('R2 upload failed:', error)
    return null
  }
}
