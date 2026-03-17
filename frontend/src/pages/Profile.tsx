import { useState, useEffect } from 'react'
import { User, Lock, Loader2, CheckCircle } from 'lucide-react'
import { getMe, changepassword } from '../lib/api'
import type { AuthUser } from '../lib/api'

export default function Profile() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Change password state
  const [currentpassword, setCurrentpassword] = useState('')
  const [newpassword, setNewpassword] = useState('')
  const [confirmpassword, setConfirmpassword] = useState('')
  const [changingpassword, setChangingpassword] = useState(false)
  const [passwordError, setpasswordError] = useState('')
  const [passwordSuccess, setpasswordSuccess] = useState(false)

  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleChangepassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setpasswordError('')
    setpasswordSuccess(false)

    if (newpassword !== confirmpassword) {
      setpasswordError('两次输入的新密码不一致')
      return
    }

    if (newpassword.length < 6) {
      setpasswordError('密码至少需要 6 个字符')
      return
    }

    setChangingpassword(true)
    try {
      await changepassword(currentpassword, newpassword)
      setpasswordSuccess(true)
      setCurrentpassword('')
      setNewpassword('')
      setConfirmpassword('')
    } catch (err: unknown) {
      setpasswordError(err instanceof Error ? err.message : '密码修改失败')
    } finally {
      setChangingpassword(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-dark-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-text-primary">个人资料</h1>

      {/* User Info Card */}
      <div className="rounded-xl border border-border-default bg-bg-surface p-6">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-medium text-white ${
            user?.role === 'admin' ? 'bg-accent-green' : 'bg-accent-purple'
          }`}>
            <User className="h-7 w-7" />
          </div>
          <div>
            <div className="text-lg font-medium text-text-primary">
              {user?.username}
              {user?.role === 'admin' && (
                <span className="ml-2 rounded bg-accent-green/20 px-2 py-0.5 text-xs text-accent-green">
                  管理员
                </span>
              )}
            </div>
            <div className="text-sm text-dark-muted">{user?.email}</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border-default pt-6">
          <div>
            <div className="text-xs text-dark-muted">用户 ID</div>
            <div className="mt-1 font-mono text-sm text-text-secondary">{user?.id}</div>
          </div>
          <div>
            <div className="text-xs text-dark-muted">账户类型</div>
            <div className="mt-1 text-sm text-text-secondary capitalize">{user?.quota_tier}</div>
          </div>
          <div>
            <div className="text-xs text-dark-muted">状态</div>
            <div className="mt-1 text-sm text-text-secondary">
              {user?.is_active ? (
                <span className="text-accent-green">活跃</span>
              ) : (
                <span className="text-accent-red">已禁用</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-dark-muted">创建时间</div>
            <div className="mt-1 text-sm text-text-secondary">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '无'}
            </div>
          </div>
        </div>
      </div>

      {/* Change password Card */}
      <div className="rounded-xl border border-border-default bg-bg-surface p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lock className="h-5 w-5 text-dark-muted" />
          <h2 className="text-lg font-medium text-text-primary">修改密码</h2>
        </div>

        {passwordSuccess && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent-green/10 p-3 text-sm text-accent-green">
            <CheckCircle className="h-4 w-4" />
            密码修改成功
          </div>
        )}

        {passwordError && (
          <div className="mb-4 rounded-lg bg-accent-red/10 p-3 text-sm text-accent-red">
            {passwordError}
          </div>
        )}

        <form onSubmit={handleChangepassword} className="space-y-4">
          <div>
            <label className="block text-sm text-dark-muted mb-1.5">当前密码</label>
            <input
              type="password"
              value={currentpassword}
              onChange={(e) => setCurrentpassword(e.target.value)}
              required
              className="w-full rounded-lg border border-border-default bg-bg-base px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue"
            />
          </div>

          <div>
            <label className="block text-sm text-dark-muted mb-1.5">新密码</label>
            <input
              type="password"
              value={newpassword}
              onChange={(e) => setNewpassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-border-default bg-bg-base px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue"
            />
          </div>

          <div>
            <label className="block text-sm text-dark-muted mb-1.5">确认新密码</label>
            <input
              type="password"
              value={confirmpassword}
              onChange={(e) => setConfirmpassword(e.target.value)}
              required
              className="w-full rounded-lg border border-border-default bg-bg-base px-4 py-2.5 text-sm text-text-primary outline-none focus:border-accent-blue"
            />
          </div>

          <button
            type="submit"
            disabled={changingpassword}
            className="rounded-lg bg-accent-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-blue/90 disabled:opacity-50"
          >
            {changingpassword ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              '修改密码'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
