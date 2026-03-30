/**
 * TaskManagerContext — Global persistent task execution manager.
 *
 * Keeps long-running tasks alive across page navigation by storing them
 * in a top-level React context (above the router).
 *
 * Each task has:
 *  - id, name, status (running/completed/error)
 *  - progress (0-100), phase description
 *  - start time, elapsed time
 *  - optional result or error
 *
 * A floating TaskBar indicator shows active tasks as a small badge/panel.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'

// ── Types ───────────────────────────────────────────────────────────────────

export type TaskStatus = 'running' | 'completed' | 'error'

export interface TaskInfo {
  id: string
  name: string
  status: TaskStatus
  progress: number
  phase: string
  startedAt: number
  completedAt?: number
  error?: string
  result?: unknown
}

export interface TaskProgress {
  progress: number
  phase: string
}

type TaskExecutor = (onProgress: (p: TaskProgress) => void) => Promise<unknown>

interface TaskManagerContextType {
  tasks: TaskInfo[]
  /** Starts a new persistent task. Returns task id. */
  startTask: (name: string, executor: TaskExecutor) => string
  /** Dismiss a completed/errored task from the list */
  dismissTask: (id: string) => void
  /** Get a specific task by id */
  getTask: (id: string) => TaskInfo | undefined
  /** Active (running) task count */
  activeCount: number
}

// ── Context ─────────────────────────────────────────────────────────────────

const TaskManagerContext = createContext<TaskManagerContextType | null>(null)

export function useTaskManager(): TaskManagerContextType {
  const ctx = useContext(TaskManagerContext)
  if (!ctx) throw new Error('useTaskManager must be inside TaskManagerProvider')
  return ctx
}

// ── Provider ────────────────────────────────────────────────────────────────

export function TaskManagerProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<TaskInfo[]>([])
  const idCounter = useRef(0)

  const updateTask = useCallback((id: string, patch: Partial<TaskInfo>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }, [])

  const startTask = useCallback((name: string, executor: TaskExecutor): string => {
    const id = `task_${++idCounter.current}_${Date.now()}`
    const task: TaskInfo = {
      id,
      name,
      status: 'running',
      progress: 0,
      phase: 'Iniciando...',
      startedAt: Date.now(),
    }
    setTasks(prev => [...prev, task])

    const onProgress = (p: TaskProgress) => {
      updateTask(id, { progress: Math.min(100, Math.max(0, p.progress)), phase: p.phase })
    }

    // Execute in background — survives navigation
    executor(onProgress)
      .then(result => {
        updateTask(id, { status: 'completed', progress: 100, phase: 'Concluído', completedAt: Date.now(), result })
      })
      .catch(err => {
        const msg = err instanceof Error ? err.message : String(err)
        updateTask(id, { status: 'error', phase: 'Erro', completedAt: Date.now(), error: msg })
      })

    return id
  }, [updateTask])

  const dismissTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }, [])

  const getTask = useCallback((id: string) => {
    return tasks.find(t => t.id === id)
  }, [tasks])

  const activeCount = tasks.filter(t => t.status === 'running').length

  return (
    <TaskManagerContext.Provider value={{ tasks, startTask, dismissTask, getTask, activeCount }}>
      {children}
    </TaskManagerContext.Provider>
  )
}
