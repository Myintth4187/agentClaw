import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Plus, Search, Loader2, Shield, User, Star, MessageSquare, Settings } from 'lucide-react'
import { fetchAgents } from '../store/agents'
import { getMe, listMyAgents, deleteMyAgent, setDefaultMyAgent } from '../lib/api'
import type { BackendAgent } from '../types/agent'
import type { AuthUser, UserAgentRecord } from '../lib/api'
import ChatDrawer from '../components/ChatDrawer'

// System agents that cannot be deleted
const SYSTEM_AGENTS = ['main', 'skill-reviewer']

export default function Agents() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<BackendAgent[]>([])
  const [myAgents, setMyAgents] = useState<UserAgentRecord[]>([])
  const [maxAllowed, setMaxAllowed] = useState(5)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [settingDefault, setSettingDefault] = useState<string | null>(null)

  // ChatDrawer state
  const [chatAgent, setChatAgent] = useState<{ id: string; name: string; emoji?: string; sessionKey: string } | null>(null)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    const loadData = async () => {
      try {
        const userData = await getMe().catch(() => null)
        setUser(userData)

        if (userData?.role === 'admin') {
          // Admin: load bridge agents
          const agentsData = await fetchAgents()
          setAgents(agentsData)
        } else {
          // Regular user: load platform agents
          const result = await listMyAgents()
          setMyAgents(result.agents)
          setMaxAllowed(result.max_allowed)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // Admin: categorize bridge agents
  const systemAgents = agents.filter(a => SYSTEM_AGENTS.includes(a.id))
  const otherAgents = agents.filter(a => !SYSTEM_AGENTS.includes(a.id))

  const filterAgents = (list: BackendAgent[]) => {
    if (!search.trim()) return list
    const term = search.toLowerCase()
    return list.filter(a => {
      const name = (a as any).displayName || a.name || a.identity?.name || a.id || ''
      return name.toLowerCase().includes(term) || (a.id || '').toLowerCase().includes(term)
    })
  }

  const filterMyAgents = (list: UserAgentRecord[]) => {
    if (!search.trim()) return list
    const term = search.toLowerCase()
    return list.filter(a => a.name.toLowerCase().includes(term) || a.openclaw_agent_id.toLowerCase().includes(term))
  }

  // Admin: delete bridge agent
  const handleAdminDelete = async (e: React.MouseEvent, agent: BackendAgent) => {
    e.stopPropagation()
    if (!confirm('确定删除该 Agent？')) return
    const { removeAgent } = await import('../store/agents')
    await removeAgent(agent.id)
    const refreshed = await fetchAgents()
    setAgents(refreshed)
  }

  // User: delete own agent
  const handleUserDelete = async (e: React.MouseEvent, agent: UserAgentRecord) => {
    e.stopPropagation()
    if (!confirm('确定删除该 Agent？')) return
    try {
      await deleteMyAgent(agent.id)
      setMyAgents(prev => prev.filter(a => a.id !== agent.id))
    } catch (err: any) {
      alert(err?.message || '删除失败')
    }
  }

  // User: set default agent
  const handleSetDefault = async (e: React.MouseEvent, agent: UserAgentRecord) => {
    e.stopPropagation()
    setSettingDefault(agent.id)
    try {
      await setDefaultMyAgent(agent.id)
      setMyAgents(prev => prev.map(a => ({ ...a, is_default: a.id === agent.id })))
    } catch (err: any) {
      alert(err?.message || '设置失败')
    } finally {
      setSettingDefault(null)
    }
  }

  const atLimit = !isAdmin && myAgents.length >= maxAllowed

  // Admin agent card
  const AdminAgentCard = ({ agent, showDelete = true }: { agent: BackendAgent; showDelete?: boolean }) => (
    <div className="rounded-xl border border-border-default bg-bg-surface p-5 hover:border-accent-blue/30 transition-colors shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-base">
            {agent.identity?.emoji ? (
              <span className="text-lg">{agent.identity.emoji}</span>
            ) : (
              <Bot size={20} className="text-accent-blue" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">{(agent as any).displayName || agent.name || agent.identity?.name || agent.id}</div>
            <div className="text-xs text-text-secondary truncate">{agent.id}</div>
          </div>
        </div>
        <button
          onClick={() => navigate(`/agents/${agent.id}`)}
          className="ml-2 shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-bg-base hover:text-text-primary transition-colors"
          title="Agent 设置"
        >
          <Settings size={15} />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={() => setChatAgent({ id: agent.id, name: (agent as any).displayName || agent.name || agent.id, emoji: agent.identity?.emoji, sessionKey: `agent:${agent.id}:session-${Date.now()}` })}
          className="flex items-center gap-1 text-xs text-accent-blue/70 hover:text-accent-blue"
        >
          <MessageSquare size={12} /> 聊天
        </button>
        {showDelete && (
          <button
            onClick={e => handleAdminDelete(e, agent)}
            className="text-xs text-accent-red/70 hover:text-accent-red"
          >
            删除
          </button>
        )}
      </div>
    </div>
  )

  // User agent card
  const UserAgentCard = ({ agent }: { agent: UserAgentRecord }) => (
    <div className="rounded-xl border border-border-default bg-bg-surface p-5 hover:border-accent-blue/30 transition-colors shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-base">
            <Bot size={20} className="text-accent-blue" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-text-primary truncate">{agent.name}</span>
              {agent.is_default && (
                <span className="rounded-full bg-accent-blue/10 px-1.5 py-0.5 text-[10px] text-accent-blue font-medium shrink-0">默认</span>
              )}
            </div>
            <div className="text-xs text-text-secondary truncate">{agent.openclaw_agent_id}</div>
          </div>
        </div>
        <button
          onClick={() => navigate(`/agents/${agent.openclaw_agent_id}`)}
          className="ml-2 shrink-0 rounded-lg p-1.5 text-text-secondary hover:bg-bg-base hover:text-text-primary transition-colors"
          title="Agent 设置"
        >
          <Settings size={15} />
        </button>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          onClick={e => { e.stopPropagation(); setChatAgent({ id: agent.openclaw_agent_id, name: agent.name, sessionKey: `agent:${agent.openclaw_agent_id}:session-${Date.now()}` }) }}
          className="flex items-center gap-1 text-xs text-accent-blue/70 hover:text-accent-blue"
        >
          <MessageSquare size={12} /> 聊天
        </button>
        {!agent.is_default && (
          <button
            onClick={e => handleSetDefault(e, agent)}
            disabled={settingDefault === agent.id}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-accent-green disabled:opacity-50"
          >
            {settingDefault === agent.id ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
            设为默认
          </button>
        )}
        <button
          onClick={e => handleUserDelete(e, agent)}
          className="text-xs text-accent-red/70 hover:text-accent-red"
        >
          删除
        </button>
      </div>
    </div>
  )

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-text-secondary" size={32} /></div>

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Agent 管理</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isAdmin ? '管理和配置所有 AI Agents' : `管理您的 AI Agents（${myAgents.length}/${maxAllowed}）`}
          </p>
        </div>
        <button
          onClick={() => navigate('/agents/create')}
          disabled={atLimit}
          title={atLimit ? `已达到上限 ${maxAllowed} 个 Agent` : '新建 Agent'}
          className="flex items-center gap-2 rounded-lg bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-accent-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus size={16} />
          新建 Agent
        </button>
      </div>

      {atLimit && (
        <div className="mb-4 rounded-lg bg-accent-yellow/10 border border-accent-yellow/20 px-4 py-2.5 text-sm text-accent-yellow">
          已达到最大 Agent 数量（{maxAllowed} 个），请删除现有 Agent 后再新建。
        </div>
      )}

      {/* Search */}
      <div className="mb-6 flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-bg-surface border border-border-default px-3 py-2">
          <Search size={16} className="text-text-secondary" />
          <input
            type="text"
            placeholder="搜索 Agent 名称或 ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      </div>

      {/* Admin view: bridge agents */}
      {isAdmin ? (
        <>
          {/* System Agents */}
          {systemAgents.length > 0 && (
            <div className="mb-6">
              <div className="mb-3 flex items-center gap-2">
                <Shield size={18} className="text-accent-purple" />
                <h2 className="text-base font-semibold text-text-primary">系统 Agents</h2>
                <span className="ml-2 rounded-full bg-accent-purple/10 px-2 py-0.5 text-xs text-accent-purple">{systemAgents.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {filterAgents(systemAgents).map(agent => (
                  <AdminAgentCard key={agent.id} agent={agent} showDelete={false} />
                ))}
              </div>
            </div>
          )}

          {/* User Agents */}
          {otherAgents.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Bot size={18} className="text-accent-blue" />
                <h2 className="text-base font-semibold text-text-primary">用户 Agents</h2>
                <span className="ml-2 rounded-full bg-accent-blue/10 px-2 py-0.5 text-xs text-accent-blue">{otherAgents.length}</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {filterAgents(otherAgents).map(agent => (
                  <AdminAgentCard key={agent.id} agent={agent} showDelete={true} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* User view: platform agents */
        <div>
          <div className="mb-3 flex items-center gap-2">
            <User size={18} className="text-accent-green" />
            <h2 className="text-base font-semibold text-text-primary">我的 Agents</h2>
          </div>
          {myAgents.length === 0 ? (
            <div className="rounded-xl border border-border-default bg-bg-surface p-8 text-center text-sm text-text-secondary">
              暂无 Agent，点击"新建 Agent"创建您的第一个 Agent
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {filterMyAgents(myAgents).map(agent => (
                <UserAgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ChatDrawer */}
      {chatAgent && (
        <ChatDrawer
          agentId={chatAgent.id}
          agentName={chatAgent.name}
          agentEmoji={chatAgent.emoji}
          sessionKey={chatAgent.sessionKey}
          onClose={() => setChatAgent(null)}
        />
      )}
    </div>
  )
}
