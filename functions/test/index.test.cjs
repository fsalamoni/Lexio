const test = require('node:test')
const assert = require('node:assert/strict')

const { handleDatajudProxyRequest } = require('../lib/index.js')

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    jsonPayload: undefined,
    sendPayload: undefined,
    set(key, value) {
      this.headers[key] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.jsonPayload = payload
      return this
    },
    send(payload) {
      this.sendPayload = payload
      return this
    },
  }
}

test('fails when secret is missing', async () => {
  const response = createMockResponse()

  await handleDatajudProxyRequest(
    {
      method: 'POST',
      body: { tribunal: 'stf', body: { query: { match_all: {} } } },
    },
    response,
    {
      getApiKey: () => '',
      logError: () => undefined,
    },
  )

  assert.equal(response.statusCode, 500)
  assert.deepEqual(response.jsonPayload, { error: 'DataJud proxy secret is not configured.' })
})

test('times out DataJud proxy requests with an explicit 504 response', async () => {
  const response = createMockResponse()
  const abortError = new Error('request aborted')
  abortError.name = 'AbortError'
  let timeoutCleared = false

  await handleDatajudProxyRequest(
    {
      method: 'POST',
      body: { tribunal: 'stf', body: { query: { match_all: {} } } },
    },
    response,
    {
      getApiKey: () => 'secret',
      fetchImpl: async () => { throw abortError },
      logError: () => undefined,
      setTimeoutImpl: () => ({ id: 'timeout' }),
      clearTimeoutImpl: () => { timeoutCleared = true },
    },
  )

  assert.equal(response.statusCode, 504)
  assert.deepEqual(response.jsonPayload, { error: 'DataJud request timed out.' })
  assert.equal(timeoutCleared, true)
})

test('surfaces upstream proxy failures as a 502 response', async () => {
  const response = createMockResponse()
  const logged = []

  await handleDatajudProxyRequest(
    {
      method: 'POST',
      body: { tribunal: 'stf', body: { query: { match_all: {} } } },
    },
    response,
    {
      getApiKey: () => 'secret',
      fetchImpl: async () => { throw new Error('proxy failure') },
      logError: (...args) => logged.push(args.join(' ')),
      setTimeoutImpl: () => ({ id: 'timeout' }),
      clearTimeoutImpl: () => undefined,
    },
  )

  assert.equal(response.statusCode, 502)
  assert.deepEqual(response.jsonPayload, { error: 'DataJud proxy error: proxy failure' })
  assert.equal(logged.some((entry) => entry.includes('proxy failure')), true)
})