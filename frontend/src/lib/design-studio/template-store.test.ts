// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  STARTER_DESIGN_TEMPLATES,
  specFromBrief,
} from './design-spec'
import {
  deleteDesignTemplate,
  listDesignTemplates,
  listUserDesignTemplates,
  saveDesignTemplate,
} from './template-store'

describe('design-studio template-store', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('lists starter templates when nothing is saved', () => {
    const list = listDesignTemplates()
    expect(list.length).toBe(STARTER_DESIGN_TEMPLATES.length)
    expect(listUserDesignTemplates()).toEqual([])
  })

  it('saves, updates and deletes a user template', () => {
    const spec = specFromBrief('Landing de teste', 'site')
    const saved = saveDesignTemplate('Meu template', spec)
    expect(saved).not.toBeNull()
    expect(listUserDesignTemplates()).toHaveLength(1)

    const updated = saveDesignTemplate('Renomeado', spec, saved!.id)
    expect(updated?.id).toBe(saved!.id)
    expect(listUserDesignTemplates()).toHaveLength(1)
    expect(listUserDesignTemplates()[0].name).toBe('Renomeado')

    expect(deleteDesignTemplate(saved!.id)).toBe(true)
    expect(listUserDesignTemplates()).toHaveLength(0)
    expect(deleteDesignTemplate(saved!.id)).toBe(false)
  })

  it('ignores corrupt storage payloads', () => {
    window.localStorage.setItem('lexio.design-studio.templates.v1', '{not valid')
    expect(listUserDesignTemplates()).toEqual([])
  })
})
