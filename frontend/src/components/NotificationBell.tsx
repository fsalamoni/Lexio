import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, FileText, X } from 'lucide-react'
import api from '../api/client'
import { IS_FIREBASE } from '../lib/firebase'
import { buildWorkspaceDocumentDetailPath } from '../lib/workspace-routes'

interface NotifItem {
  id: string
  type: string
  title: string
  message: string
  document_id: string | null
  is_read: boolean
  created_at: string
}

const TYPE_ICONS: Record<string, string> = {
  document_completed: '✅',
  document_approved: '🎉',
  document_rejected: '🔴',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotifItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchNotifications = useCallback(async () => {
    if (IS_FIREBASE) return // No backend API in Firebase mode
    try {
      const res = await api.get('/notifications?limit=20')
      setItems(res.data?.items || [])
      setUnreadCount(res.data?.unread_count || 0)
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, [])

  // Initial fetch + poll every 30s
  useEffect(() => {
    fetchNotifications()
    pollRef.current = setInterval(fetchNotifications, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchNotifications])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleOpen = () => {
    setOpen(o => !o)
    if (!open) fetchNotifications()
  }

  const handleMarkRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`)
      setItems(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { /* non-critical */ }
  }

  const handleMarkAllRead = async () => {
    setLoading(true)
    try {
      await api.patch('/notifications/read-all')
      setItems(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { /* non-critical */ }
    setLoading(false)
  }

  const handleClick = (notif: NotifItem) => {
    if (!notif.is_read) handleMarkRead(notif.id)
    if (notif.document_id) {
      navigate(buildWorkspaceDocumentDetailPath(notif.document_id, { preserveSearch: location.search }))
    }
    setOpen(false)
  }

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso)
      const diff = Date.now() - d.getTime()
      const mins = Math.floor(diff / 60_000)
      if (mins < 1) return 'agora'
      if (mins < 60) return `${mins}min`
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return `${hrs}h`
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        title="Notificações"
        aria-label="Notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border shadow-lg overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold text-gray-800">Notificações</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={loading}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:underline disabled:opacity-50"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar tudo
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-gray-400">
                <Bell className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">Nenhuma notificação</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {items.map(notif => (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                      !notif.is_read ? 'bg-teal-50/50' : ''
                    }`}
                  >
                    <span className="text-lg leading-none mt-0.5 flex-shrink-0">
                      {TYPE_ICONS[notif.type] || '📋'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-xs font-medium truncate ${
                          !notif.is_read ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {notif.title}
                        </p>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatTime(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                      {notif.document_id && (
                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-teal-600">
                          <FileText className="w-3 h-3" /> Ver documento
                        </span>
                      )}
                    </div>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
