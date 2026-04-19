import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { TaskManagerProvider } from './contexts/TaskManagerContext'
import { ToastProvider } from './components/Toast'
import TaskBar from './components/TaskBar'
import Layout from './components/Layout'
import { isRedesignV2Enabled } from './lib/feature-flags'
import { buildResearchNotebookWorkbenchPath, parseResearchNotebookV2Section } from './lib/research-notebook-routes'
import { shouldUseRedesignWorkspaceShell } from './lib/redesign-shell'
import {
  buildWorkspaceDashboardPath,
  buildWorkspaceProfilePath,
  buildWorkspaceSettingsPath,
} from './lib/workspace-routes'

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
const ProfileV2 = lazy(() => import('./pages/labs/ProfileV2'))
const DashboardV2 = lazy(() => import('./pages/labs/DashboardV2'))
const ResearchNotebookV2 = lazy(() => import('./pages/labs/ResearchNotebookV2'))
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

function buildNotebookAliasTarget(search: string) {
  const params = new URLSearchParams(search)
  return buildResearchNotebookWorkbenchPath({
    notebookId: params.get('open'),
    section: parseResearchNotebookV2Section(params.get('section')),
    preserveSearch: search,
  })
}

function V2LabRoute({
  children,
  fallbackResolver,
}: {
  children: React.ReactNode
  fallbackResolver?: (search: string) => string
}) {
  const location = useLocation()
  if (!isRedesignV2Enabled()) {
    return <Navigate to={(fallbackResolver?.(location.search) || buildWorkspaceProfilePath({ preserveSearch: location.search }))} replace />
  }
  return <>{children}</>
}

function ResearchNotebookV2AliasRoute() {
  const location = useLocation()
  return <Navigate to={buildNotebookAliasTarget(location.search)} replace />
}

function ProfileRoute() {
  return isRedesignV2Enabled() ? <ProfileV2 /> : <Profile />
}

function ProfileV2AliasRoute() {
  const location = useLocation()
  return <Navigate to={buildWorkspaceProfilePath({ preserveSearch: location.search })} replace />
}

function DashboardRoute() {
  return isRedesignV2Enabled() ? <DashboardV2 /> : <Dashboard />
}

function DashboardV2AliasRoute() {
  const location = useLocation()
  return <Navigate to={buildWorkspaceDashboardPath({ preserveSearch: location.search })} replace />
}

function AuthenticatedShell() {
  const location = useLocation()
  const redesignV2Enabled = isRedesignV2Enabled()
  const useV2Shell = shouldUseRedesignWorkspaceShell(location.pathname, redesignV2Enabled)
  const Shell = useV2Shell ? V2WorkspaceLayout : Layout

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<DashboardRoute />} />
        <Route path="/documents" element={<DocumentList />} />
        <Route path="/documents/new" element={<NewDocument />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />
        <Route path="/documents/:id/edit" element={<DocumentEditor />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/theses" element={<ThesisBank />} />
        <Route path="/notebook" element={redesignV2Enabled ? <ResearchNotebookV2 /> : <ResearchNotebook />} />
        <Route path="/notebook/classic" element={<ResearchNotebook />} />
        <Route path="/settings" element={<SettingsPanel />} />
        <Route path="/settings/costs" element={<PersonalCostTokensPage />} />
        <Route path="/admin" element={<AdminRoute><PlatformAdminPanel /></AdminRoute>} />
        <Route path="/admin/costs" element={<AdminRoute><PlatformCostsPage /></AdminRoute>} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/profile" element={<ProfileRoute />} />
        <Route path="/profile/classic" element={<Profile />} />
        <Route path="/labs/dashboard-v2" element={<V2LabRoute fallbackResolver={(search) => buildWorkspaceDashboardPath({ preserveSearch: search })}><DashboardV2AliasRoute /></V2LabRoute>} />
        <Route path="/labs/notebook-v2" element={<V2LabRoute fallbackResolver={buildNotebookAliasTarget}><ResearchNotebookV2AliasRoute /></V2LabRoute>} />
        <Route path="/labs/profile-v2" element={<V2LabRoute fallbackResolver={(search) => buildWorkspaceProfilePath({ preserveSearch: search })}><ProfileV2AliasRoute /></V2LabRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Shell>
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
