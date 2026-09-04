/**
 * DashboardScreen - 首页
 * 展示当前孩子的学习统计、最近错题、快捷功能入口
 */
import React, { useState } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon, SubjectTag, Badge } from '@/components/Icons'
import type { Subject } from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

interface Props {
  onNavigate: (screen: Screen, errorId?: string) => void
}

export default function DashboardScreen({ onNavigate }: Props) {
  const { children, activeChildId, setActiveChild, errors } = useApp()
  const [showChildPicker, setShowChildPicker] = useState(false)

  const activeChildData = children.find((c) => c.id === activeChildId)
  const childErrors = errors.filter((e) => e.childId === activeChildId)
  const recentErrors = childErrors.slice(0, 3)

  // 没有孩子时显示引导页
  if (children.length === 0) {
    return (
      <div className="flex flex-col h-full bg-[#F8FAFC] items-center justify-center px-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
        <div className="text-6xl mb-4">📚</div>
        <h2 className="font-black text-slate-800 text-lg mb-2">欢迎使用错题本</h2>
        <p className="text-sm text-slate-500 text-center mb-6">添加你的第一个孩子档案开始记录错题</p>
        <button
          onClick={() => onNavigate('childManage')}
          className="px-6 py-3 rounded-2xl text-white font-extrabold text-sm"
          style={{ background: '#2563EB' }}
        >
          添加孩子
        </button>
      </div>
    )
  }

  if (!activeChildData) {
    // 兜底：尝试切换到有效孩子
    if (children.length > 0) {
      setActiveChild(children[0].id)
    }
    return (
      <div className="flex flex-col h-full bg-[#F8FAFC] items-center justify-center">
        <p className="text-slate-400 font-bold">加载中…</p>
      </div>
    )
  }

  // ── 按天统计本周新增错题 ────────────────────────────────────────────────────
  const getWeekDayCounts = () => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0=周日
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // 本周一的偏移
    const monday = new Date(today)
    monday.setDate(today.getDate() + mondayOffset)
    monday.setHours(0, 0, 0, 0)

    const counts: number[] = [0, 0, 0, 0, 0, 0, 0] // 周一到周日
    childErrors.forEach((e) => {
      const d = new Date(e.date)
      if (isNaN(d.getTime())) return
      if (d < monday) return // 不在本周
      const diffDays = Math.floor((d.getTime() - monday.getTime()) / 86400000)
      if (diffDays >= 0 && diffDays <= 6) {
        counts[diffDays]++
      }
    })
    return counts
  }

  const weekCounts = getWeekDayCounts()
  const maxWeekCount = Math.max(...weekCounts, 1) // 避免除以0
  const todayIndex = (new Date().getDay() + 6) % 7 // 0=周一

  // ── 孩子选择器 ──────────────────────────────────────────────────────────────
  const ChildPicker = () => (
    <div className="relative z-50">
      <button
        onClick={() => setShowChildPicker(!showChildPicker)}
        className="flex items-center gap-2 bg-white rounded-2xl px-3 py-2 shadow-sm border border-slate-100 active:scale-95 transition-transform"
      >
        <span className="text-xl">{activeChildData.avatar}</span>
        <div className="text-left">
          <div className="text-sm font-extrabold text-slate-800 leading-tight">{activeChildData.name}</div>
          <div className="text-[10px] text-slate-400 font-600">{activeChildData.grade}</div>
        </div>
        <div className="text-slate-400 ml-1" style={{ transform: showChildPicker ? 'rotate(180deg)' : 'none', transition: '0.2s' }}>
          <Icon.ChevronDown />
        </div>
      </button>

      {showChildPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowChildPicker(false)} />
          <div className="absolute top-full left-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 min-w-[180px]">
            <div className="px-3 pt-3 pb-1">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">切换孩子账号</p>
            </div>
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => { setActiveChild(child.id); setShowChildPicker(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
              >
                <span className="text-2xl">{child.avatar}</span>
                <div className="text-left flex-1">
                  <div className="text-sm font-bold text-slate-800">{child.name}</div>
                  <div className="text-[10px] text-slate-400">{child.grade} · {child.errorCount}道错题</div>
                </div>
                {child.id === activeChildId && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ background: '#2563EB' }}>
                    <Icon.Check />
                  </div>
                )}
              </button>
            ))}
            <div className="border-t border-slate-100 mx-3" />
            <button
              onClick={() => { setShowChildPicker(false); onNavigate('childManage'); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-[#2563EB] hover:bg-blue-50 transition-colors"
            >
              <Icon.Plus />
              <span className="text-sm font-bold">添加新孩子</span>
            </button>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <ChildPicker />
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('camera')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-white"
              style={{ background: '#2563EB' }}
            >
              <Icon.Camera />
              拍题录入
            </button>
            <button
              onClick={() => onNavigate('printPreview')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl text-white"
              style={{ background: '#F97316' }}
            >
              <Icon.Print />
              打印
            </button>
          </div>
        </div>
        {/* Stats strip */}
        <div className="flex gap-3">
          {[
            { label: '总错题', value: activeChildData.errorCount, unit: '道', color: '#2563EB', bg: '#EFF6FF' },
            { label: '本周新增', value: weekCounts.reduce((a, b) => a + b, 0), unit: '道', color: '#F97316', bg: '#FFF7ED' },
            { label: '已掌握', value: activeChildData.masteredCount, unit: '道', color: '#10B981', bg: '#ECFDF5' },
          ].map((s) => (
            <div key={s.label} className="flex-1 rounded-2xl p-3" style={{ background: s.bg }}>
              <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
              <div className="text-[10px] font-600 text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Progress card - 基于真实本周错题数据 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-slate-800 text-sm">本周学习进度</h3>
            <div className="flex items-center gap-1 text-[#10B981] text-xs font-bold">
              <Icon.TrendUp />
              本周 {weekCounts.reduce((a, b) => a + b, 0)} 题
            </div>
          </div>
          <div className="flex gap-1 items-end h-12">
            {['一', '二', '三', '四', '五', '六', '日'].map((day, i) => {
              const heightPct = (weekCounts[i] / maxWeekCount) * 100
              const isToday = i === todayIndex
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md transition-all duration-300"
                    style={{
                      height: `${Math.max(heightPct, weekCounts[i] > 0 ? 15 : 4)}%`,
                      background: isToday ? '#2563EB' : weekCounts[i] > 0 ? '#93C5FD' : '#F1F5F9',
                    }}
                  />
                  <span className="text-[9px] text-slate-400 font-600">{day}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Recent errors */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-slate-800 text-sm">最近错题</h3>
            <button onClick={() => onNavigate('errorList')} className="text-xs text-[#2563EB] font-bold flex items-center">
              查看全部 <Icon.ChevronRight />
            </button>
          </div>
          <div className="space-y-2">
            {recentErrors.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center text-slate-400">
                <div className="text-3xl mb-2">📭</div>
                <p className="text-sm font-bold">暂无错题记录，开始拍题吧！</p>
              </div>
            ) : recentErrors.map((err) => (
              <button
                key={err.id}
                onClick={() => onNavigate('errorDetail', err.id)}
                className="w-full bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3 text-left active:scale-98 transition-transform"
              >
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  <img src={err.imageUrl} alt={err.title} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <SubjectTag subject={err.subject} />
                    {err.aiAnalyzed && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">AI已分析</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-800 truncate">{err.title}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{err.date} · 错误{err.wrongCount}次</p>
                </div>
                <div className="text-slate-300"><Icon.ChevronRight /></div>
              </button>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <h3 className="font-extrabold text-slate-800 text-sm mb-3">快捷功能</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '拍照识题', desc: 'AI一拍即录入', color: '#2563EB', bg: '#EFF6FF', icon: '📷', action: () => onNavigate('camera') },
              { label: '批量打印', desc: '一键生成错题本', color: '#F97316', bg: '#FFF7ED', icon: '🖨️', action: () => onNavigate('printPreview') },
              { label: '知识点分析', desc: '薄弱点诊断', color: '#9333EA', bg: '#FDF4FF', icon: '📊', action: () => onNavigate('errorList') },
              { label: '孩子档案', desc: '管理多个孩子', color: '#10B981', bg: '#ECFDF5', icon: '👨‍👩‍👧', action: () => onNavigate('childManage') },
            ].map((item) => (
              <button
                key={item.label}
                onClick={item.action}
                className="rounded-2xl p-4 text-left active:scale-95 transition-transform"
                style={{ background: item.bg }}
              >
                <div className="text-2xl mb-2">{item.icon}</div>
                <div className="font-extrabold text-sm" style={{ color: item.color }}>{item.label}</div>
                <div className="text-[10px] text-slate-400 font-600 mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
