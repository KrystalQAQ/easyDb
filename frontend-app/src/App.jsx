import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import ConsoleLayout from './pages/ConsoleLayout'
import ProjectCenterPage from './pages/ProjectCenterPage'
import SqlWorkbenchPage from './pages/SqlWorkbenchPage'
import UserCenterPage from './pages/UserCenterPage'
import AuditCenterPage from './pages/AuditCenterPage'
import { useConsole } from './context/ConsoleContext'

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
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<ConsoleLayout />}>
          <Route index element={<Navigate to="projects" replace />} />
          <Route path="projects" element={<ProjectCenterPage />} />
          <Route path="sql" element={<SqlWorkbenchPage />} />
          <Route path="users" element={<UserCenterPage />} />
          <Route path="audit" element={<AuditCenterPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/app/projects" replace />} />
    </Routes>
  )
}

export default App
