import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { Archive, FileText, Image, Loader2, Music, Paperclip, Presentation, Send, Table, Video, X } from 'lucide-react'
import clsx from 'clsx'
import type { ChatTurnAttachment } from '../../lib/firestore-types'
import {
  CHAT_ATTACHMENT_ACCEPTED_EXTENSIONS,
  prepareChatInputAttachmentCandidate,
  type PreparedChatInputAttachment,
} from '../../lib/chat-attachment-ingestion'
import { isEnabled } from '../../lib/feature-flags'

const MAX_ATTACHMENTS_PER_TURN = 12

export interface ComposerSubmitPayload {
  text: string
  attachments?: ChatTurnAttachment[]
  attachmentFiles?: PreparedChatInputAttachment[]
}

interface ComposerProps {
  onSend: (payload: ComposerSubmitPayload) => void
  disabled?: boolean
  busy?: boolean
  placeholder?: string
}

export default function Composer({ onSend, disabled, busy, placeholder }: ComposerProps) {
  const [text, setText] = useState('')
  const [attachmentEntries, setAttachmentEntries] = useState<PreparedChatInputAttachment[]>([])
  const [processingAttachments, setProcessingAttachments] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const attachmentsEnabled = isEnabled('FF_CHAT_ATTACHMENTS')

  // Auto-resize textarea up to ~10 lines.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    const next = Math.min(ta.scrollHeight, 240)
    ta.style.height = `${next}px`
  }, [text])

  const submit = () => {
    const trimmed = text.trim()
    const attachments = attachmentsEnabled ? attachmentEntries.map(entry => entry.attachment) : []
    if ((!trimmed && attachments.length === 0) || disabled || processingAttachments) return
    onSend({
      text: trimmed || 'Analise os anexos enviados.',
      attachments,
      attachmentFiles: attachmentEntries,
    })
    setText('')
    setAttachmentEntries([])
    setAttachmentError(null)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    if (!attachmentsEnabled) {
      setAttachmentError('Anexos do chat estão desabilitados nesta configuração.')
      return
    }
    const items = Array.from(files)
    if (!items.length) return
    const slots = Math.max(0, MAX_ATTACHMENTS_PER_TURN - attachmentEntries.length)
    if (slots === 0) {
      setAttachmentError(`Limite de ${MAX_ATTACHMENTS_PER_TURN} anexos por envio atingido.`)
      return
    }
    const selected = items.slice(0, slots)
    setAttachmentError(null)
    setProcessingAttachments(true)
    try {
      const prepared = await Promise.all(selected.map(file => prepareChatInputAttachmentCandidate(file)))
      setAttachmentEntries(prev => [...prev, ...prepared])
      const failed = prepared.filter(item => item.attachment.extraction.status === 'failed').length
      const skipped = items.length - selected.length
      if (failed > 0 || skipped > 0) {
        setAttachmentError([
          failed > 0 ? `${failed} anexo(s) não puderam ser processados.` : null,
          skipped > 0 ? `${skipped} anexo(s) excederam o limite por envio.` : null,
        ].filter(Boolean).join(' '))
      }
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : String(error))
    } finally {
      setProcessingAttachments(false)
    }
  }

  const removeAttachment = (attachmentId: string) => {
    setAttachmentEntries(prev => prev.filter(entry => entry.attachment.attachment_id !== attachmentId))
  }

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !attachmentsEnabled) return
    event.preventDefault()
    setDragging(true)
  }

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDragging(false)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (disabled || !attachmentsEnabled) return
    event.preventDefault()
    setDragging(false)
    void handleFiles(event.dataTransfer.files)
  }

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled || !attachmentsEnabled) return
    const files = Array.from(event.clipboardData.files ?? [])
    if (!files.length) return
    event.preventDefault()
    void handleFiles(files)
  }

  const attachments = attachmentsEnabled ? attachmentEntries.map(entry => entry.attachment) : []
  const canSubmit = !disabled && !processingAttachments && Boolean(text.trim() || attachments.length)

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={clsx(
        'rounded-2xl border bg-white p-3 shadow-sm transition-colors',
        dragging ? 'border-indigo-300 bg-indigo-50/40' : 'border-[var(--v2-border)]',
      )}
    >
      {attachmentsEnabled && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={CHAT_ATTACHMENT_ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={event => {
            if (event.currentTarget.files) void handleFiles(event.currentTarget.files)
            event.currentTarget.value = ''
          }}
        />
      )}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        rows={2}
        aria-label="Mensagem para o orquestrador"
        placeholder={placeholder ?? 'Pergunte ao orquestrador… (Enter envia, Shift+Enter quebra a linha)'}
        disabled={disabled}
        className="w-full resize-none border-0 bg-transparent text-sm leading-6 text-[var(--v2-ink-strong)] placeholder:text-[var(--v2-ink-faint)] focus:outline-none disabled:opacity-60"
      />
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {attachments.map(attachment => {
            const Icon = getAttachmentIcon(attachment)
            const statusClass = attachment.extraction.status === 'failed'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : attachment.extraction.status === 'unsupported'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            return (
              <span
                key={attachment.attachment_id}
                className={clsx('inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]', statusClass)}
                title={`${attachment.filename} · ${formatBytes(attachment.size_bytes)}`}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className="max-w-[16rem] truncate font-medium">{attachment.filename}</span>
                <span className="shrink-0 text-[10px] opacity-80">{formatBytes(attachment.size_bytes)}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.attachment_id)}
                  className="rounded-full p-0.5 hover:bg-white/70"
                  aria-label={`Remover ${attachment.filename}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
      {attachmentError && (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
          {attachmentError}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--v2-ink-faint)]">
        <div className="flex items-center gap-2">
          {attachmentsEnabled && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || processingAttachments}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Anexar arquivos"
              title="Anexar arquivos"
            >
              {processingAttachments ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            </button>
          )}
          <span>Enter envia · Shift+Enter quebra linha</span>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={clsx(
            'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
            !canSubmit
              ? 'bg-[var(--v2-border)] text-[var(--v2-ink-faint)] cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700',
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Enviar
        </button>
      </div>
    </div>
  )
}

function getAttachmentIcon(attachment: ChatTurnAttachment) {
  if (attachment.kind === 'image') return Image
  if (attachment.kind === 'audio') return Music
  if (attachment.kind === 'video') return Video
  if (attachment.kind === 'spreadsheet') return Table
  if (attachment.kind === 'presentation') return Presentation
  if (attachment.kind === 'archive') return Archive
  return FileText
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
