import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Bot, Loader2, Package } from 'lucide-react'
import { createMyAgent, listCuratedSkills, type CuratedSkill } from '../lib/api'
import { installCuratedSkill } from '../lib/api'

// Generate a preview slug from the display name
function toSlugPreview(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 30)
  return slug || ''
}

export default function AgentCreate() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [curatedSkills, setCuratedSkills] = useState<CuratedSkill[]>([])
  const [curatedLoading, setCuratedLoading] = useState(true)
  const [form, setForm] = useState({
    displayName: '',
    description: '',
    installedSkills: [] as string[], // curated skill IDs to install after creation
  })

  // Fetch curated skills on mount
  useEffect(() => {
    listCuratedSkills()
      .then(curated => setCuratedSkills(curated.filter(s => !s.installed)))
      .catch(() => {})
      .finally(() => setCuratedLoading(false))
  }, [])

  const slugPreview = toSlugPreview(form.displayName)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.displayName.trim()) return

    setLoading(true)
    setError('')

    try {
      const agent = await createMyAgent(form.displayName.trim(), form.description.trim() || undefined)
      // Install selected curated skills
      for (const skillId of form.installedSkills) {
        try {
          await installCuratedSkill(skillId)
        } catch {
          // ignore individual skill install failures
        }
      }
      navigate(`/agents/${agent.openclaw_agent_id}`)
    } catch (err: any) {
      setError(err?.message || '创建失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button
        onClick={() => navigate('/agents')}
        className="mb-6 flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} />
        返回 Agent 列表
      </button>

      <div className="rounded-xl border border-border-default bg-bg-surface p-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-blue">
            <Bot size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary">新建 Agent</h1>
            <p className="text-sm text-text-secondary">配置并创建新的 AI Agent</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Display Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">Agent 名称 *</label>
            <input
              type="text"
              required
              value={form.displayName}
              onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              placeholder="例如：保险智能体、Customer Support"
              className="w-full rounded-lg border border-border-default bg-bg-base px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue placeholder:text-text-secondary"
            />
            {slugPreview && (
              <p className="mt-1 text-xs text-text-tertiary">
                ID 预览：<code className="font-mono">{slugPreview}-xxxx</code>（系统自动生成）
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">描述（可选）</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="简短描述这个 Agent 的用途"
              className="w-full rounded-lg border border-border-default bg-bg-base px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue placeholder:text-text-secondary"
            />
          </div>

          {/* Install Curated Skills */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              <div className="flex items-center gap-2">
                <Package size={14} />
                安装精选技能
              </div>
            </label>
            {curatedLoading ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Loader2 size={14} className="animate-spin" />
                加载中...
              </div>
            ) : curatedSkills.length === 0 ? (
              <p className="text-sm text-text-secondary">暂无可安装的精选技能</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border-default bg-bg-base p-3 space-y-2">
                {curatedSkills.map(skill => (
                  <label
                    key={skill.id}
                    className="flex items-start gap-3 p-2 rounded hover:bg-bg-surface cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={form.installedSkills.includes(skill.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setForm(f => ({
                            ...f,
                            installedSkills: [...f.installedSkills, skill.id]
                          }))
                        } else {
                          setForm(f => ({
                            ...f,
                            installedSkills: f.installedSkills.filter(s => s !== skill.id)
                          }))
                        }
                      }}
                      className="mt-1 w-4 h-4 rounded border-border-default text-accent-blue focus:ring-accent-blue bg-bg-base"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text-primary">
                        {skill.name}
                        {skill.is_featured && (
                          <span className="ml-2 text-xs bg-accent-yellow/20 text-accent-yellow px-1.5 py-0.5 rounded">精选</span>
                        )}
                      </div>
                      {skill.description && (
                        <div className="text-xs text-text-secondary truncate">{skill.description}</div>
                      )}
                      <div className="text-xs text-text-secondary mt-0.5">
                        {skill.category} · {skill.install_count} 次安装
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-text-secondary">
              选择要预装到此 Agent 的精选技能，安装后可单独启用/禁用
            </p>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !form.displayName.trim()}
              className="flex items-center gap-2 rounded-lg bg-accent-blue px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              创建 Agent
            </button>
            <button
              type="button"
              onClick={() => navigate('/agents')}
              className="rounded-lg border border-border-default px-6 py-2.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
