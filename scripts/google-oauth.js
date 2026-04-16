// DEPRECATED: This file is no longer used. Storage has been migrated to Supabase + Cloudflare R2.
import 'dotenv/config'
import { google } from 'googleapis'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

export function getOauthConfig() {
  return {
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri:
      process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3001/oauth2callback',
  }
}

function assertOauthConfig(config) {
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error(
      'Missing required OAuth environment variables. Expected GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI (or use default).',
    )
  }
}

export function createOauthClient() {
  const config = getOauthConfig()
  assertOauthConfig(config)

  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri)
}

export function createAuthUrl() {
  const oauth2Client = createOauthClient()

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE],
  })
}

export async function exchangeCodeForTokens(code) {
  if (!code) {
    throw new Error('Missing OAuth code. Pass it with --code="...".')
  }

  const oauth2Client = createOauthClient()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

function readArg(name) {
  const prefix = `${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || ''
}

async function main() {
  const command = process.argv[2]

  if (command === 'auth-url') {
    console.log(createAuthUrl())
    return
  }

  if (command === 'exchange-code') {
    const code = readArg('--code')
    const tokens = await exchangeCodeForTokens(code)
    console.log(JSON.stringify(tokens, null, 2))
    return
  }

  console.log('Usage:')
  console.log('  node scripts/google-oauth.js auth-url')
  console.log('  node scripts/google-oauth.js exchange-code --code="YOUR_AUTH_CODE"')
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(process.argv[1])

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
