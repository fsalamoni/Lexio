#!/usr/bin/env node

import process from 'node:process'

function log(message) {
  process.stdout.write(`[validate-firebase-service-account] ${message}\n`)
}

function parseArgs(argv) {
  return {
    allowEmpty: argv.includes('--allow-empty'),
  }
}

function tryParseJson(raw) {
  try {
    return { parsed: JSON.parse(raw), source: 'json' }
  } catch {
    return null
  }
}

function tryParseBase64Json(raw) {
  const compact = raw.replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return null

  try {
    const decoded = Buffer.from(compact, 'base64').toString('utf8')
    const parsed = JSON.parse(decoded)
    return { parsed, source: 'base64' }
  } catch {
    return null
  }
}

function parseServiceAccount(raw) {
  const direct = tryParseJson(raw)
  if (direct) return direct

  const trimmed = raw.trim()
  if (!trimmed) return null

  const unwrapped = trimmed.replace(/^['"]|['"]$/g, '')
  if (unwrapped !== trimmed) {
    const fromUnwrapped = tryParseJson(unwrapped)
    if (fromUnwrapped) return fromUnwrapped
  }

  return tryParseBase64Json(trimmed)
}

function validateRequiredFields(serviceAccount) {
  const requiredKeys = ['type', 'project_id', 'private_key', 'client_email', 'token_uri']
  const missing = requiredKeys.filter((key) => !serviceAccount[key])
  if (missing.length > 0) {
    throw new Error(`Missing required service account keys: ${missing.join(', ')}`)
  }

  if (serviceAccount.type !== 'service_account') {
    throw new Error(`Expected type=service_account, received type=${String(serviceAccount.type)}`)
  }

  if (typeof serviceAccount.project_id !== 'string' || !serviceAccount.project_id.trim()) {
    throw new Error('Invalid project_id in service account')
  }

  if (typeof serviceAccount.client_email !== 'string' || !serviceAccount.client_email.includes('@')) {
    throw new Error('Invalid client_email in service account')
  }

  if (typeof serviceAccount.private_key !== 'string' || !serviceAccount.private_key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('Invalid private_key in service account')
  }
}

function main() {
  const args = parseArgs(process.argv)
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''

  if (!raw.trim()) {
    if (args.allowEmpty) {
      log('No FIREBASE_SERVICE_ACCOUNT value provided. Skipping validation because --allow-empty was set.')
      return
    }
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON environment variable')
  }

  const parsedResult = parseServiceAccount(raw)
  if (!parsedResult) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT value is not valid JSON (or base64-encoded JSON)')
  }

  const { parsed: serviceAccount, source } = parsedResult
  validateRequiredFields(serviceAccount)

  if (!serviceAccount.private_key.includes('\n')) {
    log('Warning: private_key does not contain newline characters. Verify key formatting if auth fails.')
  }

  log(`Validated service account JSON (${source}) for project ${serviceAccount.project_id} as ${serviceAccount.client_email}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[validate-firebase-service-account] ${message}`)
  process.exit(1)
}
