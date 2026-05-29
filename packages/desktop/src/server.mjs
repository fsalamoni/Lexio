/**
 * WebSocket server for the Lexio desktop sidecar.
 *
 * Binds to 127.0.0.1:9420 only (never exposed to the network). Authenticates
 * each connection with the pairing token the user copies into Lexio settings —
 * passed either as `?token=` in the WS URL or an `x-lexio-token` header. The
 * frontend's protocol is JSON request/response over a single socket.
 */
import { WebSocketServer } from 'ws'
import { createHandler } from './handler.mjs'
import { isAuthorized, SIDECAR_HOST } from './auth.mjs'

export const SIDECAR_PORT = 9420
export { SIDECAR_HOST, isAuthorized } from './auth.mjs'

/**
 * @param {object} opts
 * @param {object} opts.config       handler config (root, permissions, version, ...)
 * @param {string} opts.token        pairing token required to connect
 * @param {(msg:string)=>void} [opts.log]
 * @returns {{ close: () => Promise<void>, port: number }}
 */
export function startSidecarServer({ config, token, log = () => {} }) {
  const handler = createHandler(config)
  const wss = new WebSocketServer({ host: SIDECAR_HOST, port: SIDECAR_PORT })

  wss.on('connection', (socket, req) => {
    if (!isAuthorized(req, token)) {
      log('Conexão rejeitada: token inválido ou ausente.')
      try { socket.close(4001, 'unauthorized') } catch { /* already closing */ }
      return
    }
    log('Cliente conectado.')

    socket.on('message', async (raw) => {
      let request
      try {
        request = JSON.parse(String(raw))
      } catch {
        socket.send(JSON.stringify({ id: null, ok: false, error: 'JSON inválido.' }))
        return
      }
      const response = await handler.handle(request)
      socket.send(JSON.stringify(response))
    })

    socket.on('close', () => log('Cliente desconectado.'))
    socket.on('error', (err) => log(`Erro de socket: ${err.message}`))
  })

  return {
    port: SIDECAR_PORT,
    close: () => new Promise(resolve => wss.close(() => resolve())),
  }
}
