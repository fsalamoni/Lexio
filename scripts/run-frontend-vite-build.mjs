import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const frontendDir = path.join(repoRoot, 'frontend')
const viteBin = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js')

const env = {
  ...process.env,
  VITE_FIRESTORE_DATABASE_ID: process.env.VITE_FIRESTORE_DATABASE_ID?.trim() || 'lexio-prod',
}

const child = spawn(process.execPath, [viteBin, 'build', ...process.argv.slice(2)], {
  cwd: frontendDir,
  env,
  stdio: 'inherit',
})

child.on('exit', code => {
  process.exit(code ?? 1)
})
