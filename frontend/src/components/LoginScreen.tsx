/**
 * LoginScreen - 登录页
 * 输入账号（用户名或邮箱）+ 密码
 * 登录成功跳转首页
 */
import React, { useState } from 'react'
import api from '../stores/api'
import { auth } from '../stores/auth'

interface Props {
  onSuccess: () => void
  onGotoRegister: () => void
}

export default function LoginScreen({ onSuccess, onGotoRegister }: Props) {
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!account || !password) {
      setError('请输入账号和密码')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { token, user } = await api.auth.login({ account, password })
      auth.setSession(token, user)
      onSuccess()
    } catch (err: any) {
      setError(err.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-8" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #EFF6FF 0%, #F3E8FF 100%)' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-500 items-center justify-center text-4xl shadow-lg">
            📚
          </div>
          <h1 className="text-3xl font-extrabold mt-4 text-slate-800">错题本</h1>
          <p className="text-sm text-slate-500 mt-1">拍照识题 · AI讲解 · 手写批注</p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleLogin} className="bg-white rounded-3xl shadow-xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">账号</label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="用户名或邮箱"
              autoComplete="username"
              disabled={loading}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete="current-password"
              disabled={loading}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl text-white font-bold bg-gradient-to-r from-blue-500 to-purple-500 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {loading ? '登录中…' : '登录'}
          </button>

          <div className="text-center text-xs text-slate-500 pt-2">
            还没有账号？
            <button
              type="button"
              onClick={onGotoRegister}
              className="ml-1 text-blue-500 font-bold"
            >
              立即注册
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}