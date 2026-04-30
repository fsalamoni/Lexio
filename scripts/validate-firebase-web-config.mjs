#!/usr/bin/env node

import process from 'node:process'

function log(message) {
  process.stdout.write(`[validate-firebase-web-config] ${message}\n`)
}

function parseArgs(argv) {
  const result = {
    expectedProject: undefined,
  }
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--expected-project') {
      result.expectedProject = argv[index + 1]
      index += 1
    }
  }
  return result
}

function normalize(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return normalized || undefined
}

function parseProjectFromAuthDomain(authDomain) {
  const normalized = normalize(authDomain)
  if (!normalized) return undefined
  if (normalized.endsWith('.firebaseapp.com')) {
    return normalized.slice(0, -'.firebaseapp.com'.length)
  }
  if (normalized.endsWith('.web.app')) {
    return normalized.slice(0, -'.web.app'.length)
  }
  return undefined
}

function main() {
  const options = parseArgs(process.argv)

  const projectId = normalize(process.env.VITE_FIREBASE_PROJECT_ID)
  const authDomain = normalize(process.env.VITE_FIREBASE_AUTH_DOMAIN)
  const storageBucket = normalize(process.env.VITE_FIREBASE_STORAGE_BUCKET)
  const expectedProject = normalize(options.expectedProject)

  const issues = []
  if (!projectId) {
    issues.push('Missing VITE_FIREBASE_PROJECT_ID')
  }

  if (!authDomain) {
    issues.push('Missing VITE_FIREBASE_AUTH_DOMAIN')
  }

  if (!storageBucket) {
    issues.push('Missing VITE_FIREBASE_STORAGE_BUCKET')
  }

  if (projectId && expectedProject && projectId !== expectedProject) {
    issues.push(`VITE_FIREBASE_PROJECT_ID (${projectId}) differs from expected project (${expectedProject})`)
  }

  const authProject = parseProjectFromAuthDomain(authDomain)
  if (projectId && authProject && authProject !== projectId) {
    issues.push(`VITE_FIREBASE_AUTH_DOMAIN (${authDomain}) does not match VITE_FIREBASE_PROJECT_ID (${projectId})`)
  }

  if (projectId && storageBucket && !storageBucket.startsWith(`${projectId}.`)) {
    issues.push(`VITE_FIREBASE_STORAGE_BUCKET (${storageBucket}) does not match VITE_FIREBASE_PROJECT_ID (${projectId})`)
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(`[validate-firebase-web-config] ${issue}`)
    }
    process.exit(1)
  }

  log(`Validated Firebase web config for project ${projectId}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[validate-firebase-web-config] ${message}`)
  process.exit(1)
}
