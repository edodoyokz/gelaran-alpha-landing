import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

let s3Client = null

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucketName = process.env.R2_BUCKET_NAME
  const publicUrl = process.env.R2_PUBLIC_URL

  return {
    enabled: Boolean(accessKeyId && secretAccessKey && bucketName && publicUrl),
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: publicUrl?.replace(/\/+$/, ''), // strip trailing slashes
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
    if (!client || !config.enabled) return null

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
