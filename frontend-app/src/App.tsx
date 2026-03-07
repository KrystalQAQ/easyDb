import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import LoginPage from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import BootstrapSetupPage from './pages/BootstrapSetupPage'
import ConsoleLayout from './pages/ConsoleLayout'
import ProjectCenterPage from './pages/ProjectCenterPage'
import SqlWorkbenchPage from './pages/SqlWorkbenchPage'
import UserCenterPage from './pages/UserCenterPage'
import AuditCenterPage from './pages/AuditCenterPage'
import ApiCenterPage from './pages/ApiCenterPage'
import { useConsole } from './context/ConsoleContext'
import { buildApiUrl } from './lib/http'

function BootstrapGate() {
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(true)

  useEffect(() => {
    let alive = true
    const loadStatus = async () => {
      try {
        const response = await fetch(buildApiUrl('/api/system/bootstrap/status'))
        const payload = await response.json().catch(() => ({}))
        const ok = response.ok && payload.ok !== false
        const statusInitialized = Boolean(payload?.status?.initialized)
        if (!alive) return
        setInitialized(ok ? statusInitialized : false)
      } catch {
        if (!alive) return
        setInitialized(false)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void loadStatus()
    return () => {
      alive = false
    }
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!initialized && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />
  }
  if (initialized && location.pathname === '/setup') {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function RequireAuth() {
  const { token } = useConsole()
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <Outlet />
}

function App() {
  return (
    <Routes>
      <Route element={<BootstrapGate />}>
        <Route path="/setup" element={<BootstrapSetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/app" element={<ConsoleLayout />}>
            <Route index element={<Navigate to="projects" replace />} />
            <Route path="projects" element={<ProjectCenterPage />} />
            <Route path="sql" element={<SqlWorkbenchPage />} />
            <Route path="users" element={<UserCenterPage />} />
            <Route path="audit" element={<AuditCenterPage />} />
            <Route path="apis" element={<ApiCenterPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/app/projects" replace />} />
    </Routes>
  )
}

export default App
