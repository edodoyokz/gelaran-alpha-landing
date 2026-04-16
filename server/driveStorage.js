// DEPRECATED: This file is no longer used. Storage has been migrated to Supabase + Cloudflare R2.
import { Readable } from 'node:stream'
import { google } from 'googleapis'

const DRIVE_DB_FILE = 'event-registration-db.json'

function getDriveConfig() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3001/oauth2callback'
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  return {
    enabled: Boolean(clientId && clientSecret && refreshToken && folderId),
    clientId,
    clientSecret,
    refreshToken,
    redirectUri,
    folderId,
  }
}

function createDriveClient() {
  const config = getDriveConfig()
  if (!config.enabled) return null

  const auth = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  )

  auth.setCredentials({
    refresh_token: config.refreshToken,
  })

  return google.drive({ version: 'v3', auth })
}

async function findFileByName(drive, folderId, fileName) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  return response.data.files?.[0] || null
}

export function isDriveStorageEnabled() {
  return getDriveConfig().enabled
}

export async function readDriveJson(fallbackValue) {
  const drive = createDriveClient()
  const { folderId } = getDriveConfig()
  if (!drive || !folderId) return fallbackValue

  const existingFile = await findFileByName(drive, folderId, DRIVE_DB_FILE)
  if (!existingFile) return fallbackValue

  const response = await drive.files.get(
    { fileId: existingFile.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' },
  )

  return JSON.parse(response.data)
}

export async function writeDriveJson(data) {
  const drive = createDriveClient()
  const { folderId } = getDriveConfig()
  if (!drive || !folderId) return false

  const existingFile = await findFileByName(drive, folderId, DRIVE_DB_FILE)
  const media = {
    mimeType: 'application/json',
    body: Readable.from([JSON.stringify(data, null, 2)]),
  }

  if (existingFile) {
    await drive.files.update({
      fileId: existingFile.id,
      media,
      supportsAllDrives: true,
    })
    return true
  }

  await drive.files.create({
    requestBody: {
      name: DRIVE_DB_FILE,
      parents: [folderId],
      mimeType: 'application/json',
    },
    media,
    fields: 'id',
    supportsAllDrives: true,
  })
  return true
}

export async function uploadDriveFile({ fileName, mimeType, buffer }) {
  const drive = createDriveClient()
  const { folderId } = getDriveConfig()
  if (!drive || !folderId) return null

  const response = await drive.files.create({
    requestBody: {
      name: `${Date.now()}-${fileName}`,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink, webContentLink',
    supportsAllDrives: true,
  })

  const fileId = response.data.id
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  })

  // drive.google.com/uc?id= is deprecated and causes NS_BINDING_ABORTED in browsers.
  // Use the thumbnail API which reliably serves the image directly.
  // sz=w1200 sets a max width of 1200px — adjust as needed.
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`
}
