/**
 * AIPracticeScreen - 随机同步练习页
 *
 * 功能：
 * - 按科目一键生成随机练习题（复用 /api/ai/random）
 * - 每题可显示/隐藏参考答案
 * - 支持一键打印（调用 PrintPreviewScreen）
 * - 每日额度由 ai_similar 配额控制
 */
import React, { useState } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon, SubjectTag } from '@/components/Icons'
import LatexPreview from '@/components/LatexPreview'
import api from '@/stores/api'
import type { SimilarQuestion, Subject } from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera' | 'aiPractice'

interface Props {
  onNavigate: (screen: Screen) => void
}

const SUBJECTS: { value: Subject; label: string }[] = [
  { value: '数学', label: '数学' },
  { value: '语文', label: '语文' },
  { value: '英语', label: '英语' },
  { value: '物理', label: '物理' },
  { value: '化学', label: '化学' },
  { value: '生物', label: '生物' },
]

const SIMILAR_COUNT = 8

export default function AIPracticeScreen({ onNavigate }: Props) {
  const { activeChild, activeChildId, setPendingPracticeQuestions, setPendingPracticeSubject } = useApp()

  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [questions, setQuestions] = useState<SimilarQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [showAnswer, setShowAnswer] = useState<Record<string, boolean>>({})
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!selectedSubject || loading) return
    setLoading(true)
    setErrorMsg(null)
    setQuestions([])
    setShowAnswer({})
    try {
      const res = await api.generateRandom({
        subject: selectedSubject,
        grade: activeChild?.grade,
        childId: activeChildId,
      })
      setQuestions(res.questions)
    } catch (e: any) {
      setErrorMsg(e.message || '生成失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => {
    if (questions.length === 0) return
    setPendingPracticeQuestions(questions)
    setPendingPracticeSubject(selectedSubject)
    onNavigate('printPreview')
  }

  const toggleAnswer = (id: string) => {
    setShowAnswer((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleRefresh = () => {
    setQuestions([])
    setShowAnswer({})
    setErrorMsg(null)
    handleGenerate()
  }

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-3 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('errorList')} className="text-slate-600"><Icon.Back /></button>
            <div>
              <h1 className="font-black text-slate-900 text-base leading-tight">AI 同步练习</h1>
              <p className="text-[10px] text-slate-400">
                {activeChild?.avatar} {activeChild?.name} · {activeChild?.grade ?? ''}
              </p>
            </div>
          </div>
          {questions.length > 0 && (
            <button
              onClick={handlePrint}
              className="text-xs font-bold px-3 py-1.5 rounded-xl text-white"
              style={{ background: '#F97316' }}
            >
              <Icon.Print /> 打印
            </button>
          )}
        </div>

        {/* Subject selector */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SUBJECTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSelectedSubject(s.value)}
              className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
              style={selectedSubject === s.value
                ? { background: '#2563EB', color: '#fff' }
                : { background: '#F1F5F9', color: '#64748B' }
              }
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Empty state */}
        {!selectedSubject && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-sm font-bold text-slate-500">选择科目开始练习</p>
            <p className="text-xs text-slate-400 mt-1">AI 将根据年级水平生成随机练习题</p>
          </div>
        )}

        {selectedSubject && questions.length === 0 && !loading && !errorMsg && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <div className="text-4xl mb-3">🎯</div>
            <p className="text-sm font-bold text-slate-500">还没有题目</p>
            <p className="text-xs text-slate-400 mt-1">点击下方按钮生成 {SIMILAR_COUNT} 道{selectedSubject}练习题</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="text-4xl mb-3 animate-pulse">🔄</div>
            <p className="text-sm font-bold text-slate-500">AI 正在出题中...</p>
            <p className="text-xs text-slate-400 mt-1">预计需要 5-10 秒</p>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-sm font-bold text-red-500">{errorMsg}</p>
            <button
              onClick={() => { setErrorMsg(null); handleGenerate() }}
              className="mt-3 text-xs font-bold text-red-400 underline"
            >
              重新生成
            </button>
          </div>
        )}

        {/* Questions */}
        {!loading && !errorMsg && questions.map((q) => (
          <div key={q.id} className="bg-white rounded-2xl overflow-hidden shadow-sm mb-3">
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                  style={{ background: '#2563EB' }}
                >
                  {q.id.replace('sq', '')}
                </div>
                <SubjectTag subject={selectedSubject!} />
                <span className="text-[10px] text-slate-400">· 随机题</span>
              </div>
              <LatexPreview
                text={q.content}
                className="text-sm text-slate-800 font-medium leading-relaxed"
              />
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <button
                onClick={() => toggleAnswer(q.id)}
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

        {/* Generate button */}
        {selectedSubject && questions.length === 0 && !loading && !errorMsg && (
          <button
            onClick={handleGenerate}
            className="w-full py-4 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 mb-4"
            style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
          >
            <Icon.AI /> 生成 {SIMILAR_COUNT} 道{selectedSubject}练习题
          </button>
        )}

        {/* Refresh + Print buttons after generation */}
        {!loading && !errorMsg && questions.length > 0 && (
          <div className="flex gap-3 mt-2 mb-4">
            <button
              onClick={handleRefresh}
              className="flex-1 py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #F97316, #EF4444)' }}
            >
              <Icon.Refresh /> 重新出题
            </button>
            <button
              onClick={handlePrint}
              className="flex-1 py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2"
              style={{ background: '#2563EB' }}
            >
              <Icon.Print /> 打印练习
            </button>
          </div>
        )}

        {/* Empty practice history hint */}
        {questions.length === 0 && !loading && !errorMsg && selectedSubject && (
          <div className="text-center py-4">
            <p className="text-[10px] text-slate-400">
              每日免费 {selectedSubject === '数学' ? '3' : '3'} 次 AI 出题额度
              {activeChild?.grade ? ` · ${activeChild.grade}水平` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
