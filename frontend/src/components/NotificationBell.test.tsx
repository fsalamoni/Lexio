// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const notificationMocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  getMock: vi.fn(),
  patchMock: vi.fn(),
  buildPathMock: vi.fn((id: string, options?: { preserveSearch?: string }) => `/documents/${id}${options?.preserveSearch ?? ''}`),
  locationSearch: '?tab=review',
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => notificationMocks.navigateMock,
    useLocation: () => ({ search: notificationMocks.locationSearch }),
  }
})

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => notificationMocks.getMock(...args),
    patch: (...args: unknown[]) => notificationMocks.patchMock(...args),
  },
}))

vi.mock('../lib/firebase', () => ({ IS_FIREBASE: false }))

vi.mock('../lib/workspace-routes', () => ({
  buildWorkspaceDocumentDetailPath: (id: string, options?: { preserveSearch?: string }) => notificationMocks.buildPathMock(id, options),
}))

import NotificationBell from './NotificationBell'

describe('NotificationBell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    notificationMocks.locationSearch = '?tab=review'
    notificationMocks.getMock.mockResolvedValue({ data: { items: [], unread_count: 0 } })
    notificationMocks.patchMock.mockResolvedValue({})
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('loads notifications, polls for updates and opens the dropdown', async () => {
    vi.useFakeTimers()

    render(<NotificationBell />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(notificationMocks.getMock).toHaveBeenCalledTimes(1)
    expect(notificationMocks.getMock).toHaveBeenCalledWith('/notifications?limit=20')

    await act(async () => {
      vi.advanceTimersByTime(30_000)
      await Promise.resolve()
    })

    expect(notificationMocks.getMock).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: /notificações/i }))

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText(/nenhuma notificação/i)).toBeTruthy()
    expect(notificationMocks.getMock).toHaveBeenCalledTimes(3)
  })

  it('marks an unread notification as read and navigates preserving the current search params', async () => {
    notificationMocks.getMock.mockResolvedValue({
      data: {
        unread_count: 1,
        items: [
          {
            id: 'notif-1',
            type: 'document_completed',
            title: 'Documento pronto',
            message: 'Seu documento foi gerado.',
            document_id: 'doc-1',
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
      },
    })

    render(<NotificationBell />)

    await waitFor(() => expect(notificationMocks.getMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /notificações/i }))

    expect(await screen.findByText('Documento pronto')).toBeTruthy()

    fireEvent.click(screen.getByText('Documento pronto'))

    await waitFor(() => expect(notificationMocks.patchMock).toHaveBeenCalledWith('/notifications/notif-1/read'))
    expect(notificationMocks.buildPathMock).toHaveBeenCalledWith('doc-1', { preserveSearch: '?tab=review' })
    expect(notificationMocks.navigateMock).toHaveBeenCalledWith('/documents/doc-1?tab=review')
  })

  it('marks all notifications as read from the dropdown header', async () => {
    notificationMocks.getMock.mockResolvedValue({
      data: {
        unread_count: 2,
        items: [
          {
            id: 'notif-1',
            type: 'document_completed',
            title: 'Documento pronto',
            message: 'Seu documento foi gerado.',
            document_id: 'doc-1',
            is_read: false,
            created_at: new Date().toISOString(),
          },
          {
            id: 'notif-2',
            type: 'document_approved',
            title: 'Documento aprovado',
            message: 'A revisão foi concluída.',
            document_id: null,
            is_read: false,
            created_at: new Date().toISOString(),
          },
        ],
      },
    })

    render(<NotificationBell />)

    await waitFor(() => expect(notificationMocks.getMock).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /notificações/i }))

    const markAllButton = await screen.findByRole('button', { name: /marcar tudo/i })
    fireEvent.click(markAllButton)

    await waitFor(() => expect(notificationMocks.patchMock).toHaveBeenCalledWith('/notifications/read-all'))
    await waitFor(() => expect(screen.queryByRole('button', { name: /marcar tudo/i })).toBeNull())
  })
})