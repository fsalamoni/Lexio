// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDesignStudioChatMessage,
  createDesignWorkspace,
  getActiveDesignWorkspaceId,
  listDesignWorkspaces,
  loadDesignWorkspace,
  saveDesignWorkspace,
  setActiveDesignWorkspaceId,
} from './workspace-store'

beforeEach(() => window.localStorage.clear())

describe('design-studio workspace-store', () => {
  it('creates and persists a recent workspace with repository context and messages', () => {
    const message = createDesignStudioChatMessage('user', 'Criar app com dashboard')
    const workspace = createDesignWorkspace({
      repository: {
        target: 'local',
        owner: '',
        repo: '',
        baseBranch: 'main',
        targetDir: 'design',
        localPath: '/repos/lexio',
      },
      brief: 'Criar app com dashboard',
      kind: 'code',
      messages: [message],
    })

    const saved = saveDesignWorkspace(workspace)
    expect(saved?.repository.target).toBe('local')
    expect(saved?.repository.localPath).toBe('/repos/lexio')

    const recent = listDesignWorkspaces()
    expect(recent).toHaveLength(1)
    expect(recent[0].kind).toBe('code')
    expect(recent[0].messages[0].content).toBe('Criar app com dashboard')
  })

  it('tracks and loads the active workspace', () => {
    const saved = saveDesignWorkspace(createDesignWorkspace({ brief: 'Landing page' }))
    expect(saved).not.toBeNull()

    setActiveDesignWorkspaceId(saved!.id)

    expect(getActiveDesignWorkspaceId()).toBe(saved!.id)
    expect(loadDesignWorkspace(saved!.id)?.brief).toBe('Landing page')
  })

  it('ignores corrupt storage payloads', () => {
    window.localStorage.setItem('lexio.design-studio.workspaces.v1', '{nope')
    expect(listDesignWorkspaces()).toEqual([])
  })
})
