import { useEffect, useState } from 'react'

interface Progress {
  phase: string
  message: string
  progress: number
}

export default function ProgressTracker({ documentId }: { documentId: string }) {
  const [progress, setProgress] = useState<Progress | null>(null)

  useEffect(() => {
    const ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws/document/${documentId}`)
    ws.onmessage = (e) => {
      try {
        setProgress(JSON.parse(e.data))
      } catch {}
    }
    ws.onerror = () => ws.close()
    return () => ws.close()
  }, [documentId])

  if (!progress) return null

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{progress.message}</span>
        <span className="text-sm text-gray-500">{progress.progress}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-brand-500 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress.progress}%` }}
        />
      </div>
    </div>
  )
}
