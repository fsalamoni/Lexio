import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload as UploadIcon, FileText, CheckCircle, AlertCircle, Clock, RefreshCw, X, Trash2, Info, Eye } from 'lucide-react'
import api from '../api/client'
import { useToast } from '../components/Toast'
import { IS_FIREBASE } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  listAcervoDocuments,
  createAcervoDocument,
  deleteAcervoDocument,
  type AcervoDocumentData,
} from '../lib/firestore-service'

interface UploadedFile {
  id: string
  filename: string
  size_bytes: number
  chunks_indexed: number
  collection_name: string | null
  status: string
  created_at: string
}

const STATUS_LABELS: Record<string, { label: string; icon: typeof CheckCircle; color: string }> = {
  indexing:    { label: 'Indexando...', icon: Clock,         color: 'text-yellow-500' },
  indexed:     { label: 'Indexado',    icon: CheckCircle,    color: 'text-green-500'  },
  index_empty: { label: 'Sem texto',   icon: AlertCircle,    color: 'text-amber-500'  },
  index_error: { label: 'Erro',        icon: AlertCircle,    color: 'text-red-500'    },
  uploaded:    { label: 'Enviado',     icon: CheckCircle,    color: 'text-blue-500'   },
}

const ACCEPTED_TYPES = ['.pdf', '.docx', '.txt', '.doc', '.md']
const ACCEPTED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword', 'text/plain', 'text/markdown']
const MAX_SIZE_MB = 50

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Document view modal ──────────────────────────────────────────────────────

