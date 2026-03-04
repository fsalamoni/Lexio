import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DEMO_MODE } from './api/client'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import DocumentList from './pages/DocumentList'
import NewDocument from './pages/NewDocument'
import DocumentDetail from './pages/DocumentDetail'
import Upload from './pages/Upload'
import AdminPanel from './pages/AdminPanel'

function DemoBanner() {
  if (!DEMO_MODE) return null
  return (
    <div className="bg-brand-600 text-white text-center py-2 text-sm font-medium">
      Modo Demonstração — Dados simulados, sem backend real
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/documents" element={<DocumentList />} />
                <Route path="/documents/new" element={<NewDocument />} />
                <Route path="/documents/:id" element={<DocumentDetail />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/admin" element={<AdminPanel />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <DemoBanner />
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
