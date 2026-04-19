#!/usr/bin/env node

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const firebaseCliCommand = process.platform === 'win32' ? 'firebase.cmd' : 'firebase'

function log(message) {
  process.stdout.write(`[firebase-authorized-domains] ${message}\n`)
}

function parseArgs(argv) {
  const result = {
    project: undefined,
    domains: [],
  }

  for (let index = 2; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--project') result.project = argv[++index]
    else if (value === '--domain') result.domains.push(argv[++index])
  }

  return result
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

async function resolveProjectId(explicitProjectId) {
  if (explicitProjectId) return explicitProjectId

  const firebasercPath = path.join(repoRoot, '.firebaserc')
  const firebaserc = await readJson(firebasercPath)
  const projectId = firebaserc?.projects?.default
  if (!projectId) {
    throw new Error('Could not resolve Firebase project ID from .firebaserc')
  }
  return projectId
}

function resolveFirebaseToolsConfigPath() {
  const candidates = [
    process.env.FIREBASE_TOOLS_CONFIG,
    path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'configstore', 'firebase-tools.json') : undefined,
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'sh', process.platform === 'win32'
        ? ['/d', '/s', '/c', `if exist "${candidate}" exit 0 else exit 1`]
        : ['-lc', `[ -f '${candidate}' ]`], { stdio: 'ignore' })
      return candidate
    } catch {
      // Try next candidate.
    }
  }

  throw new Error('Could not locate firebase-tools.json with CLI authentication state')
}

async function loadFirebaseToolsConfig(configPath) {
  const json = await readJson(configPath)
  if (!json?.tokens?.access_token) {
    throw new Error('Firebase CLI auth state does not contain an access token')
  }
  return json
}

async function ensureFreshAccessToken(configPath) {
  let config = await loadFirebaseToolsConfig(configPath)
  const expiresAt = Number(config?.tokens?.expires_at || 0)
  const expiresSoon = !expiresAt || expiresAt <= Date.now() + 120_000

  if (expiresSoon) {
    log('Access token is close to expiration; asking Firebase CLI to refresh auth state')
    execFileSync(firebaseCliCommand, ['login:list'], { cwd: repoRoot, stdio: 'ignore' })
    config = await loadFirebaseToolsConfig(configPath)
  }

  return {
    email: config?.user?.email || 'unknown',
    accessToken: config.tokens.access_token,
  }
}

async function resolveAccessToken() {
  const envAccessToken = process.env.ACCESS_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN || process.env.GCP_ACCESS_TOKEN
  if (envAccessToken) {
    return {
      email: 'env-token',
      accessToken: envAccessToken,
    }
  }

  const configPath = resolveFirebaseToolsConfigPath()
  return ensureFreshAccessToken(configPath)
}

async function authorizedRequest(url, accessToken, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${body}`)
  }

  return response.json()
}

async function main() {
  const options = parseArgs(process.argv)
  const projectId = await resolveProjectId(options.project)
  const requiredDomains = Array.from(new Set([
    `${projectId}.web.app`,
    `${projectId}.firebaseapp.com`,
    ...options.domains.filter(Boolean),
  ].map((value) => value.trim().toLowerCase()).filter(Boolean)))

  if (requiredDomains.length === 0) {
    throw new Error('Provide at least one --domain or a valid project ID')
  }

  const { accessToken, email } = await resolveAccessToken()
  log(`Using Google access token for ${email}`)

  const endpoint = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`
  const config = await authorizedRequest(endpoint, accessToken)
  const currentDomains = Array.isArray(config.authorizedDomains) ? config.authorizedDomains : []
  const mergedDomains = Array.from(new Set([...currentDomains, ...requiredDomains])).sort()
  const sortedCurrentDomains = [...currentDomains].sort()
  const alreadySynced = mergedDomains.length === sortedCurrentDomains.length
    && mergedDomains.every((domain, index) => domain === sortedCurrentDomains[index])

  if (alreadySynced) {
    log(`Authorized domains already include: ${requiredDomains.join(', ')}`)
    return
  }

  await authorizedRequest(`${endpoint}?updateMask=authorizedDomains`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify({ authorizedDomains: mergedDomains }),
  })
  log(`Updated Firebase Auth authorized domains: ${mergedDomains.join(', ')}`)
}

main().catch((error) => {
  console.error(`[firebase-authorized-domains] ${error.message}`)
  process.exit(1)
})