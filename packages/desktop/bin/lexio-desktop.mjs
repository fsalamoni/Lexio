#!/usr/bin/env node
/**
 * Lexio Desktop Sidecar — CLI entrypoint.
 *
 * Usage:
 *   npx @lexio/desktop --root "/caminho/para/pasta" --permissions read,write,execute
 *
 * Starts a localhost-only WebSocket server (127.0.0.1:9420) that the Lexio chat
 * orchestrator connects to so it can read/write files and run commands INSIDE
 * the chosen workspace folder — never outside it. On first run it prints a
 * pairing token to paste into Lexio → Configurações → Pasta local (PC).
 */
import fs from 'node:fs'
import { resolveConfig, getConfigPath } from '../src/config.mjs'
import { startSidecarServer, SIDECAR_PORT, SIDECAR_HOST } from '../src/server.mjs'

const pkgVersion = readVersion()
const argv = parseArgs(process.argv.slice(2))

if (argv.help) {
  printHelp()
  process.exit(0)
}

const config = resolveConfig(argv)

// Ensure the workspace root exists so the agent has somewhere to work.
try {
  fs.mkdirSync(config.root, { recursive: true })
} catch (err) {
  console.error(`Não foi possível criar/abrir a pasta de trabalho "${config.root}": ${err.message}`)
  process.exit(1)
}

const log = (msg) => console.log(`[lexio-desktop] ${msg}`)

const server = startSidecarServer({
  config: { ...config, version: pkgVersion },
  token: config.token,
  log,
})

printBanner(config)

const shutdown = async () => {
  log('Encerrando…')
  await server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// ── helpers ──────────────────────────────────────────────────────────────────

function parseArgs(args) {
  const out = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--root') out.root = args[++i]
    else if (arg === '--permissions') out.permissions = args[++i]
    else if (arg.startsWith('--root=')) out.root = arg.slice('--root='.length)
    else if (arg.startsWith('--permissions=')) out.permissions = arg.slice('--permissions='.length)
  }
  return out
}

function readVersion() {
  try {
    const url = new URL('../package.json', import.meta.url)
    return JSON.parse(fs.readFileSync(url, 'utf8')).version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}

function printBanner(config) {
  const line = '─'.repeat(64)
  console.log(`\n${line}`)
  console.log('  Lexio Desktop Sidecar — ativo')
  console.log(line)
  console.log(`  Pasta de trabalho : ${config.root}`)
  console.log(`  Permissões        : ${config.permissions.join(', ')}`)
  console.log(`  Endpoint          : ws://${SIDECAR_HOST}:${SIDECAR_PORT}`)
  console.log(`  Config            : ${getConfigPath()}`)
  console.log(line)
  console.log('  COLE este token de pareamento no Lexio →')
  console.log('  Configurações → Pasta local (PC):\n')
  console.log(`      ${config.token}\n`)
  console.log('  O agente só pode ler/escrever/executar DENTRO da pasta acima.')
  console.log(`${line}\n`)
}

function printHelp() {
  console.log(`Lexio Desktop Sidecar v${pkgVersion}

Permite que o orquestrador do chat Lexio atue no seu PC dentro de UMA pasta de
trabalho que você escolhe (sandbox). Nada fora dela é acessível.

Uso:
  lexio-desktop [--root <pasta>] [--permissions read,write,execute]

Opções:
  --root <pasta>          Pasta de trabalho (padrão: ~/Lexio)
  --permissions <lista>   read,write,execute,delete,rename (padrão: read,write)
  -h, --help              Mostra esta ajuda

Variáveis de ambiente:
  LEXIO_DESKTOP_ROOT          equivalente a --root
  LEXIO_DESKTOP_PERMISSIONS   equivalente a --permissions

Ao iniciar, um token de pareamento é exibido. Cole-o em
Lexio → Configurações → Pasta local (PC) para conectar.`)
}
