import { useState, useRef } from 'react'
import { Upload as UploadIcon, FileText, CheckCircle } from 'lucide-react'
import api from '../api/client'

export default function Upload() {
  const [files, setFiles] = useState<{ name: string; status: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList) return

    setUploading(true)
    for (const file of Array.from(fileList)) {
      setFiles((prev) => [...prev, { name: file.name, status: 'uploading' }])
      try {
        const formData = new FormData()
        formData.append('file', file)
        await api.post('/uploads', formData)
        setFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, status: 'done' } : f))
        )
      } catch {
        setFiles((prev) =>
          prev.map((f) => (f.name === file.name ? { ...f, status: 'error' } : f))
        )
      }
    }
    setUploading(false)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload de Documentos</h1>
      <div
        onClick={() => inputRef.current?.click()}
        className="bg-white rounded-xl border-2 border-dashed border-gray-300 p-12 text-center cursor-pointer hover:border-brand-400 transition-colors"
      >
        <UploadIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-600">Clique para selecionar arquivos</p>
        <p className="text-sm text-gray-400 mt-1">PDF, DOCX, TXT</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.doc"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white rounded-lg border p-3">
              <FileText className="w-5 h-5 text-gray-400" />
              <span className="text-sm flex-1">{f.name}</span>
              {f.status === 'done' && <CheckCircle className="w-5 h-5 text-green-500" />}
              {f.status === 'uploading' && <span className="text-xs text-gray-400">Enviando...</span>}
              {f.status === 'error' && <span className="text-xs text-red-500">Erro</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