function AcervoDocModal({ doc, onClose }: { doc: AcervoDocumentData; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-900 truncate text-sm">{doc.filename}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-3">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Meta */}
        <div className="flex gap-4 px-5 py-2 border-b bg-gray-50 text-xs text-gray-500">
          <span>{formatSize(doc.size_bytes)}</span>
          {doc.chunks_count > 0 && <span>{doc.chunks_count} fragmentos</span>}
          <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {doc.text_content ? (
            <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans leading-relaxed">{doc.text_content}</pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <AlertCircle className="w-10 h-10 mb-3" />
              <p className="text-sm font-medium">Sem conteúdo de texto</p>
              <p className="text-xs mt-1">Este documento não possui texto extraível (ex.: PDF escaneado ou formato binário sem suporte).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Text extraction ──────────────────────────────────────────────────────────

/** Extract text from a File client-side. Handles DOCX, DOC (mammoth), PDF (pdfjs), and plain text. */
async function extractFileText(file: File): Promise<string> {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '')

  // DOCX / DOC — use mammoth
  if (ext === '.docx' || ext === '.doc') {
    const arrayBuffer = await file.arrayBuffer()
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value.trim()
  }

  // PDF — use pdfjs-dist
  if (ext === '.pdf') {
    const arrayBuffer = await file.arrayBuffer()
    const pdfjsLib = await import('pdfjs-dist')
    // Point to the bundled worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).href
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
    const pages: string[] = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
      pages.push(pageText)
    }
    return pages.join('\n').trim()
  }

  // TXT / MD / others — plain UTF-8 text
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result.trim() : '')
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
    reader.readAsText(file, 'UTF-8')
  })
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Upload() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [history, setHistory] = useState<UploadedFile[]>([])
  const [firebaseHistory, setFirebaseHistory] = useState<AcervoDocumentData[]>([])
  const [localFiles, setLocalFiles] = useState<{ name: string; size: number; status: 'uploading' | 'error'; progress?: number }[]>([])
  const [viewDoc, setViewDoc] = useState<AcervoDocumentData | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const toast = useToast()
  const { userId } = useAuth()

  const fetchHistory = useCallback(() => {
    if (IS_FIREBASE && userId) {
      listAcervoDocuments(userId)
        .then(res => setFirebaseHistory(res.items))
        .catch(() => toast.error('Erro ao carregar histórico do acervo'))
      return
    }
    if (IS_FIREBASE) return
    api.get('/uploads').then(res => setHistory(res.data.items || [])).catch(() => toast.error('Erro ao carregar histórico de uploads'))
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchHistory()
    if (!IS_FIREBASE) {
      const interval = setInterval(fetchHistory, 5000)
      return () => clearInterval(interval)
    }
  }, [fetchHistory])

  const validateFile = (file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ACCEPTED_TYPES.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      return `Tipo não suportado: ${ext}`
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Arquivo muito grande (máx. ${MAX_SIZE_MB} MB)`
    }
    return null
  }

  const processFiles = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)

    for (const file of files) {
      const error = validateFile(file)
      if (error) {
        toast.error(`${file.name}: ${error}`)
        continue
      }

      setLocalFiles(prev => [...prev, { name: file.name, size: file.size, status: 'uploading', progress: 0 }])

      if (IS_FIREBASE) {
        // Firebase mode: extract text client-side and store in Firestore
        if (!userId) {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
          )
          toast.error('Usuário não autenticado. Faça login novamente.')
          continue
        }
        try {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, progress: 20 } : f)
          )
          const textContent = await extractFileText(file)
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, progress: 80 } : f)
          )
          const result = await createAcervoDocument(userId, {
            filename: file.name,
            content_type: file.type || 'text/plain',
            size_bytes: file.size,
            text_content: textContent,
          })
          setLocalFiles(prev => prev.filter(f => f.name !== file.name))
          if (result.truncated) {
            toast.success(`${file.name} adicionado ao acervo (texto truncado por exceder o limite)`)
          } else {
            toast.success(`${file.name} adicionado ao acervo`)
          }
          fetchHistory()
        } catch (err: any) {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
          )
          toast.error(`Erro ao processar ${file.name}`, err?.message)
        }
      } else {
        // Server mode: upload to backend API
        try {
          const formData = new FormData()
          formData.append('file', file)
          await api.post('/uploads', formData, {
            onUploadProgress: (evt) => {
              if (evt.total) {
                const pct = Math.round((evt.loaded / evt.total) * 100)
                setLocalFiles(prev =>
                  prev.map(f => f.name === file.name ? { ...f, progress: pct } : f)
                )
              }
            },
          })
          setLocalFiles(prev => prev.filter(f => f.name !== file.name))
          fetchHistory()
        } catch (err: any) {
          setLocalFiles(prev =>
            prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
          )
          toast.error(`Erro ao enviar ${file.name}`, err?.response?.data?.detail || err?.message)
        }
      }
    }

    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }


  const handleDeleteUpload = async (id: string, filename: string) => {
    if (!window.confirm(`Remover "${filename}" do acervo permanentemente?`)) return
    setDeletingId(id)
    try {
      if (IS_FIREBASE) {
        if (!userId) { toast.error('Usuário não autenticado. Faça login novamente.'); setDeletingId(null); return }
        await deleteAcervoDocument(userId, id)
        setFirebaseHistory(prev => prev.filter(f => f.id !== id))
      } else {
        await api.delete(`/uploads/${id}`)
        setHistory(prev => prev.filter(f => f.id !== id))
      }
      toast.success('Arquivo removido do acervo')
    } catch (err: any) {
      toast.error('Erro ao remover arquivo', err?.response?.data?.detail ?? err?.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(Array.from(e.target.files))
  }

  // Drag-and-drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    dragCounter.current = 0

    const files = Array.from(e.dataTransfer.files)
    if (files.length) processFiles(files)
  }

  const removeLocalFile = (name: string) => {
    setLocalFiles(prev => prev.filter(f => f.name !== name))
  }

  return (
    <div className="max-w-2xl">
      {/* View modal */}
      {viewDoc && <AcervoDocModal doc={viewDoc} onClose={() => setViewDoc(null)} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload de Documentos</h1>
        <button
          onClick={fetchHistory}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Atualizar"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>

      {/* Firebase mode: guidance on how acervo works */}
      {IS_FIREBASE && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 flex gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800">Acervo de documentos de referência</p>
            <p className="text-xs text-blue-600 mt-1">
              Envie documentos de texto (.txt, .md, .doc, .docx, .pdf) que servirão como base de conhecimento
              na elaboração de novos documentos. O conteúdo textual será armazenado e utilizado pelo
              pipeline de geração junto com as teses do banco de teses.
            </p>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={[
          'bg-white rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200 mb-6 select-none',
          isDragging
            ? 'border-brand-500 bg-brand-50 scale-[1.01] shadow-lg'
            : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50',
        ].join(' ')}
      >
        <div className={[
          'w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors',
          isDragging ? 'bg-brand-100' : 'bg-gray-100',
        ].join(' ')}>
          <UploadIcon className={['w-8 h-8 transition-colors', isDragging ? 'text-brand-600' : 'text-gray-400'].join(' ')} />
        </div>

        {isDragging ? (
          <>
            <p className="text-brand-700 font-semibold text-lg">Solte os arquivos aqui</p>
            <p className="text-brand-500 text-sm mt-1">Pronto para indexar</p>
          </>
        ) : (
          <>
            <p className="text-gray-700 font-semibold">Arraste arquivos ou clique para selecionar</p>
            <p className="text-sm text-gray-400 mt-1">
              {ACCEPTED_TYPES.join(', ').toUpperCase()} — máx. {MAX_SIZE_MB} MB por arquivo
            </p>
            <p className="text-xs text-gray-400 mt-1">Serão indexados automaticamente no acervo vetorial</p>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleInputChange}
          className="hidden"
        />
      </div>

      {/* Files uploading now */}
      {localFiles.length > 0 && (
        <div className="space-y-2 mb-4">
          {localFiles.map((f, i) => (
            <div key={i} className="bg-white rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400">{formatSize(f.size)}</p>
                </div>
                {f.status === 'uploading' && (
                  <span className="text-xs text-brand-600 font-medium flex-shrink-0">{f.progress ?? 0}%</span>
                )}
                {f.status === 'error' && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-red-500">Erro</span>
                    <button
                      onClick={() => removeLocalFile(f.name)}
                      className="ml-1 text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {f.status === 'uploading' && (
                <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-brand-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${f.progress ?? 0}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Indexed history — Firebase mode */}
      {IS_FIREBASE && firebaseHistory.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Acervo de referência</h2>
            <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">{firebaseHistory.length}</span>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {firebaseHistory.map(acervoDoc => {
              const s = STATUS_LABELS[acervoDoc.status] || STATUS_LABELS.uploaded
              const Icon = s.icon
              return (
                <div key={acervoDoc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{acervoDoc.filename}</p>
                    <p className="text-xs text-gray-400">
                      {formatSize(acervoDoc.size_bytes)}
                      {acervoDoc.chunks_count > 0 && ` · ${acervoDoc.chunks_count} fragmentos`}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${s.color} flex-shrink-0`}>
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {acervoDoc.text_content && (
                    <button
                      onClick={() => setViewDoc(acervoDoc)}
                      className="text-gray-300 hover:text-brand-500 transition-colors flex-shrink-0"
                      title="Ver conteúdo"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteUpload(acervoDoc.id!, acervoDoc.filename)}
                    disabled={deletingId === acervoDoc.id}
                    className="ml-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0"
                    title="Remover do acervo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Indexed history — Server mode */}
      {!IS_FIREBASE && history.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Acervo indexado</h2>
            <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">{history.length}</span>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto">
            {history.map(doc => {
              const s = STATUS_LABELS[doc.status] || STATUS_LABELS.uploaded
              const Icon = s.icon
              return (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                    <p className="text-xs text-gray-400">
                      {formatSize(doc.size_bytes)}
                      {doc.chunks_indexed > 0 && ` · ${doc.chunks_indexed} fragmentos`}
                      {doc.collection_name && ` · ${doc.collection_name}`}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${s.color} flex-shrink-0`}>
                    <Icon className={['w-4 h-4', doc.status === 'indexing' ? 'animate-spin' : ''].join(' ')} />
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteUpload(doc.id, doc.filename)}
                    disabled={deletingId === doc.id}
                    className="ml-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-40 flex-shrink-0"
                    title="Remover do acervo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {((IS_FIREBASE ? firebaseHistory.length : history.length) === 0) && localFiles.length === 0 && !uploading && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">
            Nenhum documento no acervo ainda.
          </p>
          <p className="text-xs text-gray-300 mt-1">
            Os documentos enviados servirão como base de conhecimento na elaboração de novos documentos.
          </p>
        </div>
      )}
    </div>
  )
}
