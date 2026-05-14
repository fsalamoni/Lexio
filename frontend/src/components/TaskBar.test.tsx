// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaskBar from './TaskBar'

const taskBarMocks = vi.hoisted(() => ({
  cancelTask: vi.fn(),
  dismissTask: vi.fn(),
  useTaskManager: vi.fn(),
}))

vi.mock('../contexts/TaskManagerContext', () => ({
  useTaskManager: () => taskBarMocks.useTaskManager(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TaskBar', () => {
  it('renders running task details and expands the list', () => {
    taskBarMocks.useTaskManager.mockReturnValue({
      activeCount: 1,
      cancelTask: taskBarMocks.cancelTask,
      dismissTask: taskBarMocks.dismissTask,
      tasks: [
        {
          id: 'task-1',
          name: 'Pipeline v3',
          status: 'running',
          startedAt: Date.now() - 15_000,
          progress: 65,
          phase: 'Pesquisa externa',
          cancellable: true,
          stageMeta: 'Aguardando retorno do provedor',
          operationals: {
            totalCostUsd: 0,
            totalRetryCount: 2,
            fallbackCount: 1,
            phaseCounts: { pesquisa: 1, sintese: 1 },
          },
        },
      ],
    })

    render(<TaskBar />)

    expect(screen.getByRole('button', { name: /1 tarefa/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /1 tarefa/ }))
    expect(screen.getByText('Tarefas em andamento')).toBeTruthy()
    expect(screen.getByText('Pipeline v3')).toBeTruthy()
    expect(screen.getByText('Pesquisa externa')).toBeTruthy()
    expect(screen.getByText('Aguardando retorno do provedor')).toBeTruthy()
    expect(screen.getByText('2 retries • 1 fallback • 2 etapas')).toBeTruthy()
    expect(screen.getByText('65%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Cancelar Pipeline v3/ }))
    expect(taskBarMocks.cancelTask).toHaveBeenCalledWith('task-1')
  })

  it('shows completed tasks and allows dismissing them', () => {
    taskBarMocks.useTaskManager.mockReturnValue({
      activeCount: 0,
      cancelTask: taskBarMocks.cancelTask,
      dismissTask: taskBarMocks.dismissTask,
      tasks: [
        {
          id: 'task-2',
          name: 'Sessão concluída',
          status: 'completed',
          startedAt: Date.now() - 10_000,
          completedAt: Date.now(),
          progress: 100,
          phase: 'Concluído',
        },
      ],
    })

    render(<TaskBar />)

    fireEvent.click(screen.getByRole('button', { name: /1 concluída/ }))
    expect(screen.getByText('Sessão concluída')).toBeTruthy()
    const dismissButton = screen.getByText('Sessão concluída').parentElement?.querySelector('button')
    dismissButton?.click()
    expect(taskBarMocks.dismissTask).toHaveBeenCalledWith('task-2')
  })
})