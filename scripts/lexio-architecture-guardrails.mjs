#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const repoRoot = path.resolve(path.dirname(__filename), '..')
const srcRoot = path.join(repoRoot, 'frontend', 'src')
const libRoot = path.join(srcRoot, 'lib')
const coreRoot = path.join(libRoot, 'core')
const modulesRoot = path.join(libRoot, 'modules')
const componentsRoot = path.join(srcRoot, 'components')
const pagesRoot = path.join(srcRoot, 'pages')

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const ignoredDirectoryNames = new Set(['node_modules', 'dist', 'dist-redesign-v2', 'coverage'])

const openRouterUrlPattern = /https:\/\/openrouter\.ai\/api\//
const openRouterAllowedFiles = new Set([
  normalizePath(path.join(libRoot, 'llm-client.ts')),
  normalizePath(path.join(libRoot, 'image-generation-client.ts')),
  normalizePath(path.join(libRoot, 'tts-client.ts')),
  normalizePath(path.join(libRoot, 'model-catalog.ts')),
  normalizePath(path.join(libRoot, 'providers.ts')),
  normalizePath(path.join(libRoot, 'datajud-service.ts')),
])

function normalizePath(filePath) {
  return path.normalize(filePath).replace(/\\/g, '/')
}

function relativePath(filePath) {
  return normalizePath(path.relative(repoRoot, filePath))
}

function isInside(candidate, root) {
  const normalizedCandidate = path.normalize(candidate)
  const normalizedRoot = path.normalize(root)
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)
}

function listSourceFiles(directory) {
  if (!fs.existsSync(directory)) return []
  const entries = fs.readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') || ignoredDirectoryNames.has(entry.name)) continue
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(fullPath))
      continue
    }
    if (entry.isFile() && sourceExtensions.has(path.extname(entry.name))) files.push(fullPath)
  }

  return files
}

function extractImportSpecifiers(source) {
  const specifiers = []
  const staticPattern = /(?:^|[\n;])\s*(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g

  for (const pattern of [staticPattern, dynamicPattern]) {
    pattern.lastIndex = 0
    let match = pattern.exec(source)
    while (match) {
      specifiers.push(match[1])
      match = pattern.exec(source)
    }
  }

  return specifiers
}

function resolveRelativeImport(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return null
  return path.resolve(path.dirname(sourceFile), specifier)
}

function moduleNameFor(filePath) {
  if (!isInside(filePath, modulesRoot)) return null
  const relative = path.relative(modulesRoot, filePath).split(path.sep)
  return relative[0] || null
}

function isPublicModuleEntrypoint(targetPath, targetModuleName) {
  const moduleRoot = path.join(modulesRoot, targetModuleName)
  const normalizedTarget = path.normalize(targetPath)
  return normalizedTarget === moduleRoot || normalizedTarget === path.join(moduleRoot, 'index')
}

function makeViolation(file, message) {
  return `${relativePath(file)}: ${message}`
}

function checkImportBoundaries(file, source, violations) {
  const specifiers = extractImportSpecifiers(source)
  const sourceModuleName = moduleNameFor(file)

  for (const specifier of specifiers) {
    const target = resolveRelativeImport(file, specifier)
    if (!target) continue

    if (isInside(file, libRoot)) {
      if (isInside(target, componentsRoot)) {
        violations.push(makeViolation(file, `lib code must not import UI components (${specifier}). Move UI coupling to pages/components or expose a UI-neutral contract.`))
      }
      if (isInside(target, pagesRoot)) {
        violations.push(makeViolation(file, `lib code must not import pages (${specifier}). Move shared constants/types to lib/shared or a domain module.`))
      }
    }

    if (isInside(file, coreRoot) && isInside(target, modulesRoot)) {
      violations.push(makeViolation(file, `core must not import domain modules (${specifier}). Invert the dependency through a core contract.`))
    }

    if (sourceModuleName && isInside(target, modulesRoot)) {
      const targetModuleName = moduleNameFor(target)
      if (targetModuleName && targetModuleName !== sourceModuleName && !isPublicModuleEntrypoint(target, targetModuleName)) {
        violations.push(makeViolation(file, `modules may import another module only through its public index (${specifier}).`))
      }
    }
  }
}

function checkOpenRouterRouting(file, source, violations) {
  if (!openRouterUrlPattern.test(source)) return
  const normalizedFile = normalizePath(file)
  if (openRouterAllowedFiles.has(normalizedFile)) return
  violations.push(makeViolation(file, 'direct OpenRouter API URL detected outside approved provider adapters. Route LLM calls through llm-client or document an explicit adapter exception.'))
}

function main() {
  const files = listSourceFiles(srcRoot)
  const violations = []

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    checkImportBoundaries(file, source, violations)
    checkOpenRouterRouting(file, source, violations)
  }

  if (violations.length > 0) {
    console.error('[lexio-architecture-guardrails] Architecture violations found:')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exit(1)
  }

  console.log(`[lexio-architecture-guardrails] OK (${files.length} source files checked)`)
}

main()