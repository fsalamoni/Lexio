// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Activity, Library } from 'lucide-react'
import { V2EmptyState, V2MetricGrid, V2PageHero } from './V2PagePrimitives'

afterEach(() => {
  cleanup()
})

describe('V2PagePrimitives', () => {
  it('renders metric cards, hero content, and empty states', () => {
    render(
      <div>
        <V2MetricGrid
          items={[
            { label: 'Documentos', value: '12', helper: 'Atualizados hoje', icon: Activity, tone: 'accent' },
            { label: 'Custos', value: 'R$ 8,50', tone: 'warm' },
          ]}
        />
        <V2PageHero
          eyebrow="Workspace"
          title="Painel principal"
          description="Resumo do estado da plataforma."
          actions={<button>Ação</button>}
          aside={<div>Aside</div>}
        />
        <V2EmptyState
          icon={Library}
          title="Sem dados"
          description="Nenhum item encontrado."
          action={<button>Novo item</button>}
        />
      </div>,
    )

    expect(screen.getByText('Documentos')).toBeTruthy()
    expect(screen.getByText('Atualizados hoje')).toBeTruthy()
    expect(screen.getByText('Workspace')).toBeTruthy()
    expect(screen.getByText('Painel principal')).toBeTruthy()
    expect(screen.getByText('Resumo do estado da plataforma.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ação' })).toBeTruthy()
    expect(screen.getByText('Sem dados')).toBeTruthy()
    expect(screen.getByText('Nenhum item encontrado.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Novo item' })).toBeTruthy()
  })
})