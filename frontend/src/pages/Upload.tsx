import { useState, useRef, useEffect } from 'react'
import { Upload as UploadIcon, FileText, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react'
import api from '../api/client'

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

export default function Upload() {
  const [uploading, setUploading] = useState(false)
  const [history, setHistory] = useState<UploadedFile[]>([])
  const [localFiles, setLocalFiles] = useState<{ name: string; status: 'uploading' | 'error' }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchHistory = () => {
    api.get('/uploads').then(res => setHistory(res.data.items || [])).catch(() => {})
  }

  useEffect(() => {
    fetchHistory()
    const interval = setInterval(fetchHistory, 5000)
    return () => clearInterval(interval)
  }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList) return

    setUploading(true)
    for (const file of Array.from(fileList)) {
      setLocalFiles(prev => [...prev, { name: file.name, status: 'uploading' }])
      try {
        const formData = new FormData()
        formData.append('file', file)
        await api.post('/uploads', formData)
        setLocalFiles(prev => prev.filter(f => f.name !== file.name))
        fetchHistory()
      } catch {
        setLocalFiles(prev =>
          prev.map(f => f.name === file.name ? { ...f, status: 'error' } : f)
        )
      }
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="max-w-2xl">
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

      <div
        onClick={() => inputRef.current?.click()}
        className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center cursor-pointer hover:border-brand-400 transition-colors mb-6"
      >
        <UploadIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">Clique para selecionar arquivos</p>
        <p className="text-sm text-gray-400 mt-1">PDF, DOCX, TXT — serão indexados automaticamente no acervo</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.doc,.md"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* Files uploading now */}
      {localFiles.length > 0 && (
        <div className="space-y-2 mb-4">
          {localFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white rounded-lg border p-3">
              <FileText className="w-5 h-5 text-gray-400" />
              <span className="text-sm flex-1">{f.name}</span>
              {f.status === 'uploading' && (
                <span className="text-xs text-yellow-600">Enviando...</span>
              )}
              {f.status === 'error' && (
                <span className="text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Erro
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Indexed history */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-medium text-gray-700">Acervo indexado ({history.length})</h2>
          </div>
          <div className="divide-y">
            {history.map(doc => {
              const s = STATUS_LABELS[doc.status] || STATUS_LABELS.uploaded
              const Icon = s.icon
              return (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{doc.filename}</p>
                    <p className="text-xs text-gray-400">
                      {formatSize(doc.size_bytes)}
                      {doc.chunks_indexed > 0 && ` · ${doc.chunks_indexed} fragmentos indexados`}
                      {doc.collection_name && ` · ${doc.collection_name}`}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${s.color} flex-shrink-0`}>
                    <Icon className="w-4 h-4" />
                    {s.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {history.length === 0 && localFiles.length === 0 && !uploading && (
        <p className="text-center text-sm text-gray-400">
          Nenhum documento indexado ainda. Os uploads alimentam o acervo vetorial usado durante a geração de documentos.
        </p>
      )}
    </div>
  )
}
