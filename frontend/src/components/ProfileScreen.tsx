/**
 * ProfileScreen - 我的页面
 * 显示账号信息，支持：
 *  - 编辑显示名
 *  - 修改密码
 *  - 账号设置（关联 config.html 多账号管理）
 *  - 套餐购买（占位，引导到 config.html 或后续接入支付）
 *  - 退出登录
 */
import React, { useState, useEffect, useCallback } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon } from '@/components/Icons'
import { auth, emitAuthRequired } from '@/stores/auth'
import api from '@/stores/api'
import type { AuthUser } from '@/stores/auth'

type ModalType = 'editName' | 'changePassword' | 'upgrade' | null

const BASE_URL = import.meta.env.VITE_API_URL || (() => {
  if (window.location.hostname === 'error.93gushi.com') return 'http://error.93gushi.com:4040'
  return 'http://192.168.0.14:3001'
})()

interface Props {
  onNavigate: (screen: 'dashboard') => void
}

export default function ProfileScreen({ onNavigate }: Props) {
  const { children, activeChildId } = useApp()
  const currentUser = auth.getUser()
  const [user, setUser] = useState<AuthUser | null>(currentUser)
  const [loading, setLoading] = useState(false)

  const fetchUser = useCallback(async () => {
    try {
      const info = await api.auth.me()
      setUser(info)
      const current = auth.getUser()
      if (current && current.displayName !== info.displayName) {
        auth.setSession(auth.getToken() || '', { ...current, displayName: info.displayName })
      }
    } catch { /* 静默失败，使用 localStorage 缓存 */ }
  }, [])

  useEffect(() => { fetchUser() }, [fetchUser])

  // ─── 编辑显示名 ─────────────────────────────────────────────────────────────
  const [showNameModal, setShowNameModal] = useState<ModalType>(null)
  const [nameVal, setNameVal] = useState('')
  const handleSaveName = async () => {
    if (!nameVal.trim()) return
    setLoading(true)
    try {
      const updated = await api.auth.updateMe({ displayName: nameVal.trim() })
      setUser(updated)
      const current = auth.getUser()
      if (current) auth.setSession(auth.getToken() || '', { ...current, displayName: updated.displayName })
      setShowNameModal(null)
    } catch (e: any) {
      alert(e.message || '保存失败')
    } finally {
      setLoading(false)
    }
  }

  // ─── 修改密码 ──────────────────────────────────────────────────────────────
  const [showPwdModal, setShowPwdModal] = useState<ModalType>(null)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newPwd2, setNewPwd2] = useState('')
  const handleSavePwd = async () => {
    if (!oldPwd || !newPwd) return alert('请填写完整')
    if (newPwd.length < 6) return alert('新密码至少 6 位')
    if (newPwd !== newPwd2) return alert('两次密码不一致')
    setLoading(true)
    try {
      await api.auth.updateMe({ oldPassword: oldPwd, newPassword: newPwd })
      setShowPwdModal(null)
      setOldPwd('')
      setNewPwd('')
      setNewPwd2('')
      alert('密码修改成功，请重新登录')
      emitAuthRequired()
    } catch (e: any) {
      alert(e.message || '修改失败，请确认旧密码是否正确')
    } finally {
      setLoading(false)
    }
  }

  // ─── 退出登录 ──────────────────────────────────────────────────────────────
  const handleLogout = () => {
    if (confirm('确定退出登录？')) {
      auth.clear()
      emitAuthRequired()
    }
  }

  // ─── 打开 config.html 账号管理 ──────────────────────────────────────────────
  const openConfig = () => {
    const url = `${BASE_URL}/config.html`
    window.open(url, '_blank')
  }

  // ─── 套餐购买（占位，打开 config.html 的购买页） ────────────────────────────
  const openUpgrade = () => {
    const url = `${BASE_URL}/config.html#subscribe`
    window.open(url, '_blank')
  }

  const displayName = user?.displayName || user?.username || '家长'
  const email = user?.email || ''
  const avatar = displayName[0]?.toUpperCase() || '👤'

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('dashboard')} className="text-slate-600"><Icon.Back /></button>
          <h1 className="font-black text-slate-900 text-base">我的</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 用户卡片 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0"
            style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
          >
            {avatar}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-extrabold text-slate-900 text-base truncate">{displayName}</div>
            <div className="text-xs text-slate-400 mt-0.5 truncate">{email || '未绑定邮箱'}</div>
            <div className="flex items-center gap-1 mt-1.5">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#10B981' }}>已登录</span>
              <span className="text-[10px] text-slate-400 font-bold">{children.length} 个孩子 · {children.reduce((s, c) => s + c.errorCount, 0)} 道错题</span>
            </div>
          </div>
        </div>

        {/* 功能列表 */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* 账号设置 */}
          <MenuButton
            icon={<><Icon.Settings /><Icon.ChevronRight /></>}
            label="账号设置"
            desc="修改密码、切换账号"
            onClick={() => setShowNameModal('editName')}
          />
          <Divider />
          {/* 修改密码 */}
          <MenuButton
            icon={<><span className="text-base">🔒</span><Icon.ChevronRight /></>}
            label="修改密码"
            desc="保护账号安全"
            onClick={() => setShowNameModal('changePassword')}
          />
          <Divider />
          {/* 套餐购买 */}
          <MenuButton
            icon={<><Icon.CreditCard /><Icon.ChevronRight /></>}
            label="会员套餐"
            desc="解锁更多 AI 功能"
            onClick={() => openUpgrade()}
          />
          <Divider />
          {/* 账号管理 */}
          <MenuButton
            icon={<><span className="text-base">⚙️</span><Icon.ChevronRight /></>}
            label="账号管理"
            desc="多账号切换、OCR配置"
            onClick={() => openConfig()}
          />
        </div>

        {/* 退出登录 */}
        <button
          onClick={handleLogout}
          className="w-full py-3.5 rounded-2xl text-sm font-bold text-red-500 bg-white shadow-sm active:scale-[0.98] transition-transform"
        >
          退出登录
        </button>

        <p className="text-center text-[11px] text-slate-300 pb-4">错题本 v1.0 · Sapiens AI</p>
      </div>

      {/* ─── 编辑显示名弹窗 ──────────────────────────────────────────────────── */}
      {showNameModal === 'editName' && (
        <Modal onClose={() => setShowNameModal(null)} title="修改显示名">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">显示名</label>
              <input
                type="text"
                value={nameVal}
                onChange={(e) => setNameVal(e.target.value)}
                placeholder="例如：小明妈妈"
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <button
              onClick={handleSaveName}
              disabled={loading || !nameVal.trim()}
              className="w-full py-3 rounded-xl text-white font-bold bg-blue-500 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {loading ? '保存中…' : '保存'}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── 修改密码弹窗 ──────────────────────────────────────────────────── */}
      {showNameModal === 'changePassword' && (
        <Modal onClose={() => setShowNameModal(null)} title="修改密码">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">旧密码</label>
              <input
                type="password"
                value={oldPwd}
                onChange={(e) => setOldPwd(e.target.value)}
                placeholder="输入当前密码"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">新密码</label>
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="至少 6 位"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">确认新密码</label>
              <input
                type="password"
                value={newPwd2}
                onChange={(e) => setNewPwd2(e.target.value)}
                placeholder="再次输入新密码"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <button
              onClick={handleSavePwd}
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-bold bg-red-500 disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {loading ? '提交中…' : '确认修改'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── 辅助组件 ──────────────────────────────────────────────────────────────────
function MenuButton({ icon, label, desc, onClick }: {
  icon: React.ReactNode; label: string; desc: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 transition-colors"
    >
      <span className="text-slate-700 flex items-center gap-2">{icon}</span>
      <div className="flex-1 text-left">
        <div className="text-sm font-bold text-slate-800">{label}</div>
        <div className="text-[11px] text-slate-400 font-600">{desc}</div>
      </div>
    </button>
  )
}

function Divider() {
  return <div className="mx-4 h-px bg-slate-100" />
}

function Modal({ children, onClose, title }: {
  children: React.ReactNode; onClose: () => void; title: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full bg-white rounded-t-3xl p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-2" />
        <div className="flex items-center justify-between">
          <h3 className="font-black text-slate-900 text-base">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
