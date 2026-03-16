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
import Admin from './pages/Admin'
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
  if (state === 'loading') return null
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
        <Route path="agents" element={<RequireAdmin><Agents /></RequireAdmin>} />
        <Route path="agents/create" element={<RequireAdmin><AgentCreate /></RequireAdmin>} />
        <Route path="agents/:id" element={<RequireAdmin><AgentDetail /></RequireAdmin>} />
        <Route path="models" element={<RequireAdmin><AIModels /></RequireAdmin>} />
        <Route path="channels" element={<RequireAdmin><Channels /></RequireAdmin>} />
        <Route path="nodes" element={<RequireAdmin><Nodes /></RequireAdmin>} />
        <Route path="api" element={<RequireAdmin><ApiAccess /></RequireAdmin>} />
        <Route path="cron" element={<RequireAdmin><CronJobs /></RequireAdmin>} />
        <Route path="knowledge" element={<RequireAdmin><KnowledgeBase /></RequireAdmin>} />
        <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        <Route path="admin-skills" element={<RequireAdmin><AdminSkills /></RequireAdmin>} />
        <Route path="settings" element={<RequireAdmin><SystemSettings /></RequireAdmin>} />
        {/* Regular user accessible routes */}
        <Route path="chat" element={<Chat />} />
        <Route path="skills" element={<SkillStore />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="files" element={<FileManager />} />
        <Route path="profile" element={<Profile />} />
      </Route>
    </Routes>
  )
}
