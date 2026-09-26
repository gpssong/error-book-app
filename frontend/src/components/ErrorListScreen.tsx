/**
 * ErrorListScreen - 错题列表页
 * 支持科目筛选、多选批量打印/删除、搜索
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon, SubjectTag, Badge } from '@/components/Icons'
import api, { resolveImageUrl } from '@/stores/api'
import type { Subject, ErrorItem } from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

interface Props {
  onNavigate: (screen: Screen, errorId?: string) => void
}

const PAGE_SIZE = 30

export default function ErrorListScreen({ onNavigate }: Props) {
  const { activeChildId, errors, activeChild, refreshErrors, setPendingPrintIds } = useApp()
  const [filterSubject, setFilterSubject] = useState<Subject | '全部'>('全部')
  const [isMultiSelect, setIsMultiSelect] = useState(false)
  const [selectedErrors, setSelectedErrors] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  // P3 无限滚动: 本地分页列表(load + 追加), 服务端按 childId/subject 排序+筛选。
  // 共享 store.errors(全量)仍由 AppContext 维护, 供 Dashboard 本周统计/打印页「全选」用;
  // 本页多选作用域 = 当前已加载的列表页。
  const [pageItems, setPageItems] = useState<ErrorItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const offsetRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  // 从共享 store 派生学科筛选器(动态: 当前孩子已有数据的历史/地理/科学)
  const childErrors = errors.filter((e) => e.childId === activeChildId)

  // 拉取指定页码(reset 或追加); offsetRef 记录下一个起始位置
  const loadPage = useCallback(async (reset: boolean) => {
    if (loadingMore) return
    setLoadingMore(true)
    const capturedChild = activeChildId
    const capturedSubject = filterSubject
    try {
      const nextOffset = reset ? 0 : offsetRef.current
      const data = await api.getErrorsPage({
        childId: capturedChild,
        subject: capturedSubject === '全部' ? undefined : capturedSubject,
        offset: nextOffset,
        limit: PAGE_SIZE,
      })
      // 竞态保护: 飞行中若 child/subject 已变, 丢弃本次结果(对应 effect 会重新拉)
      if (capturedChild !== activeChildId || capturedSubject !== filterSubject) return
      setPageItems((prev) => (reset ? data.items : [...prev, ...data.items]))
      offsetRef.current = nextOffset + data.items.length
      setHasMore(data.hasMore)
    } catch {
      // 网络错误: 静默, 保留已加载; 无限滚动哨兵可再次触发重试
    } finally {
      setLoadingMore(false)
    }
  }, [activeChildId, filterSubject, loadingMore])

  // child / subject 变化 → 重置列表
  useEffect(() => {
    offsetRef.current = 0
    setPageItems([])
    setHasMore(false)
    loadPage(true)
  }, [activeChildId, filterSubject, loadPage])

  // 无限滚动: 滚动容器接近底部且还有更多 → 追加
  const onScroll = useCallback(() => {
    const el = listRef.current
    if (!el || !hasMore || loadingMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
      loadPage(false)
    }
  }, [hasMore, loadingMore, loadPage])

  const toggleSelect = (id: string) => {
    setSelectedErrors((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const handleBatchDelete = async () => {
    if (selectedErrors.length === 0 || deleting) return
    if (!confirm(`确定删除选中的 ${selectedErrors.length} 道错题？\n该操作不可撤销。`)) return
    setDeleting(true)
    try {
      await api.batchDeleteErrors(selectedErrors)
      await refreshErrors()
      // 清掉已删除项, 保留尚未加载/未删除的选中
      const remaining = selectedErrors.filter((id) => !pageItems.some((e) => e.id === id))
      setSelectedErrors(remaining)
      setIsMultiSelect(false)
    } catch (e: any) {
      alert(e.message || '批量删除失败')
    } finally {
      setDeleting(false)
    }
  }

  // 学科列表:基础 7 科 + 动态从当前孩子错题里提取的历史/地理/科学
  const baseSubjects: (Subject | '全部')[] = ['全部', '数学', '语文', '英语', '物理', '化学', '生物']
  const dynamicSubjects = new Set<Subject>()
  for (const e of childErrors) {
    if (e.subject && !baseSubjects.includes(e.subject as Subject)) dynamicSubjects.add(e.subject as Subject)
  }
  const subjects: (Subject | '全部')[] = [...baseSubjects, ...Array.from(dynamicSubjects)]

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="text-slate-600"><Icon.Back /></button>
            <div>
              <h1 className="font-black text-slate-900 text-base leading-tight">错题历史</h1>
              <p className="text-[10px] text-slate-400">{activeChild?.avatar} {activeChild?.name} · {pageItems.length}道错题</p>
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
                onClick={() => { setPendingPrintIds(selectedErrors); onNavigate('printPreview') }}
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
              onClick={() => setSelectedErrors(pageItems.map((e) => e.id))}
              className="text-xs font-bold text-[#2563EB]"
            >
              全选已加载({pageItems.length})
            </button>
            <span className="text-[10px] text-slate-400">已选 {selectedErrors.length} 道</span>
          </div>
          {selectedErrors.length > 0 && (
            <div className="flex items-center gap-2">
              <button onClick={() => { setPendingPrintIds(selectedErrors); onNavigate('printPreview') }} className="flex items-center gap-1 text-xs font-bold text-[#F97316]">
                <Icon.Print /> 打印
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={deleting}
                className="flex items-center gap-1 text-xs font-bold text-red-500 disabled:opacity-50"
              >
                <Icon.Trash /> {deleting ? '删除中…' : '删除'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* List (P3: 服务端分页 + 无限滚动) */}
      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 relative">
        {pageItems.length === 0 && !loadingMore && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm font-bold">暂无错题记录</p>
          </div>
        )}
        {pageItems.map((err) => (
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
                <img src={resolveImageUrl(err.imageUrl)} alt={err.title} loading="lazy" className="w-full h-full object-cover" />
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

        {/* 无限滚动哨兵 */}
        {loadingMore && (
          <div className="py-3 text-center text-[11px] font-bold text-slate-400">加载中…</div>
        )}
        {!hasMore && pageItems.length > 0 && (
          <div className="py-3 text-center text-[11px] text-slate-300">已全部加载</div>
        )}
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
