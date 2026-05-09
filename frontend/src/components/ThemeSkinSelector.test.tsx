// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThemeSkinSelector from './ThemeSkinSelector'

const themeSkinMocks = vi.hoisted(() => ({
  applySkinToDocument: vi.fn(),
  clearSkinFromDocument: vi.fn(),
  saveUserSettings: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ userId: 'user-1' }),
}))

vi.mock('../lib/firebase', () => ({
  IS_FIREBASE: true,
}))

vi.mock('../lib/firestore-service', () => ({
  saveUserSettings: (...args: unknown[]) => themeSkinMocks.saveUserSettings(...args),
}))

vi.mock('../lib/platform-skins', () => ({
  DEFAULT_SKIN_ID: 'default',
  PLATFORM_SKINS: [
    { id: 'default', label: 'Padrão', description: 'Visual original.', swatches: ['#111111', '#222222'] },
    { id: 'aurora', label: 'Aurora', description: 'Tema alternativo.', swatches: ['#00aa88', '#55ddaa'] },
  ],
  findSkin: (id: string) => ({ id, label: id === 'aurora' ? 'Aurora' : 'Padrão', description: '', swatches: [] }),
  applySkinToDocument: (...args: unknown[]) => themeSkinMocks.applySkinToDocument(...args),
  clearSkinFromDocument: () => themeSkinMocks.clearSkinFromDocument(),
}))

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
})

describe('ThemeSkinSelector', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders skins, applies the selected skin, and persists the preference', async () => {
    render(<ThemeSkinSelector />)

    expect(screen.getByText('Aparencia da plataforma')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Aurora/ }))

    await waitFor(() => {
      expect(themeSkinMocks.applySkinToDocument).toHaveBeenCalled()
      expect(themeSkinMocks.saveUserSettings).toHaveBeenCalledWith('user-1', { platform_skin: 'aurora' })
    })
    expect(localStorage.getItem('lexio_platform_skin')).toBe('aurora')
  })
})