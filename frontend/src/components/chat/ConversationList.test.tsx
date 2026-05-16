// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const authState = vi.hoisted(() => ({
  current: {
    isReady: true,
    userId: 'user-1',
  },
}))

const chatMocks = vi.hoisted(() => ({
  createChatConversationMock: vi.fn(),
  deleteChatConversationMock: vi.fn(),
  listChatConversationsMock: vi.fn(),
  listChatTurnsMock: vi.fn(),
  renameChatConversationMock: vi.fn(),
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => authState.current,
}))

vi.mock('../../lib/firebase', () => ({ IS_FIREBASE: true }))

vi.mock('../../lib/firestore-service', () => ({
  createChatConversation: (...args: unknown[]) => chatMocks.createChatConversationMock(...args),
  deleteChatConversation: (...args: unknown[]) => chatMocks.deleteChatConversationMock(...args),
  listChatConversations: (...args: unknown[]) => chatMocks.listChatConversationsMock(...args),
  listChatTurns: (...args: unknown[]) => chatMocks.listChatTurnsMock(...args),
  renameChatConversation: (...args: unknown[]) => chatMocks.renameChatConversationMock(...args),
}))

import ConversationList from './ConversationList'

function renderList(props?: Partial<{ activeId: string | null; onSelect: (id: string) => void }>) {
  const onSelect = props?.onSelect ?? vi.fn()
  return {
    onSelect,
    ...render(
      <MemoryRouter>
        <ConversationList activeId={props?.activeId ?? 'conv-1'} onSelect={onSelect} />
      </MemoryRouter>,
    ),
  }
}

describe('ConversationList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.current = {
      isReady: true,
      userId: 'user-1',
    }
    chatMocks.listChatConversationsMock.mockResolvedValue({
      items: [
        {
          id: 'conv-1',
          title: 'Conversa inicial',
          effort: 'medio',
          created_at: '2026-05-08T10:00:00.000Z',
          updated_at: '2026-05-08T10:00:00.000Z',
        },
      ],
    })
    chatMocks.createChatConversationMock.mockResolvedValue('conv-2')
    chatMocks.deleteChatConversationMock.mockResolvedValue(undefined)
    chatMocks.listChatTurnsMock.mockResolvedValue({ items: [] })
    chatMocks.renameChatConversationMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('loads and renders existing conversations', async () => {
    renderList()

    expect(await screen.findByRole('button', { name: 'Conversa inicial' })).toBeTruthy()
    expect(chatMocks.listChatConversationsMock).toHaveBeenCalledWith('user-1')
  })

  it('shows a retry state after load failure and retries when requested', async () => {
    chatMocks.listChatConversationsMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        items: [
          {
            id: 'conv-1',
            title: 'Conversa recuperada',
            last_preview: 'Historico recuperado',
            effort: 'medio',
            created_at: '2026-05-08T10:00:00.000Z',
            updated_at: '2026-05-08T10:00:00.000Z',
          },
        ],
      })

    renderList()

    expect(await screen.findByText(/não foi possível carregar as conversas/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))

    expect(await screen.findByRole('button', { name: 'Conversa recuperada' })).toBeTruthy()
    await waitFor(() => {
      expect(chatMocks.listChatConversationsMock).toHaveBeenCalledTimes(2)
    })
  })

  it('hides empty legacy recovered placeholders without deleting them', async () => {
    chatMocks.listChatConversationsMock.mockResolvedValueOnce({
      items: [
        {
          id: 'empty-recovered',
          title: 'Conversa recuperada',
          last_preview: '',
          effort: 'medio',
          created_at: '2026-05-08T10:00:00.000Z',
          updated_at: '2026-05-08T10:00:00.000Z',
        },
        {
          id: 'conv-1',
          title: 'Conversa inicial',
          effort: 'medio',
          created_at: '2026-05-08T10:00:00.000Z',
          updated_at: '2026-05-08T10:00:00.000Z',
        },
      ],
    })

    renderList()

    expect(await screen.findByRole('button', { name: 'Conversa inicial' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conversa recuperada' })).toBeNull()
    expect(chatMocks.listChatTurnsMock).toHaveBeenCalledWith('user-1', 'empty-recovered')
    expect(chatMocks.deleteChatConversationMock).not.toHaveBeenCalled()
  })

  it('shows legacy recovered conversations with a title derived from preserved turns', async () => {
    chatMocks.listChatConversationsMock.mockResolvedValueOnce({
      items: [
        {
          id: 'recovered-with-turns',
          title: 'Conversa recuperada',
          last_preview: '',
          effort: 'medio',
          created_at: '2026-05-08T10:00:00.000Z',
          updated_at: '2026-05-08T10:00:00.000Z',
        },
      ],
    })
    chatMocks.listChatTurnsMock.mockResolvedValueOnce({
      items: [
        {
          id: 'turn-1',
          conversation_id: 'recovered-with-turns',
          user_input: 'Recupere o parecer administrativo',
          assistant_markdown: 'Parecer preservado.',
          trail: [],
          status: 'done',
          created_at: '2026-05-08T10:00:00.000Z',
        },
      ],
    })

    renderList({ activeId: null })

    expect(await screen.findByRole('button', { name: 'Recupere o parecer administrativo' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conversa recuperada' })).toBeNull()
  })

  it('creates a new conversation and selects it', async () => {
    const { onSelect } = renderList({ activeId: null })

    await screen.findByRole('button', { name: 'Conversa inicial' })
    fireEvent.click(screen.getByRole('button', { name: /nova conversa/i }))

    await waitFor(() => {
      expect(chatMocks.createChatConversationMock).toHaveBeenCalledWith('user-1', { title: 'Nova conversa' })
    })
    expect(onSelect).toHaveBeenCalledWith('conv-2')
    expect(await screen.findByTitle('Nova conversa')).toBeTruthy()
  })
})