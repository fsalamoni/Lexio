import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import DocumentList from './pages/DocumentList'
import NewDocument from './pages/NewDocument'
import DocumentDetail from './pages/DocumentDetail'
import DocumentEditor from './pages/DocumentEditor'
import Upload from './pages/Upload'
import AdminPanel from './pages/AdminPanel'
import Onboarding from './pages/Onboarding'
import ThesisBank from './pages/ThesisBank'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, role } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (role !== "admin") return <Navigate to="/" replace />
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
                <Route path="/documents/:id/edit" element={<DocumentEditor />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/theses" element={<ThesisBank />} />
                <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
                <Route path="/onboarding" element={<Onboarding />} />
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
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
