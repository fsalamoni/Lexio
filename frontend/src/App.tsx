import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { TaskManagerProvider } from './contexts/TaskManagerContext'
import { ToastProvider } from './components/Toast'
import TaskBar from './components/TaskBar'
import Layout from './components/Layout'

const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const DocumentList = lazy(() => import('./pages/DocumentList'))
const NewDocument = lazy(() => import('./pages/NewDocument'))
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'))
const DocumentEditor = lazy(() => import('./pages/DocumentEditor'))
const Upload = lazy(() => import('./pages/Upload'))
const SettingsPanel = lazy(() => import('./pages/AdminPanel'))
const PersonalCostTokensPage = lazy(() => import('./pages/CostTokensPage'))
const PlatformAdminPanel = lazy(() => import('./pages/PlatformAdminPanel'))
const PlatformCostsPage = lazy(() => import('./pages/PlatformCostsPage'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const ThesisBank = lazy(() => import('./pages/ThesisBank'))
const ResearchNotebook = lazy(() => import('./pages/ResearchNotebook'))
const Profile = lazy(() => import('./pages/Profile'))
const NotFound = lazy(() => import('./pages/NotFound'))

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="text-sm text-gray-500">Carregando...</div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role } = useAuth()
  if (role !== 'admin') return <Navigate to="/settings" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
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
                  <Route path="/notebook" element={<ResearchNotebook />} />
                  <Route path="/settings" element={<SettingsPanel />} />
                  <Route path="/settings/costs" element={<PersonalCostTokensPage />} />
                  <Route path="/admin" element={<AdminRoute><PlatformAdminPanel /></AdminRoute>} />
                  <Route path="/admin/costs" element={<AdminRoute><PlatformCostsPage /></AdminRoute>} />
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  )
}

// VITE_BASE_PATH controls the router base (no trailing slash).
const BASENAME =
  (import.meta.env.VITE_BASE_PATH as string | undefined)?.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <AuthProvider>
        <ToastProvider>
          <TaskManagerProvider>
            <AppRoutes />
            <TaskBar />
          </TaskManagerProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
