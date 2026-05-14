// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./DraggablePanel', () => ({
  default: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) => (
    open ? <div><h1>{title}</h1>{children}</div> : null
  ),
}))

import PresentationV2BriefingModal, { formatPresentationV2BriefingPayload, type PresentationV2BriefingPayload } from './PresentationV2BriefingModal'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function buildPreflightResult(overrides: Partial<Parameters<NonNullable<React.ComponentProps<typeof PresentationV2BriefingModal>['onPreflight']>>[0]> = {}) {
  void overrides
  return {
    ready: true,
    blockers: [],
    warnings: [],
    checks: [],
    requiredAgents: [],
    activeMediaAgents: [],
    estimatedSteps: 10,
    estimatedMediaTasks: 2,
    estimatedCost: {
      currency: 'USD' as const,
      knownTextUsdMin: 0,
      knownTextUsdMax: 0,
      knownMediaUsdMin: 0,
      knownMediaUsdMax: 0,
      knownTotalUsdMin: 0,
      knownTotalUsdMax: 0,
      label: 'R$ 0,00-R$ 0,00 conhecidos',
      riskLevel: 'low' as const,
      unknownCostItems: [],
      assumptions: ['Premissas.'],
    },
  }
}

describe('formatPresentationV2BriefingPayload', () => {
  it('includes the premium briefing contract and media requirement levels', () => {
    const payload: PresentationV2BriefingPayload = {
      slideCount: 14,
      depth: 'tecnica',
      objective: 'Aprovar a estratégia para o contencioso de massa.',
      audience: 'Diretoria jurídica',
      coreMessage: 'A tese escolhida reduz risco financeiro e operacional.',
      successCriteria: 'Plano aprovado com cronograma e responsáveis definidos.',
      proofObligations: 'Evidenciar a cronologia contratual\nDemonstrar impacto financeiro',
      institutionalConstraints: 'Paleta sóbria\nSem exposição de dados confidenciais',
      durationMinutes: 18,
      slideDensity: 'densa',
      evidenceMode: 'estrita',
      tone: 'executivo e seguro',
      visualStyle: 'institucional com ênfase em contraste',
      outputFormat: 'pptx',
      multimodal: {
        images: true,
        audio: false,
        video: true,
        charts: true,
        diagrams: false,
      },
      mediaRequirements: {
        images: 'required',
        audio: 'disabled',
        video: 'optional',
        charts: 'required',
        diagrams: 'disabled',
      },
      constraints: 'Sem jargão excessivo',
      sourcePriority: 'Parecer interno\nKPIs do contencioso',
      clarificationAnswers: [],
      consolidatedBrief: '',
      clarificationExecutions: [],
    }

    const formatted = formatPresentationV2BriefingPayload(payload)

    expect(formatted).toContain('Tese ou mensagem central: A tese escolhida reduz risco financeiro e operacional.')
    expect(formatted).toContain('Critério de sucesso: Plano aprovado com cronograma e responsáveis definidos.')
    expect(formatted).toContain('Obrigações de prova:')
    expect(formatted).toContain('Restrições institucionais/visuais:')
    expect(formatted).toContain('Densidade por slide: Densa')
    expect(formatted).toContain('Exigência de evidência: Estrita')
    expect(formatted).toContain('Modalidades desejadas: Imagens (obrigatória), Vídeo (opcional), Gráficos (obrigatória)')
  })
})

