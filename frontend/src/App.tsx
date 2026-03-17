import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import AgentDetail from './pages/AgentDetail'
import AgentCreate from './pages/AgentCreate'
import SkillStore from './pages/SkillStore'
import Channels from './pages/Channels'
import AIModels from './pages/AIModels'
import Sessions from './pages/Sessions'
import AdminUsers from './pages/AdminUsers'
import AdminSkills from './pages/AdminSkills'
import Chat from './pages/Chat'
import CronJobs from './pages/CronJobs'
import FileManager from './pages/FileManager'
import KnowledgeBase from './pages/KnowledgeBase'
import SystemSettings from './pages/SystemSettings'
import ApiAccess from './pages/ApiAccess'
import Nodes from './pages/Nodes'
import Profile from './pages/Profile'
import { isLoggedIn, getMe } from './lib/api'
import { useState, useEffect } from 'react'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'admin' | 'denied'>('loading')
  useEffect(() => {
    getMe()
      .then(u => setState(u.role === 'admin' ? 'admin' : 'denied'))
      .catch(() => setState('denied'))
  }, [])
  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-dark-text-secondary">加载中...</div>
      </div>
    )
  }
  if (state === 'denied') return <Navigate to="/skills" replace />
  return <>{children}</>
}

function HomeRedirect() {
  const [state, setState] = useState<'loading' | 'done'>('loading')
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    getMe()
      .then(u => setIsAdmin(u.role === 'admin'))
      .catch(() => {})
      .finally(() => setState('done'))
  }, [])
  if (state === 'loading') return null
  return <Navigate to={isAdmin ? '/dashboard' : '/skills'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<HomeRedirect />} />
        {/* Admin-only routes */}
        <Route path="dashboard" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
        <Route path="models" element={<RequireAdmin><AIModels /></RequireAdmin>} />
        <Route path="channels" element={<RequireAdmin><Channels /></RequireAdmin>} />
        <Route path="nodes" element={<RequireAdmin><Nodes /></RequireAdmin>} />
        <Route path="api" element={<ApiAccess />} />
        <Route path="cron" element={<CronJobs />} />
        {/* Agent management - all logged-in users */}
        <Route path="agents" element={<Agents />} />
        <Route path="agents/create" element={<AgentCreate />} />
        <Route path="agents/:id" element={<AgentDetail />} />
        <Route path="knowledge" element={<RequireAdmin><KnowledgeBase /></RequireAdmin>} />
        {/* Admin section - direct access to features */}
        <Route path="admin" element={<Navigate to="/admin/users" replace />} />
        <Route path="admin/users" element={<RequireAdmin><AdminUsers /></RequireAdmin>} />
        <Route path="admin/skills" element={<RequireAdmin><AdminSkills /></RequireAdmin>} />
        <Route path="settings" element={<RequireAdmin><SystemSettings /></RequireAdmin>} />
        {/* Regular user accessible routes */}
        <Route path="chat" element={<Chat />} />
        <Route path="skills" element={<SkillStore />} />
        <Route path="sessions" element={<RequireAdmin><Sessions /></RequireAdmin>} />
        <Route path="files" element={<FileManager />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  )
}
