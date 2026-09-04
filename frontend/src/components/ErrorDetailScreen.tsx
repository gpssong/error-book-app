/**
 * ErrorDetailScreen - 错题详情页
 * 含三个 Tab：题目详情（手写笔迹管理）、AI讲解、同类练习
 *
 * 手写笔迹功能：
 *  - 独立手写图层（SVG 叠加在原图上）
 *  - 点击「批注」打开画布进行书写
 *  - 「清除手写内容」一键擦除所有笔迹，原图不受影响
 */
import React, { useState, useCallback, useEffect } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon, SubjectTag } from '@/components/Icons'
import DrawingCanvas from '@/components/DrawingCanvas'
import type { ErrorItem, SimilarQuestion, AIAnalysisResult } from '@/stores/api'
import api from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'
type TabKey = 'detail' | 'ai' | 'similar'
type DetailSubPhase = 'view' | 'annotate'

interface Props {
  onErrorId: (screen: Screen, errorId?: string) => void
  errorId: string
}

export default function ErrorDetailScreen({ onErrorId, errorId }: Props) {
  const { errors, activeChildId, activeChild, updateError } = useApp()
  const err = errors.find((e) => e.id === errorId)
  const [tabActive, setTabActive] = useState<TabKey>('detail')
  const [detailSubPhase, setDetailSubPhase] = useState<DetailSubPhase>('view')
  const [aiStep, setAiStep] = useState(0)
  const [aiPlaying, setAiPlaying] = useState(false)
  const [hasHandwriting, setHasHandwriting] = useState(!!err?.handwritingSvg)
  const [showAnswer, setShowAnswer] = useState<Record<string, boolean>>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(err?.aiAnalysis || null)
  const [similarQuestions, setSimilarQuestions] = useState<SimilarQuestion[]>(err?.similarQuestions || [])
  const [displayImageUrl, setDisplayImageUrl] = useState(err?.imageBase64 || err?.imageUrl)
  const [currentHandwritingSvg, setCurrentHandwritingSvg] = useState(err?.handwritingSvg || '')

  // 当错误数据从后端刷新时同步本地状态
  useEffect(() => {
    if (err) {
      setDisplayImageUrl(err.imageBase64 || err.imageUrl)
      setCurrentHandwritingSvg(err.handwritingSvg || '')
      setHasHandwriting(!!err.handwritingSvg)
    }
  }, [err?.id])

  if (!err) {
    return (
      <div className="flex flex-col h-full bg-[#F8FAFC] items-center justify-center">
        <p className="text-slate-400 font-bold">错题不存在</p>
        <button onClick={() => onErrorId('errorList')} className="mt-4 text-[#2563EB] text-sm font-bold">
          返回错题列表
        </button>
      </div>
    )
  }

  // ─── AI 讲解逻辑 ────────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    setAiLoading(true)
    try {
      const result = await api.analyzeError({
        title: err.title,
        knowledgePoint: err.knowledgePoint,
        subject: err.subject,
        textContent: err.textContent,
        childId: err.childId,
      })
      setAiResult(result)
      await api.saveAiAnalysis(err.id, {
        mistakeReason: result.mistakeReason,
        knowledgeExplained: result.knowledgeExplained,
        stepByStepGuide: result.stepByStepGuide,
      })
      await updateError(err.id, { aiAnalyzed: true, aiAnalysis: { ...result, analyzedAt: new Date().toISOString() } })
    } catch (e) {
      console.error('AI 分析失败:', e)
    } finally {
      setAiLoading(false)
    }
  }, [err, updateError])

  const handleGenerateSimilar = useCallback(async () => {
    setAiLoading(true)
    try {
      const res = await api.generateSimilar({
        title: err.title,
        knowledgePoint: err.knowledgePoint,
        subject: err.subject,
        childId: err.childId,
      })
      setSimilarQuestions(res.questions)
      await api.saveAiAnalysis(err.id, {
        mistakeReason: aiResult?.mistakeReason || '',
        knowledgeExplained: aiResult?.knowledgeExplained || '',
        stepByStepGuide: aiResult?.stepByStepGuide || '',
        similarQuestions: res.questions,
      })
      await updateError(err.id, { similarQuestions: res.questions })
    } catch (e) {
      console.error('生成同类题失败:', e)
    } finally {
      setAiLoading(false)
    }
  }, [err, aiResult, updateError])

  const toggleFav = () => {
    const newFav = !err.isFavorite
    updateError(err.id, { isFavorite: newFav })
  }

  // ─── 手写笔迹操作 ────────────────────────────────────────────────────────────
  const openAnnotation = () => {
    setDetailSubPhase('annotate')
  }

  const closeAnnotation = () => {
    setDetailSubPhase('view')
  }

  const handleAnnotationSave = async (svgPaths: string, mergedBase64: string) => {
    setDisplayImageUrl(mergedBase64)
    setCurrentHandwritingSvg(svgPaths)
    setHasHandwriting(true)
    setDetailSubPhase('view')

    try {
      await api.updateError(err.id, {
        handwritingSvg: svgPaths,
        imageBase64: mergedBase64,
      })
      await updateError(err.id, { handwritingSvg: svgPaths, imageBase64: mergedBase64 })
    } catch (e) {
      console.error('保存手写笔迹失败:', e)
    }
  }

  const clearHandwriting = async () => {
    setDisplayImageUrl(err.imageUrl)
    setCurrentHandwritingSvg('')
    setHasHandwriting(false)

    try {
      await api.clearHandwriting(err.id)
      await updateError(err.id, { handwritingSvg: '' })
    } catch (e) {
      console.error('清除手写笔迹失败:', e)
    }
  }

  // AI 分步讲解的模拟步骤数据
  const aiSteps = [
    { title: '审题分析', content: `这道题考察的是**${err.knowledgePoint}**。关键是理解概念的本质，注意常见陷阱。` },
    { title: '解题步骤', content: '**第一步**：分析题目条件，找出已知量和未知量\n**第二步**：选择合适的公式或定理\n**第三步**：代入计算，注意符号和单位' },
    { title: '知识点总结', content: `📌 **核心知识点**：${err.knowledgePoint}\n📌 **常见错误**：符号计算出错，注意细节\n📌 **考试频率**：★★★★☆（高频考点）` },
  ]

  // ── 批注画布阶段 ──
  if (detailSubPhase === 'annotate') {
    return (
      <div className="flex flex-col h-full" style={{ fontFamily: "'Nunito', sans-serif" }}>
        <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-slate-100 shrink-0">
          <button onClick={closeAnnotation} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
            <Icon.Back />
          </button>
          <span className="text-slate-800 font-extrabold text-sm">✏️ 手写批注</span>
          <div className="w-9" />
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <DrawingCanvas
            imageUrl={err.imageUrl}
            existingSvg={currentHandwritingSvg || undefined}
            onSave={handleAnnotationSave}
            onCancel={closeAnnotation}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-3 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => onErrorId('errorList')} className="text-slate-600"><Icon.Back /></button>
          <div>
            <h1 className="font-extrabold text-slate-900 text-sm leading-tight truncate max-w-[180px]">{err.title}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <SubjectTag subject={err.subject} />
              <span className="text-[10px] text-slate-400">{err.date}</span>
            </div>
          </div>
        </div>
        <button onClick={toggleFav}>
          <Icon.Star filled={err.isFavorite} />
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-slate-100 px-4 flex gap-4 shrink-0">
        {([
          { key: 'detail' as const, label: '题目详情' },
          { key: 'ai' as const, label: 'AI讲解' },
          { key: 'similar' as const, label: '同类练习' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTabActive(tab.key)}
            className="py-3 text-sm font-bold border-b-2 transition-colors"
            style={tabActive === tab.key
              ? { borderColor: '#2563EB', color: '#2563EB' }
              : { borderColor: 'transparent', color: '#94A3B8' }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Tab: Detail ── */}
        {tabActive === 'detail' && (
          <div className="px-4 py-4 space-y-4">
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className="relative">
                <img
                  src={displayImageUrl}
                  alt={err.title}
                  className="w-full h-48 object-cover"
                />
                {/* 独立手写图层：SVG 叠加在原图上 */}
                {hasHandwriting && currentHandwritingSvg && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    dangerouslySetInnerHTML={{ __html: currentHandwritingSvg }}
                  />
                )}
              </div>
              <div className="px-4 py-3 flex items-center gap-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-500 mr-1">手写批注</span>
                <button
                  onClick={openAnnotation}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all"
                  style={{ background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' }}
                >
                  <Icon.Pen /> 批注
                </button>
                <button
                  onClick={clearHandwriting}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors"
                  style={hasHandwriting
                    ? { background: '#FFF7ED', color: '#F97316', borderColor: '#FED7AA' }
                    : { background: '#F1F5F9', color: '#94A3B8', borderColor: '#E2E8F0' }
                  }
                >
                  <Icon.Eraser /> {hasHandwriting ? '清除手写内容' : '已清除'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 font-bold">知识点</span>
                <span className="text-xs font-bold text-slate-700">{err.knowledgePoint}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 font-bold">错误次数</span>
                <div className="flex gap-1">
                  {Array.from({ length: err.wrongCount }).map((_, i) => (
                    <div key={i} className="w-2 h-2 rounded-full bg-red-400" />
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-slate-500 font-bold">录入时间</span>
                <span className="text-xs font-bold text-slate-700">{err.date}</span>
              </div>
            </div>

            <button
              onClick={() => setTabActive('ai')}
              className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform shadow-lg"
              style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
            >
              <Icon.AI /> AI 分步讲解此题
            </button>
          </div>
        )}

        {/* ── Tab: AI ── */}
        {tabActive === 'ai' && (
          <div className="px-4 py-4 space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white text-xl" style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}>
                  🤖
                </div>
                <div>
                  <div className="font-extrabold text-slate-800 text-sm">AI智能讲师</div>
                  <div className="text-[10px] text-slate-400">正在分析：{err.title}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAnalyze}
                  disabled={aiLoading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: '#EFF6FF', color: '#2563EB' }}
                >
                  <Icon.Speak /> {aiLoading ? '分析中...' : '开始AI讲解'}
                </button>
                <button
                  onClick={() => { setAiStep(0); setAiResult(null); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: '#F1F5F9', color: '#64748B' }}
                >
                  <Icon.Refresh /> 重置
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {aiResult
                ? aiSteps.slice(0, 3).map((step, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl p-4 shadow-sm transition-all"
                      style={idx <= aiStep ? { opacity: 1 } : { opacity: 0.35 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: idx <= aiStep ? '#2563EB' : '#CBD5E1' }}>
                          {idx + 1}
                        </div>
                        <span className="font-extrabold text-sm text-slate-800">{step.title}</span>
                      </div>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-line">
                        {idx === 0 ? aiResult.mistakeReason
                          : idx === 1 ? aiResult.knowledgeExplained
                          : aiResult.stepByStepGuide}
                      </p>
                    </div>
                  ))
                : aiSteps.slice(0, aiStep + 1).map((step, idx) => (
                    <div
                      key={idx}
                      className="bg-white rounded-2xl p-4 shadow-sm"
                      style={idx <= aiStep ? { opacity: 1 } : { opacity: 0.35 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white" style={{ background: idx <= aiStep ? '#2563EB' : '#CBD5E1' }}>
                          {idx + 1}
                        </div>
                        <span className="font-extrabold text-sm text-slate-800">{step.title}</span>
                      </div>
                      <p className="text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-line">{step.content}</p>
                    </div>
                  ))
               }
            </div>

            {aiStep < 2 && (
              <button
                onClick={() => setAiStep((s) => s + 1)}
                className="w-full py-3 rounded-2xl text-sm font-extrabold text-white active:scale-95 transition-transform"
                style={{ background: '#2563EB' }}
              >
                下一步解析 →
              </button>
            )}

            {aiStep === 2 && (
              <button
                onClick={() => setTabActive('similar')}
                className="w-full py-3 rounded-2xl text-sm font-extrabold text-white active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg, #F97316, #EF4444)' }}
              >
                🎯 查看同类练习题
              </button>
            )}
          </div>
        )}

        {/* ── Tab: Similar ── */}
        {tabActive === 'similar' && (
          <div className="px-4 py-4 space-y-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🎯</span>
                <h3 className="font-extrabold text-slate-800 text-sm">同知识点变式练习</h3>
              </div>
              <p className="text-[11px] text-slate-400">AI 根据"{err.knowledgePoint}"为{activeChild ? `${activeChild.name} (${activeChild.grade})` : '当前孩子'}生成练习题</p>
            </div>

            {similarQuestions.length === 0 && !aiLoading && (
              <button
                onClick={handleGenerateSimilar}
                className="w-full py-4 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #F97316, #EF4444)' }}
              >
                <Icon.AI /> 生成同类练习题
              </button>
            )}

            {aiLoading && (
              <div className="bg-white rounded-2xl p-6 text-center">
                <div className="text-3xl mb-2">🔄</div>
                <p className="text-sm font-bold text-slate-500">AI 正在生成题目...</p>
              </div>
            )}

            {similarQuestions.map((q) => (
              <div key={q.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: '#F97316' }}>
                      {q.id.replace('sq', '')}
                    </div>
                    <span className="text-xs font-bold text-orange-500">{err.knowledgePoint}</span>
                  </div>
                  <p className="text-sm text-slate-800 font-medium leading-relaxed">{q.content}</p>
                </div>
                <div className="border-t border-slate-100 px-4 py-3">
                  <button
                    onClick={() => setShowAnswer((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                    className="flex items-center gap-2 text-xs font-bold transition-colors"
                    style={{ color: showAnswer[q.id] ? '#F97316' : '#2563EB' }}
                  >
                    <Icon.Eye open={!showAnswer[q.id]} />
                    {showAnswer[q.id] ? '隐藏答案' : '显示参考答案'}
                  </button>
                  {showAnswer[q.id] && (
                    <div className="mt-2 p-3 rounded-xl text-sm text-slate-700 font-medium" style={{ background: '#FFF7ED' }}>
                      <span className="font-extrabold text-orange-500">参考答案：</span>{q.answer}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom action */}
      <div className="bg-white border-t border-slate-100 px-4 py-3 flex gap-3 shrink-0">
        <button
          onClick={() => onErrorId('printPreview')}
          className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 flex items-center justify-center gap-2"
        >
          <Icon.Print /> 打印此题
        </button>
        <button
          onClick={() => setTabActive('ai')}
          className="flex-1 py-3 rounded-2xl text-sm font-extrabold text-white flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
        >
          <Icon.AI /> AI讲解
        </button>
      </div>
    </div>
  )
}
