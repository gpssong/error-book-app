/**
 * ChildManageScreen - 孩子管理页
 * 支持添加、编辑、删除孩子档案，切换当前激活孩子
 *
 * 年级选择改用三段式下拉 (小学/初中/高中) + 具体年级，避免自由输入
 */
import React, { useState } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon } from '@/components/Icons'
import { GRADE_STAGES, GRADE_OPTIONS } from '@/utils/grades'
import type { Child } from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

interface Props {
  onNavigate: (screen: Screen) => void
}

export default function ChildManageScreen({ onNavigate }: Props) {
  const { children, activeChildId, addChild, updateChild, deleteChild, setActiveChild } = useApp()
  const [showAddChild, setShowAddChild] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newGrade, setNewGrade] = useState('小学一年级')
  const [newAvatar, setNewAvatar] = useState('🧒')

  const reset = () => {
    setNewName('')
    setNewGrade('小学一年级')
    setNewAvatar('🧒')
    setEditingId(null)
  }

  const openAdd = () => {
    reset()
    setShowAddChild(true)
  }

  const openEdit = (c: Child) => {
    setNewName(c.name)
    setNewGrade(GRADE_OPTIONS.some((g) => g.value === c.grade) ? c.grade : '小学一年级')
    setNewAvatar(c.avatar)
    setEditingId(c.id)
    setShowAddChild(true)
  }

  const handleSave = async () => {
    if (!newName.trim() || !newGrade.trim()) return
    const payload = { name: newName.trim(), grade: newGrade.trim(), avatar: newAvatar }
    if (editingId) {
      await updateChild(editingId, payload)
    } else {
      await addChild(payload)
    }
    setShowAddChild(false)
    reset()
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
            onClick={openAdd}
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
                  title="设为当前"
                >
                  <Icon.Check />
                </button>
                <button
                  onClick={() => openEdit(child)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center border border-slate-200 text-slate-400"
                  title="编辑"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(child.id)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center border border-red-100 text-red-400"
                  style={children.length <= 1 ? { opacity: 0.3 } : {}}
                  title="删除"
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
        {children.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-slate-400">
            <div className="text-4xl mb-2">👶</div>
            <p className="text-sm font-bold">还没有孩子档案</p>
            <p className="text-xs mt-1">点右上角"添加"创建</p>
          </div>
        )}
      </div>

      {/* Add/Edit child modal */}
      {showAddChild && (
        <div className="fixed inset-0 z-50 flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowAddChild(false); reset() }} />
          <div className="relative w-full bg-white rounded-t-3xl p-6 space-y-4 max-h-[85vh] overflow-y-auto" style={{ zIndex: 60 }}>
            <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-2" />
            <h3 className="font-black text-slate-900 text-base">{editingId ? '编辑孩子档案' : '添加新孩子档案'}</h3>

            {/* 头像选择 */}
            <div>
              <p className="text-xs text-slate-500 font-bold mb-2">选择头像</p>
              <div className="flex gap-3 justify-center">
                {['👦', '👧', '🧒', '👶', '🧑', '👨‍🎓', '👩‍🎓', '🦸'].map((av) => (
                  <button
                    key={av}
                    onClick={() => setNewAvatar(av)}
                    className="w-12 h-12 rounded-2xl text-2xl flex items-center justify-center transition-all"
                    style={newAvatar === av
                      ? { background: '#2563EB15', border: '2px solid #2563EB' }
                      : { background: '#F1F5F9', border: '2px solid transparent' }
                    }
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            {/* 姓名 */}
            <div>
              <p className="text-xs text-slate-500 font-bold mb-2">孩子姓名</p>
              <input
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-600 outline-none focus:border-blue-400"
                placeholder="例如：小明"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            {/* 年级选择 — 三段式分组 */}
            <div>
              <p className="text-xs text-slate-500 font-bold mb-2">选择年级</p>
              <div className="space-y-2">
                {GRADE_STAGES.map((stage) => (
                  <div key={stage.name} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-[11px] font-extrabold text-slate-500 mb-2">{stage.name}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {stage.grades.map((g) => (
                        <button
                          key={g.value}
                          onClick={() => setNewGrade(g.value)}
                          className="py-2 px-1 rounded-lg text-xs font-bold transition-all"
                          style={newGrade === g.value
                            ? { background: '#2563EB', color: '#fff' }
                            : { background: '#fff', color: '#475569', border: '1px solid #E2E8F0' }
                          }
                        >
                          {g.value.replace(stage.name, '')}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm"
              style={{ background: '#2563EB' }}
            >
              {editingId ? '保存修改' : '创建档案'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
