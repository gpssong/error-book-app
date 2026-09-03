/**
 * ChildManageScreen - 孩子管理页
 * 支持添加、编辑、删除孩子档案，切换当前激活孩子
 */
import React, { useState } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon } from '@/components/Icons'
import type { Child } from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

interface Props {
  onNavigate: (screen: Screen) => void
}

export default function ChildManageScreen({ onNavigate }: Props) {
  const { children, activeChildId, addChild, updateChild, deleteChild, setActiveChild } = useApp()
  const [showAddChild, setShowAddChild] = useState(false)
  const [newName, setNewName] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [newAvatar] = useState('🧒')

  const handleAdd = async () => {
    if (!newName.trim() || !newGrade.trim()) return
    await addChild({ name: newName.trim(), grade: newGrade.trim(), avatar: newAvatar })
    setNewName('')
    setNewGrade('')
    setShowAddChild(false)
  }

  const handleDelete = async (id: string) => {
    if (children.length <= 1) return
    if (confirm('确定删除该孩子档案？其所有错题也将一并删除。')) {
      await deleteChild(id)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="text-slate-600"><Icon.Back /></button>
            <h1 className="font-black text-slate-900 text-base">孩子管理</h1>
          </div>
          <button
            onClick={() => setShowAddChild(true)}
            className="flex items-center gap-1 text-sm font-bold text-white px-3 py-2 rounded-xl"
            style={{ background: '#2563EB' }}
          >
            <Icon.Plus /> 添加
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {children.map((child) => (
          <div key={child.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${child.color}15` }}>
                {child.avatar}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-slate-800 text-base">{child.name}</h3>
                  {child.id === activeChildId && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: '#2563EB' }}>当前</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 font-600 mt-0.5">{child.grade} · {child.errorCount}道错题 · 已掌握{child.masteredCount}道</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveChild(child.id)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center border"
                  style={child.id === activeChildId ? { background: '#EFF6FF', borderColor: '#BFDBFE', color: '#2563EB' } : { borderColor: '#E2E8F0', color: '#94A3B8' }}
                >
                  <Icon.Check />
                </button>
                <button
                  onClick={() => handleDelete(child.id)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center border border-red-100 text-red-400"
                  style={children.length <= 1 ? { opacity: 0.3 } : {}}
                >
                  <Icon.Trash />
                </button>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-slate-400 font-600 mb-1">
                <span>掌握进度</span>
                <span>{child.errorCount > 0 ? Math.round(child.masteredCount / child.errorCount * 100) : 0}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${child.errorCount > 0 ? child.masteredCount / child.errorCount * 100 : 0}%`, background: child.color }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add child modal */}
      {showAddChild && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAddChild(false)} />
          <div className="relative w-full bg-white rounded-t-3xl p-6 space-y-4" style={{ zIndex: 60 }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-2" />
            <h3 className="font-black text-slate-900 text-base">添加新孩子档案</h3>
            <div className="flex gap-3 justify-center mb-2">
              {['👦', '👧', '🧒', '👶'].map((av) => (
                <button key={av} className="w-12 h-12 rounded-2xl bg-slate-100 text-2xl flex items-center justify-center">{av}</button>
              ))}
            </div>
            <input
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-600 outline-none focus:border-blue-400"
              placeholder="孩子姓名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-600 outline-none focus:border-blue-400"
              placeholder="年级（如：初三、高一）"
              value={newGrade}
              onChange={(e) => setNewGrade(e.target.value)}
            />
            <button
              onClick={handleAdd}
              className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm"
              style={{ background: '#2563EB' }}
            >
              创建档案
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