describe('PresentationV2BriefingModal', () => {
  it('requires a successful preflight before allowing generation', async () => {
    const onGenerate = vi.fn()
    const onPreflight = vi.fn().mockResolvedValue(buildPreflightResult())

    render(
      <PresentationV2BriefingModal
        open
        topic="Tema teste"
        onClose={() => {}}
        onGenerate={onGenerate}
        onClarify={async () => ({ needsClarification: false, questions: [], consolidatedBrief: '', executions: [] })}
        onPreflight={onPreflight}
      />,
    )

    const generateButton = screen.getByRole('button', { name: /iniciar geração v2/i })
    expect((generateButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/execute o preflight para validar o contrato premium/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /preflight/i }))

    await waitFor(() => {
      expect((generateButton as HTMLButtonElement).disabled).toBe(false)
      expect(screen.getByText(/briefing validado e pronto para geração premium/i)).toBeTruthy()
    })

    fireEvent.click(generateButton)
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('hydrates the form from an initial payload and resets it on reopen', () => {
    const onGenerate = vi.fn()
    const firstPayload: PresentationV2BriefingPayload = {
      slideCount: 16,
      depth: 'executiva',
      objective: 'Objetivo A',
      audience: 'Diretoria jurídica',
      coreMessage: 'Mensagem A',
      successCriteria: 'Sucesso A',
      proofObligations: 'Prova A',
      institutionalConstraints: 'Restrição visual A',
      durationMinutes: 14,
      slideDensity: 'leve',
      evidenceMode: 'padrao',
      tone: 'tom A',
      visualStyle: 'estilo A',
      outputFormat: 'pdf',
      multimodal: {
        images: true,
        audio: false,
        video: true,
        charts: false,
        diagrams: false,
      },
      mediaRequirements: {
        images: 'required',
        audio: 'disabled',
        video: 'optional',
        charts: 'disabled',
        diagrams: 'disabled',
      },
      constraints: 'Restrição A',
      sourcePriority: 'Fonte A',
      clarificationAnswers: [
        {
          id: 'clarify-core-message',
          question: 'Qual tese precisa prevalecer?',
          answer: 'Mensagem A',
          category: 'content',
        },
      ],
      consolidatedBrief: 'Briefing consolidado A',
      clarificationExecutions: [],
    }
    const secondPayload: PresentationV2BriefingPayload = {
      ...firstPayload,
      slideCount: 8,
      depth: 'tecnica',
      objective: 'Objetivo B',
      audience: 'Cliente institucional',
      coreMessage: 'Mensagem B',
      successCriteria: 'Sucesso B',
      proofObligations: 'Prova B',
      institutionalConstraints: 'Restrição visual B',
      durationMinutes: 22,
      slideDensity: 'densa',
      evidenceMode: 'estrita',
      tone: 'tom B',
      visualStyle: 'estilo B',
      outputFormat: 'pptx',
      multimodal: {
        images: true,
        audio: true,
        video: false,
        charts: true,
        diagrams: true,
      },
      mediaRequirements: {
        images: 'optional',
        audio: 'required',
        video: 'disabled',
        charts: 'required',
        diagrams: 'optional',
      },
      constraints: 'Restrição B',
      sourcePriority: 'Fonte B',
      clarificationAnswers: [
        {
          id: 'clarify-success',
          question: 'Como saberemos que o deck funcionou?',
          answer: 'Sucesso B',
          category: 'other',
        },
      ],
      consolidatedBrief: 'Briefing consolidado B',
    }

    const { rerender } = render(
      <PresentationV2BriefingModal
        open
        topic="Tema A"
        initialPayload={firstPayload}
        onClose={() => {}}
        onGenerate={onGenerate}
        onClarify={async () => ({ needsClarification: false, questions: [], consolidatedBrief: '', executions: [] })}
        onPreflight={async () => buildPreflightResult()}
      />,
    )

    expect(screen.getByDisplayValue('Objetivo A')).toBeTruthy()
    expect(screen.getByDisplayValue('Diretoria jurídica')).toBeTruthy()
    expect(screen.getAllByDisplayValue('Mensagem A').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Qual tese precisa prevalecer?').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByDisplayValue('Objetivo A'), { target: { value: 'Objetivo editado temporariamente' } })

    rerender(
      <PresentationV2BriefingModal
        open={false}
        topic="Tema A"
        initialPayload={firstPayload}
        onClose={() => {}}
        onGenerate={onGenerate}
        onClarify={async () => ({ needsClarification: false, questions: [], consolidatedBrief: '', executions: [] })}
        onPreflight={async () => buildPreflightResult()}
      />,
    )

    rerender(
      <PresentationV2BriefingModal
        open
        topic="Tema B"
        initialPayload={secondPayload}
        onClose={() => {}}
        onGenerate={onGenerate}
        onClarify={async () => ({ needsClarification: false, questions: [], consolidatedBrief: '', executions: [] })}
        onPreflight={async () => buildPreflightResult()}
      />,
    )

    expect(screen.getByDisplayValue('Objetivo B')).toBeTruthy()
    expect(screen.queryByDisplayValue('Objetivo editado temporariamente')).toBeNull()
    expect(screen.getByDisplayValue('Cliente institucional')).toBeTruthy()
    expect(screen.getAllByDisplayValue('Mensagem B').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Como saberemos que o deck funcionou?').length).toBeGreaterThan(0)
    expect(screen.queryByText('Qual tese precisa prevalecer?')).toBeNull()
  })

  it('keeps generation blocked while clarification questions remain unanswered', async () => {
    const onGenerate = vi.fn()
    const onPreflight = vi.fn().mockResolvedValue(buildPreflightResult())

    render(
      <PresentationV2BriefingModal
        open
        topic="Tema teste"
        onClose={() => {}}
        onGenerate={onGenerate}
        onClarify={async () => ({
          needsClarification: true,
          consolidatedBrief: 'Briefing consolidado.',
          executions: [],
          questions: [
            {
              id: 'clarify-audience',
              question: 'Quem é o público principal?',
              category: 'audience',
            },
          ],
        })}
        onPreflight={onPreflight}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /analisar/i }))
    await waitFor(() => {
      expect(screen.getByText('Quem é o público principal?')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preflight/i }))
    const generateButton = screen.getByRole('button', { name: /iniciar geração v2/i })

    await waitFor(() => {
      expect((generateButton as HTMLButtonElement).disabled).toBe(true)
      expect(screen.getByText(/responda 1 pergunta\(s\) complementar\(es\)/i)).toBeTruthy()
    })

    fireEvent.change(screen.getByPlaceholderText(/resposta livre/i), { target: { value: 'Diretoria jurídica' } })

    await waitFor(() => {
      expect((generateButton as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(generateButton)
    expect(onGenerate).toHaveBeenCalledTimes(1)
  })
})