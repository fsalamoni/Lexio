// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import Breadcrumb from './Breadcrumb'

afterEach(() => {
  cleanup()
})

describe('Breadcrumb', () => {
  it('renders linked ancestors and the current page item', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Documentos', to: '/documents' },
          { label: 'Detalhe' },
        ]} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Documentos' }).getAttribute('href')).toBe('/documents')
    expect(screen.getByText('Detalhe')).toBeTruthy()
  })
})