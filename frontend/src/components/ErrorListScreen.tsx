/**
 * ErrorListScreen - 错题列表页
 * 支持科目筛选、多选批量打印、搜索
 */
import React, { useState } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon, SubjectTag, Badge } from '@/components/Icons'
import type { Subject } from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

interface Props {
  onNavigate: (screen: Screen, errorId?: string) => void
}

export default function ErrorListScreen({ onNavigate }: Props) {
  const { children, activeChildId, errors, activeChild } = useApp()
  const [filterSubject, setFilterSubject] = useState<Subject | '全部'>('全部')
  const [isMultiSelect, setIsMultiSelect] = useState(false)
  const [selectedErrors, setSelectedErrors] = useState<string[]>([])

  const childErrors = errors.filter((e) => e.childId === activeChildId)
  const filteredErrors = filterSubject === '全部' ? childErrors : childErrors.filter((e) => e.subject === filterSubject)

  const toggleSelect = (id: string) => {
    setSelectedErrors((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const subjects: (Subject | '全部')[] = ['全部', '数学', '语文', '英语', '物理', '化学', '生物']

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="text-slate-600"><Icon.Back /></button>
            <div>
              <h1 className="font-black text-slate-900 text-base leading-tight">错题历史</h1>
              <p className="text-[10px] text-slate-400">{activeChild?.avatar} {activeChild?.name} · {filteredErrors.length}道错题</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIsMultiSelect(!isMultiSelect); setSelectedErrors([]); }}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors ${isMultiSelect ? 'bg-blue-50 text-[#2563EB] border-blue-200' : 'text-slate-500 border-slate-200'}`}
            >
              {isMultiSelect ? '取消' : '多选'}
            </button>
            {isMultiSelect && selectedErrors.length > 0 && (
              <button
                onClick={() => onNavigate('printPreview')}
                className="text-xs font-bold px-3 py-1.5 rounded-xl text-white"
                style={{ background: '#F97316' }}
              >
                打印({selectedErrors.length})
              </button>
            )}
          </div>
        </div>

        {/* Subject filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {subjects.map((sub) => (
            <button
              key={sub}
              onClick={() => setFilterSubject(sub)}
              className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
              style={filterSubject === sub
                ? { background: '#2563EB', color: '#fff' }
                : { background: '#F1F5F9', color: '#64748B' }
              }
            >
              {sub}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-select action bar */}
      {isMultiSelect && (
        <div className="bg-[#EFF6FF] border-b border-blue-100 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedErrors(filteredErrors.map((e) => e.id))}
              className="text-xs font-bold text-[#2563EB]"
            >
              全选({filteredErrors.length})
            </button>
            <span className="text-[10px] text-slate-400">已选 {selectedErrors.length} 道</span>
          </div>
          {selectedErrors.length > 0 && (
            <button onClick={() => onNavigate('printPreview')} className="flex items-center gap-1.5 text-xs font-bold text-[#F97316]">
              <Icon.Print /> 批量打印
            </button>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative">
        {filteredErrors.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm font-bold">暂无错题记录</p>
          </div>
        )}
        {filteredErrors.map((err) => (
          <button
            key={err.id}
            onClick={() => isMultiSelect ? toggleSelect(err.id) : onNavigate('errorDetail', err.id)}
            className="w-full bg-white rounded-2xl overflow-hidden shadow-sm text-left active:scale-98 transition-transform"
            style={isMultiSelect && selectedErrors.includes(err.id) ? { boxShadow: '0 0 0 2px #2563EB' } : {}}
          >
            <div className="flex">
              {isMultiSelect && (
                <div className="flex items-center pl-4 pr-2">
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={selectedErrors.includes(err.id)
                      ? { background: '#2563EB', borderColor: '#2563EB' }
                      : { borderColor: '#CBD5E1' }
                    }
                  >
                    {selectedErrors.includes(err.id) && <Icon.Check />}
                  </div>
                </div>
              )}
              <div className="w-20 h-20 shrink-0 bg-slate-100">
                <img src={err.imageUrl} alt={err.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 p-3 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <SubjectTag subject={err.subject} />
                  {err.isFavorite && <span className="text-orange-400 text-xs">★</span>}
                  {err.aiAnalyzed && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-500">AI</span>}
                </div>
                <p className="text-sm font-bold text-slate-800 leading-snug truncate">{err.title}</p>
                <p className="text-[10px] text-slate-400 mt-1">{err.knowledgePoint}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-slate-400">{err.date}</span>
                  <span className="text-[10px] font-bold text-red-400">错{err.wrongCount}次</span>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Camera FAB */}
      <button
        onClick={() => onNavigate('camera')}
        className="fixed bottom-20 right-5 w-14 h-14 rounded-full shadow-xl flex items-center justify-center text-white active:scale-90 transition-transform z-30"
        style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
      >
        <Icon.Camera />
      </button>
    </div>
  )
}
