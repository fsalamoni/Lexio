// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParsedQuiz } from './artifact-parsers'
import QuizPlayer from './QuizPlayer'

afterEach(() => {
  cleanup()
})

describe('QuizPlayer', () => {
  it('supports study mode with immediate feedback and produces a scored results summary', () => {
    const data: ParsedQuiz = {
      title: 'Quiz Lexio',
      difficulty: 'Moderada',
      estimatedTime: '10 min',
      questions: [
        {
          number: 1,
          type: 'multipla_escolha',
          text: 'Qual é a resposta correta?',
          options: [
            { label: 'A', text: 'Alternativa correta' },
            { label: 'B', text: 'Alternativa incorreta' },
          ],
          answer: 'A',
          explanation: 'A alternativa A resume o entendimento dominante.',
        },
        {
          number: 2,
          type: 'verdadeiro_falso',
          text: 'A tese é verdadeira?',
          answer: 'F',
          explanation: 'A tese não se sustenta no precedente indicado.',
        },
      ],
    }

    render(<QuizPlayer data={data} />)

    expect(screen.getByText('Quiz Lexio')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Modo Estudo/ }))

    fireEvent.click(screen.getByRole('button', { name: /Alternativa correta/ }))
    expect(screen.getByText('Explicação')).toBeTruthy()
    expect(screen.getByText('A alternativa A resume o entendimento dominante.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    fireEvent.click(screen.getByRole('button', { name: 'Falso' }))
    expect(screen.getByText('A tese não se sustenta no precedente indicado.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Finalizar/ }))
    expect(screen.getByText('Resultado')).toBeTruthy()
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('2 de 2 questões corretas')).toBeTruthy()
    expect(screen.getByText('Revisão')).toBeTruthy()
  })
})