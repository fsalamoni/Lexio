import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { TaskManagerProvider } from './contexts/TaskManagerContext'
import { ToastProvider } from './components/Toast'
import TaskBar from './components/TaskBar'
import { useApplyPlatformSkin } from './components/ThemeSkinSelector'
import {
  buildWorkspaceSettingsPath,
} from './lib/workspace-routes'

const Login = lazy(() => import('./pages/auth/Login'))
const Register = lazy(() => import('./pages/auth/Register'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'))
const DashboardV2 = lazy(() => import('./pages/labs/DashboardV2'))
const DocumentList = lazy(() => import('./pages/DocumentList'))
const NewDocument = lazy(() => import('./pages/NewDocument'))
const NewDocumentV3 = lazy(() => import('./pages/NewDocumentV3'))
const DocumentDetail = lazy(() => import('./pages/DocumentDetail'))
const DocumentEditor = lazy(() => import('./pages/DocumentEditor'))
const Upload = lazy(() => import('./pages/Upload'))
const SettingsPanel = lazy(() => import('./pages/AdminPanel'))
const PersonalCostTokensPage = lazy(() => import('./pages/CostTokensPage'))
const PlatformAdminPanel = lazy(() => import('./pages/PlatformAdminPanel'))
const PlatformCostsPage = lazy(() => import('./pages/PlatformCostsPage'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const ThesisBank = lazy(() => import('./pages/ThesisBank'))
const ResearchNotebookV2 = lazy(() => import('./pages/labs/ResearchNotebookV2'))
const Chat = lazy(() => import('./pages/Chat'))
const ProfileV2 = lazy(() => import('./pages/labs/ProfileV2'))
const NotFound = lazy(() => import('./pages/NotFound'))
const V2WorkspaceLayout = lazy(() => import('./components/v2/V2WorkspaceLayout'))

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="text-sm text-gray-500">Carregando...</div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, isReady } = useAuth()
  if (!isReady) return <RouteFallback />
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { role, isReady } = useAuth()
  const location = useLocation()
  if (!isReady) return <RouteFallback />
  if (role !== 'admin') {
    return <Navigate to={buildWorkspaceSettingsPath({ preserveSearch: location.search })} replace />
  }
  return <>{children}</>
}

function AuthenticatedShell() {
  useApplyPlatformSkin()

  return (
    <V2WorkspaceLayout>
      <Routes>
        <Route path="/" element={<DashboardV2 />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/documents" element={<DocumentList />} />
        <Route path="/documents/new" element={<NewDocument />} />
        <Route path="/documents/new-v3" element={<NewDocumentV3 />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />
        <Route path="/documents/:id/edit" element={<DocumentEditor />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/theses" element={<ThesisBank />} />
        <Route path="/notebook" element={<ResearchNotebookV2 />} />
        <Route path="/settings" element={<SettingsPanel />} />
        <Route path="/settings/costs" element={<PersonalCostTokensPage />} />
        <Route path="/admin" element={<AdminRoute><PlatformAdminPanel /></AdminRoute>} />
        <Route path="/admin/costs" element={<AdminRoute><PlatformCostsPage /></AdminRoute>} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/profile" element={<ProfileV2 />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </V2WorkspaceLayout>
  )
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
              <AuthenticatedShell />
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
