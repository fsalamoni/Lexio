// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import StatusBadge from './StatusBadge'

afterEach(() => {
  cleanup()
})

describe('StatusBadge', () => {
  it('renders known statuses with their translated label and animated processing icon', () => {
    const { container } = render(<StatusBadge status="processando" />)
    expect(screen.getByText('Processando')).toBeTruthy()
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('falls back to the raw label for unknown statuses', () => {
    render(<StatusBadge status="custom_status" />)
    expect(screen.getByText('custom_status')).toBeTruthy()
  })
})