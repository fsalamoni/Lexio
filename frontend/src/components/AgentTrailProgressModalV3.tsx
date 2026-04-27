import type { ReactNode } from 'react'
import AgentTrailProgressModal, { type TrailStep } from './AgentTrailProgressModal'
import { DOCUMENT_V3_PHASES, type DocumentV3PipelineStep, getDocumentV3StepMeta } from '../lib/document-v3-pipeline'

/**
 * V3 modal — thin wrapper around `AgentTrailProgressModal` that:
 * - Builds the trail steps from the v3 pipeline state, grouping by phase.
 * - Adds a phase label prefix in the trail to reflect the phase grouping
 *   (the inner panel already shows them grouped visually).
 */
interface Props {
  isOpen: boolean
  title: string
  subtitle?: string
  currentMessage: string
  percent: number
  agents: DocumentV3PipelineStep[]
  isComplete: boolean
  hasError: boolean
  canClose?: boolean
  onClose: () => void
  children?: ReactNode
}

export default function AgentTrailProgressModalV3({
  isOpen,
  title,
  subtitle,
  currentMessage,
  percent,
  agents,
  isComplete,
  hasError,
  canClose,
  onClose,
  children,
}: Props) {
  const phaseLabelByKey = Object.fromEntries(
    DOCUMENT_V3_PHASES.map(p => [p.key, p.label]),
  ) as Record<DocumentV3PipelineStep['phase'], string>

  const steps: TrailStep[] = agents.map(agent => ({
    key: agent.key,
    label: `${phaseLabelByKey[agent.phase] || agent.phase} · ${agent.label}`,
    status: agent.status,
    detail: agent.runtimeMessage || agent.description,
    meta: getDocumentV3StepMeta(agent),
  }))

  return (
    <AgentTrailProgressModal
      isOpen={isOpen}
      title={title}
      subtitle={subtitle}
      currentMessage={currentMessage}
      percent={percent}
      steps={steps}
      isComplete={isComplete}
      hasError={hasError}
      canClose={canClose}
      onClose={onClose}
    >
      {children}
    </AgentTrailProgressModal>
  )
}
