import axios from 'axios'
import { describe, expect, it } from 'vitest'

import { installDemoInterceptor } from './demo-interceptor'

function createDemoApi() {
  const api = axios.create({ baseURL: '/api/v1' })
  installDemoInterceptor(api)
  return api
}

describe('api demo interceptor', () => {
  it('preempts smoke stats requests without hitting the network adapter', async () => {
    const api = createDemoApi()

    const stats = await api.get('/stats')
    const daily = await api.get('/stats/daily', { params: { days: 30 } })

    expect(stats.status).toBe(200)
    expect(stats.statusText).toBe('OK (demo)')
    expect(stats.data).toEqual(expect.objectContaining({ total_documents: 12 }))
    expect(Array.isArray(daily.data)).toBe(true)
    expect(daily.data.length).toBeGreaterThan(0)
  })

  it('keeps fixed smoke credentials enforced for login', async () => {
    const api = createDemoApi()

    const login = await api.post('/auth/login', {
      email: 'smoke@local.test',
      password: 'lexio-smoke-123',
    })

    expect(login.data).toEqual(expect.objectContaining({
      user_id: 'demo-user',
      role: 'admin',
    }))

    await expect(api.post('/auth/login', {
      email: 'other@example.com',
      password: 'wrong',
    })).rejects.toMatchObject({
      response: expect.objectContaining({ status: 401 }),
    })
  })
})
