/**
 * TaskBar — Floating indicator for active background tasks.
 *
 * Displayed as a small badge at the bottom-right that expands into a list
 * showing each running/completed/failed task with a progress bar.
 */
import { useState } from 'react'
import { Loader2, CheckCircle2, AlertCircle, CircleSlash2, X, ChevronUp, ChevronDown, Activity } from 'lucide-react'
import { useTaskManager, type TaskInfo } from '../contexts/TaskManagerContext'
import { formatCostBadge } from '../lib/currency-utils'

function buildTaskOperationalLabel(task: TaskInfo): string | undefined {
  const operationals = task.operationals
  if (!operationals) return undefined
  const parts: string[] = []
  if (operationals.totalCostUsd > 0) parts.push(formatCostBadge(operationals.totalCostUsd))
  if (operationals.totalRetryCount > 0) {
    parts.push(`${operationals.totalRetryCount} ${operationals.totalRetryCount === 1 ? 'retry' : 'retries'}`)
  }
  if (operationals.fallbackCount > 0) {
    parts.push(`${operationals.fallbackCount} ${operationals.fallbackCount === 1 ? 'fallback' : 'fallbacks'}`)
  }
  const phaseCount = Object.keys(operationals.phaseCounts || {}).length
  if (phaseCount > 0) parts.push(`${phaseCount} etapas`) 
  return parts.length > 0 ? parts.join(' • ') : undefined
}

function formatElapsed(ms: number): string {
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m${remSecs.toString().padStart(2, '0')}s`
}

function TaskRow({ task, onDismiss }: { task: TaskInfo; onDismiss: () => void }) {
  const elapsed = (task.completedAt ?? Date.now()) - task.startedAt
  const isRunning = task.status === 'running'
  const isError = task.status === 'error'
  const isCancelled = task.status === 'cancelled'
  const operationalLabel = buildTaskOperationalLabel(task)

  return (
    <div className="px-3 py-2 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">
        {isRunning && <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin flex-shrink-0" />}
        {task.status === 'completed' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
        {isError && <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
        {isCancelled && <CircleSlash2 className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
        <span className="text-xs font-medium text-gray-800 truncate flex-1">{task.name}</span>
        <span className="text-[10px] text-gray-400 flex-shrink-0">{formatElapsed(elapsed)}</span>
        {!isRunning && (
          <button onClick={onDismiss} className="p-0.5 rounded hover:bg-gray-200 text-gray-400 flex-shrink-0">
            <X size={12} />
          </button>
        )}
      </div>
      {isRunning && (
        <div className="mt-1.5">
          <div className="flex items-start justify-between gap-2 mb-0.5">
            <span className="text-[10px] text-gray-500 leading-4 break-words min-w-0 flex-1">{task.phase}</span>
            <span className="text-[10px] text-indigo-600 font-medium">{Math.round(task.progress)}%</span>
          </div>
          {task.stageMeta && (
            <p className="text-[10px] text-gray-400 leading-4 break-words mb-1">{task.stageMeta}</p>
          )}
          {operationalLabel && (
            <p className="text-[10px] text-gray-500 leading-4 break-words mb-1">{operationalLabel}</p>
          )}
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className="bg-indigo-500 rounded-full h-1.5 transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}
      {isError && task.error && (
        <p className="text-[10px] text-red-500 mt-1 leading-4 break-words">{task.error}</p>
      )}
      {isCancelled && (
        <p className="text-[10px] text-amber-600 mt-1 leading-4 break-words">Execução cancelada pelo usuário.</p>
      )}
    </div>
  )
}

export default function TaskBar() {
  const { tasks, dismissTask, activeCount } = useTaskManager()
  const [expanded, setExpanded] = useState(false)

  if (tasks.length === 0) return null

  return (
    <div className="fixed bottom-3 left-3 right-3 sm:bottom-4 sm:left-auto sm:right-4 z-[900] select-none">
      {/* Expanded list */}
      {expanded && (
        <div className="mb-2 w-full sm:w-72 max-w-[22rem] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
            <span className="text-xs font-semibold text-gray-700">Tarefas em andamento</span>
            <button onClick={() => setExpanded(false)} className="p-0.5 rounded hover:bg-gray-200">
              <ChevronDown size={14} className="text-gray-500" />
            </button>
          </div>
          <div className="max-h-[70vh] sm:max-h-60 overflow-y-auto">
            {tasks.map(t => (
              <TaskRow key={t.id} task={t} onDismiss={() => dismissTask(t.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Collapsed badge */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 px-3 py-2 rounded-full shadow-lg border transition-colors ${
          activeCount > 0
            ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
        }`}
      >
        {activeCount > 0 ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Activity className="w-4 h-4" />
        )}
        <span className="text-xs font-medium">
          {activeCount > 0 ? `${activeCount} tarefa${activeCount > 1 ? 's' : ''}` : `${tasks.length} concluída${tasks.length > 1 ? 's' : ''}`}
        </span>
        {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  )
}
