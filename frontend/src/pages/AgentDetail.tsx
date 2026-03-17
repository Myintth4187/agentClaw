import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bot,
  FileText,
  Loader2,
  Eye,
  EyeOff,
  Wrench,
  Edit2,
  Save,
  X,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { fetchAgentDetail, fetchAgents } from '../store/agents'
import { getAgentFile, setAgentFile, listSkillsForAgent, toggleAgentSkill, getMe, listMyAgents, type Skill } from '../lib/api'
import type { BackendAgent, AgentFile } from '../types/agent'

interface AgentDetailData {
  agentId: string
  workspace: string
  files: AgentFile[]
}

// Editable file extensions
const EDITABLE_EXTENSIONS = ['.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.sh', '.py', '.js', '.ts']
function isEditable(fileName: string): boolean {
  return EDITABLE_EXTENSIONS.some(ext => fileName.toLowerCase().endsWith(ext))
}

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [agentInfo, setAgentInfo] = useState<BackendAgent | null>(null)
  const [detail, setDetail] = useState<AgentDetailData | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Record<string, string | null>>({})
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({})

  // Edit state per file
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editContent, setEditContent] = useState<string>('')
  const [savingFile, setSavingFile] = useState<string | null>(null)

  // Skills state
  const [skills, setSkills] = useState<Skill[]>([])
  const [loadingSkills, setLoadingSkills] = useState(true)
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    const load = async () => {
      // Load agent name/info: try platform API first (works for all users), fall back to bridge
      try {
        const me = await getMe().catch(() => null)
        if (me?.role === 'admin') {
          const agents = await fetchAgents()
          const found = agents.find((a: BackendAgent) => a.id === id)
          setAgentInfo(found || null)
        } else {
          const result = await listMyAgents()
          const found = result.agents.find(a => a.openclaw_agent_id === id)
          if (found) {
            setAgentInfo({ id: found.openclaw_agent_id, name: found.name } as BackendAgent)
          }
        }
      } catch { /* ignore */ }

      // Load workspace files
      try {
        const d = await fetchAgentDetail(id)
        setDetail(d as AgentDetailData)
      } catch { /* ignore */ }

      // Load skills
      try {
        const skillList = await listSkillsForAgent(id)
        setSkills(skillList)
      } catch { /* ignore */ } finally {
        setLoadingSkills(false)
      }

      setLoading(false)
    }

    load()
  }, [id])

  const toggleFile = async (fileName: string) => {
    if (fileName in expandedFiles) {
      setExpandedFiles(prev => {
        const next = { ...prev }
        delete next[fileName]
        return next
      })
      // Also exit edit mode if leaving
      if (editingFile === fileName) setEditingFile(null)
      return
    }

    if (!id) return
    setLoadingFiles(prev => ({ ...prev, [fileName]: true }))
    try {
      const result = await getAgentFile(id, fileName)
      setExpandedFiles(prev => ({ ...prev, [fileName]: result?.content ?? '' }))
    } catch {
      setExpandedFiles(prev => ({ ...prev, [fileName]: '(无法加载文件内容)' }))
    } finally {
      setLoadingFiles(prev => ({ ...prev, [fileName]: false }))
    }
  }

  const startEdit = (fileName: string) => {
    setEditContent(expandedFiles[fileName] ?? '')
    setEditingFile(fileName)
  }

  const cancelEdit = () => {
    setEditingFile(null)
    setEditContent('')
  }

  const saveEdit = async (fileName: string) => {
    if (!id) return
    setSavingFile(fileName)
    try {
      await setAgentFile(id, fileName, editContent)
      setExpandedFiles(prev => ({ ...prev, [fileName]: editContent }))
      setEditingFile(null)
      setEditContent('')
    } catch (err: any) {
      alert(`保存失败: ${err?.message || '未知错误'}`)
    } finally {
      setSavingFile(null)
    }
  }

  const handleToggleSkill = async (skill: Skill) => {
    if (!id || togglingSkill) return
    const newEnabled = skill.disabled !== true
    setTogglingSkill(skill.name)
    try {
      await toggleAgentSkill(id, skill.name, newEnabled)
      setSkills(prev =>
        prev.map(s =>
          s.name === skill.name ? { ...s, disabled: !newEnabled } : s
        )
      )
    } catch (err) {
      console.error('Failed to toggle skill:', err)
      const refreshed = await listSkillsForAgent(id)
      setSkills(refreshed)
    } finally {
      setTogglingSkill(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-text-secondary" size={32} /></div>

  if (!agentInfo && !detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Bot size={48} className="mb-4 text-text-secondary" />
        <p className="text-text-secondary">未找到该 Agent</p>
        <button
          onClick={() => navigate('/agents')}
          className="mt-4 text-sm text-accent-blue hover:underline"
        >
          返回列表
        </button>
      </div>
    )
  }

  const agentName = agentInfo?.name || id || ''
  const emoji = agentInfo?.identity?.emoji

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="mx-auto max-w-4xl">
      <button
        onClick={() => navigate('/agents')}
        className="mb-6 flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        返回 Agent 列表
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between rounded-xl border border-border-default bg-bg-surface p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-bg-base">
            {emoji ? (
              <span className="text-2xl">{emoji}</span>
            ) : (
              <Bot size={28} className="text-accent-blue" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{agentName}</h1>
            <p className="text-sm text-text-secondary">{id}</p>
          </div>
        </div>
      </div>

      {/* Workspace Info */}
      {detail?.workspace && (
        <div className="mb-6 rounded-xl border border-border-default bg-bg-surface p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText size={16} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">工作区路径</span>
          </div>
          <code className="text-sm text-text-secondary">{detail.workspace}</code>
        </div>
      )}

      {/* Files */}
      {detail?.files && detail.files.length > 0 && (
        <div className="mb-6 rounded-xl border border-border-default bg-bg-surface p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">配置文件</span>
          </div>
          <div className="space-y-2">
            {detail.files.map(file => {
              const isExpanded = file.name in expandedFiles
              const isLoading = loadingFiles[file.name]
              const isCurrentlyEditing = editingFile === file.name
              const isSaving = savingFile === file.name
              const canEdit = isEditable(file.name) && !file.missing
              return (
                <div key={file.name}>
                  <div className="flex items-center justify-between rounded-lg bg-bg-base px-4 py-2">
                    <span className={`text-sm ${file.missing ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                      {file.name}
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-text-secondary">
                        {file.missing ? '缺失' : formatSize(file.size)}
                      </span>
                      {!file.missing && (
                        <>
                          {isExpanded && canEdit && !isCurrentlyEditing && (
                            <button
                              onClick={() => startEdit(file.name)}
                              className="flex items-center gap-1 text-xs text-accent-blue/70 hover:text-accent-blue transition-colors"
                            >
                              <Edit2 size={12} />
                              编辑
                            </button>
                          )}
                          <button
                            onClick={() => toggleFile(file.name)}
                            disabled={isLoading}
                            className="flex items-center gap-1 text-xs text-accent-blue/70 hover:text-accent-blue disabled:opacity-50 transition-colors"
                          >
                            {isLoading ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : isExpanded ? (
                              <>
                                <EyeOff size={13} />
                                收起
                              </>
                            ) : (
                              <>
                                <Eye size={13} />
                                查看
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isExpanded && expandedFiles[file.name] !== null && (
                    <div className="mt-1 mb-1 mx-1">
                      {isCurrentlyEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={e => setEditContent(e.target.value)}
                            rows={Math.max(8, (editContent.match(/\n/g)?.length ?? 0) + 2)}
                            className="w-full rounded-lg bg-bg-base/60 border border-accent-blue/40 p-4 text-sm text-text-primary font-mono resize-y outline-none focus:border-accent-blue"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEdit(file.name)}
                              disabled={isSaving}
                              className="flex items-center gap-1 rounded bg-accent-green/20 px-3 py-1.5 text-xs font-medium text-accent-green hover:bg-accent-green/30 disabled:opacity-50"
                            >
                              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                              保存
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="flex items-center gap-1 rounded bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
                            >
                              <X size={12} />
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <pre className="whitespace-pre-wrap rounded-lg bg-bg-base/60 border border-border-default p-4 text-sm text-text-primary leading-relaxed font-mono max-h-96 overflow-y-auto">
                          {expandedFiles[file.name]}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Skills */}
      <div className="rounded-xl border border-border-default bg-bg-surface p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wrench size={16} className="text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">技能管理</span>
          {loadingSkills && <Loader2 size={14} className="animate-spin text-text-secondary" />}
        </div>
        {skills.length === 0 ? (
          <p className="text-sm text-text-secondary">暂无可用技能</p>
        ) : (
          <div className="space-y-2">
            {skills.map(skill => (
              <div
                key={skill.name}
                className="flex items-center justify-between rounded-lg bg-bg-base px-4 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-text-primary">{skill.name}</div>
                  {skill.description && (
                    <div className="text-xs text-text-secondary truncate">{skill.description}</div>
                  )}
                </div>
                <button
                  onClick={() => handleToggleSkill(skill)}
                  disabled={!!togglingSkill}
                  className="flex items-center gap-1.5 disabled:opacity-50 transition-opacity"
                  title={skill.disabled ? '点击启用' : '点击禁用'}
                >
                  {togglingSkill === skill.name ? (
                    <Loader2 size={20} className="animate-spin text-text-secondary" />
                  ) : skill.disabled ? (
                    <ToggleLeft size={24} className="text-text-secondary" />
                  ) : (
                    <ToggleRight size={24} className="text-accent-green" />
                  )}
                  <span className={`text-xs ${skill.disabled ? 'text-text-secondary' : 'text-accent-green'}`}>
                    {skill.disabled ? '已禁用' : '已启用'}
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
