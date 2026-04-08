import { Readable } from 'node:stream'
import { google } from 'googleapis'

const DRIVE_DB_FILE = 'event-registration-db.json'

function getDriveConfig() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID

  return {
    enabled: Boolean(clientEmail && privateKey && folderId),
    clientEmail,
    privateKey,
    folderId,
  }
}

function createDriveClient() {
  const config = getDriveConfig()
  if (!config.enabled) return null

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.clientEmail,
      private_key: config.privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  return google.drive({ version: 'v3', auth })
}

async function findFileByName(drive, folderId, fileName) {
  const response = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
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
    { fileId: existingFile.id, alt: 'media' },
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
  })

  const fileId = response.data.id
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return `https://drive.google.com/uc?id=${fileId}`
}
