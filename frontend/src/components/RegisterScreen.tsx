/**
 * RegisterScreen - 注册页
 * 输入用户名 + 邮箱 + 密码
 * 注册成功自动登录跳转首页
 */
import React, { useState } from 'react'
import api from '../stores/api'
import { auth } from '../stores/auth'

interface Props {
  onSuccess: () => void
  onGotoLogin: () => void
}

export default function RegisterScreen({ onSuccess, onGotoLogin }: Props) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !email || !password) {
      setError('请完整填写所有字段')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    if (password !== password2) {
      setError('两次密码不一致')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { token, user } = await api.auth.register({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      auth.setSession(token, user)
      onSuccess()
    } catch (err: any) {
      setError(err.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center px-6 py-8" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #EFF6FF 0%, #F3E8FF 100%)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-slate-800">创建账号</h1>
          <p className="text-sm text-slate-500 mt-1">几秒钟即可开始使用</p>
        </div>

        <form onSubmit={handleRegister} className="bg-white rounded-3xl shadow-xl p-6 space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-32 个字符"
              maxLength={32}
              autoComplete="username"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="用于登录和找回"
              autoComplete="email"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              autoComplete="new-password"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">确认密码</label>
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              placeholder="再输入一次"
              autoComplete="new-password"
              disabled={loading}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
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
            {loading ? '注册中…' : '注册并登录'}
          </button>

          <div className="text-center text-xs text-slate-500 pt-1">
            已有账号？
            <button
              type="button"
              onClick={onGotoLogin}
              className="ml-1 text-blue-500 font-bold"
            >
              直接登录
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}