import { describe, expect, it } from 'vitest'
import type { ChatAgentWorkPackage, ChatTrailEvent, ChatTurnData } from './firestore-types'
import {
  appendOrReplaceBundleEvent,
  buildChatDeliverableBundleForTurn,
  findWorkPackageForExportRetry,
  prepareWorkPackageForExportRetry,
  replaceWorkPackageInTrail,
} from './chat-deliverable-bundles'

const workPackage: ChatAgentWorkPackage = {
  id: 'pkg-1',
  conversation_id: 'conv-1',
  turn_id: 'turn-1',
  agent_key: 'chat_export_packager',
  result_markdown: '# Entrega',
  created_at: '2026-05-16T10:00:00.000Z',
  artifacts: [
    {
      artifact_id: 'doc-v1',
      logical_document_id: 'doc',
      version: 1,
      title: 'Documento final',
      kind: 'legal_document',
      format: 'markdown',
      exports: [
        { label: 'DOCX', format: 'docx', status: 'ready', download_url: 'https://cdn.lexio.test/doc.docx' },
        { label: 'PDF', format: 'pdf', status: 'failed', reason: 'Falha temporaria.' },
      ],
    },
  ],
}

function makeTurn(trail: ChatTrailEvent[]): ChatTurnData {
  return {
    id: 'turn-1',
    conversation_id: 'conv-1',
    user_input: 'Gere documentos.',
    trail,
    assistant_markdown: '# Entrega',
    status: 'done',
    created_at: '2026-05-16T10:00:00.000Z',
    completed_at: '2026-05-16T10:00:10.000Z',
  }
}

describe('chat deliverable bundle helpers', () => {
  it('builds a final bundle from agent work package artifacts', () => {
    const bundle = buildChatDeliverableBundleForTurn(makeTurn([
      { type: 'agent_work_package', package: workPackage, ts: '2026-05-16T10:00:01.000Z' },
    ]))

    expect(bundle).toMatchObject({
      title: 'Arquivos gerados',
      status: 'partial',
      ready_count: 1,
      failed_count: 1,
      planned_count: 0,
    })
    expect(bundle?.items[0]).toMatchObject({
      title: 'Documento final',
      source_agent_key: 'chat_export_packager',
      status: 'partial',
    })
  })

  it('prepares a failed export for retry without losing ready exports', () => {
    const prepared = prepareWorkPackageForExportRetry(workPackage, {
      turnId: 'turn-1',
      artifactId: 'doc-v1',
      format: 'pdf',
    })

    const exports = prepared.artifacts?.[0]?.exports ?? []
    expect(exports.find(exportRef => exportRef.format === 'docx')).toMatchObject({ status: 'ready' })
    expect(exports.find(exportRef => exportRef.format === 'pdf')).toMatchObject({
      status: 'retrying',
      attempt_count: 1,
      download_url: undefined,
    })
  })

  it('finds and replaces the package that owns an export retry', () => {
    const trail: ChatTrailEvent[] = [
      { type: 'agent_call', agent_key: 'chat_writer', task: 'Criar', ts: '2026-05-16T10:00:00.000Z' },
      { type: 'agent_work_package', package: workPackage, ts: '2026-05-16T10:00:01.000Z' },
    ]
    const turn = makeTurn(trail)

    expect(findWorkPackageForExportRetry(turn, { turnId: 'turn-1', artifactId: 'doc-v1', format: 'pdf' })?.id).toBe('pkg-1')

    const updated = { ...workPackage, result_markdown: '# Atualizado' }
    const replaced = replaceWorkPackageInTrail(trail, updated)
    const packageEvent = replaced.find(event => event.type === 'agent_work_package')
    expect(packageEvent?.type).toBe('agent_work_package')
    if (packageEvent?.type === 'agent_work_package') {
      expect(packageEvent.package.result_markdown).toBe('# Atualizado')
    }
  })

  it('keeps one bundle event per turn when refreshing the panel state', () => {
    const turn = makeTurn([{ type: 'agent_work_package', package: workPackage, ts: '2026-05-16T10:00:01.000Z' }])
    const bundle = buildChatDeliverableBundleForTurn(turn)
    expect(bundle).toBeTruthy()

    const once = appendOrReplaceBundleEvent(turn.trail, bundle!)
    const twice = appendOrReplaceBundleEvent(once, bundle!)

    expect(twice.filter(event => event.type === 'deliverable_bundle_ready')).toHaveLength(1)
  })
})
