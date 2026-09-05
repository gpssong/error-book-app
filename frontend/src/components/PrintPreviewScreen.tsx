/**
 * PrintPreviewScreen - 批量打印预览页
 * 支持 A4 排版预览、1列/2列切换、导出打印
 *
 * v16: 每道错题卡下方追加同类练习(similarQuestions),也用 LatexPreview 渲染
 * v19: 读 AppContext.pendingPrintIds 作 selectedIds 初值;加勾选 UI 允许用户在打印页二次调整
 * v30: 支持打印 AI 随机练习题（pendingPracticeQuestions + pendingPracticeSubject）
 */
import React, { useState, useEffect } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon, SubjectTag } from '@/components/Icons'
import LatexPreview from '@/components/LatexPreview'
import type { Subject } from '@/stores/api'
import type { SimilarQuestion } from '@/stores/api'
import { Capacitor } from '@capacitor/core'
import { Printer } from '@dimer47/capacitor-plugin-printer'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

interface Props {
  onNavigate: (screen: Screen) => void
}

export default function PrintPreviewScreen({ onNavigate }: Props) {
  const { children, activeChildId, errors, activeChild, pendingPrintIds, setPendingPrintIds, pendingPracticeQuestions, setPendingPracticeQuestions, pendingPracticeSubject, setPendingPracticeSubject } = useApp()
  const [printLayout, setPrintLayout] = useState<'2列' | '1列'>('2列')
  // v19: 从 ErrorList 多选跳转时,读 pendingPrintIds 作初值
  const [selectedIds, setSelectedIds] = useState<string[]>(pendingPrintIds)
  // v22: 含参考答案开关(默认关,打印场景用户主要是给学生做,不要答案)
  const [showAnswer, setShowAnswer] = useState(false)
  // v30: 随机练习模式
  const [isPracticeMode, setIsPracticeMode] = useState(!!pendingPracticeQuestions.length)
  const practiceQuestions = pendingPracticeQuestions.length > 0 ? pendingPracticeQuestions : []
  const practiceSubject = pendingPracticeSubject

  const childErrors = errors.filter((e) => e.childId === activeChildId)
  const printErrors = isPracticeMode
    ? []
    : selectedIds.length > 0
      ? childErrors.filter((e) => selectedIds.includes(e.id))
      : childErrors

  const questionCount = isPracticeMode ? practiceQuestions.length : printErrors.length

  // v19: 返回 ErrorList 时清空 pendingPrintIds,避免下次进来残留
  useEffect(() => {
    return () => {
      setPendingPrintIds([])
      setPendingPracticeQuestions([])
      setPendingPracticeSubject(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const [printing, setPrinting] = useState(false)

  const handlePrint = async () => {
    if (printing) return
    setPrinting(true)
    try {
      // v25: Android WebView 不支持 window.print()(静默无操作),改用 native plugin
      // - Web / 桌面浏览器:仍走 window.print()(plugin web 实现也是走这个)
      // - Android 原生:走 @dimer47/capacitor-plugin-printer 的 printWebView(),
      //                用当前 Capacitor WebView 渲染 → @media print 规则生效
      //                (BottomNav / 顶部工具栏 / 题目选择 / 设置面板自动隐藏)
      if (Capacitor.getPlatform() === 'android') {
        await Printer.printWebView({
          name: `${activeChild?.name || '错题本'}_${printErrors.length}道错题`,
        })
      } else {
        window.print()
      }
    } catch (err: any) {
      // native 取消打印或失败时,不打断用户
      console.warn('[PrintPreview] native print failed:', err)
    } finally {
      setPrinting(false)
    }
  }

  // 获取每道错题的参考答案：优先用 first similarQuestion.answer
  const getAnswer = (err: typeof printErrors[number]) => {
    if (err.similarQuestions && err.similarQuestions.length > 0) {
      return err.similarQuestions[0].answer
    }
    return null
  }

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] print:bg-white print:h-auto" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm print:hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => { setPendingPrintIds([]); onNavigate('errorList') }} className="text-slate-600"><Icon.Back /></button>
            <div>
              <h1 className="font-black text-slate-900 text-base">
                {isPracticeMode ? `${practiceSubject} · AI练习` : '打印预览'}
              </h1>
              <p className="text-[10px] text-slate-400">
                {isPracticeMode
                  ? `随机同步练习 · ${practiceQuestions.length}道题`
                  : `A4版式 · ${printErrors.length}道错题`}
              </p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            className="text-sm font-bold text-white px-4 py-2 rounded-xl"
            style={{ background: '#F97316' }}
          >
            导出打印
          </button>
        </div>

        <div className="flex gap-2">
          {(['2列', '1列'] as const).map((layout) => (
            <button
              key={layout}
              onClick={() => setPrintLayout(layout)}
              className="text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
              style={printLayout === layout
                ? { background: '#2563EB', color: '#fff' }
                : { background: '#F1F5F9', color: '#64748B' }
              }
            >
              {layout}排版
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-600">含参考答案</span>
            {/* v22: 改成真按钮 - 之前是装饰品 div 无法点击 */}
            <button
              type="button"
              aria-pressed={showAnswer}
              onClick={() => setShowAnswer((v) => !v)}
              className="w-8 h-4 rounded-full flex items-center transition-colors"
              style={{
                background: showAnswer ? '#2563EB' : '#CBD5E1',
                justifyContent: showAnswer ? 'flex-end' : 'flex-start',
                padding: '2px',
              }}
            >
              <div
                className="w-3 h-3 rounded-full bg-white shadow"
                style={{ transition: 'transform 0.15s' }}
              />
            </button>
          </div>
        </div>
      </div>

      {/* v19: 题目选择区 - 用户可调整要打印的错题 */}
      {!isPracticeMode && (
        <div className="bg-white border-b border-slate-100 px-4 py-3 print:hidden">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-extrabold text-slate-700">📋 题目选择</span>
              <span className="text-[10px] text-slate-400">已选 {printErrors.length} / {childErrors.length}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedIds(childErrors.map((e) => e.id))}
                className="text-[10px] font-bold text-[#2563EB] px-2 py-1 rounded-lg"
                style={{ background: '#EFF6FF' }}
              >
                全选
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="text-[10px] font-bold text-slate-500 px-2 py-1 rounded-lg"
                style={{ background: '#F1F5F9' }}
              >
                清空
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {childErrors.map((err, idx) => {
              const checked = selectedIds.includes(err.id)
              return (
                <button
                  key={err.id}
                  onClick={() => toggleSelect(err.id)}
                  className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
                  style={checked
                    ? { background: '#2563EB', color: '#fff' }
                    : { background: '#F1F5F9', color: '#64748B' }
                  }
                >
                  <span className="opacity-70">{idx + 1}.</span>
                  <span className="max-w-[80px] truncate">{err.title || '未命名'}</span>
                  {checked && <span>✓</span>}
                </button>
              )
            })}
          </div>
          {selectedIds.length === 0 && (
            <p className="text-[10px] text-amber-500 font-bold mt-2">⚠️ 未选任何错题，点击上方题目添加</p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 print:overflow-visible print:p-0">
        {/* A4 preview */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden print:shadow-none print:rounded-none print:w-[210mm] print:min-h-[297mm] print:mx-auto print:overflow-visible" style={{ border: '1px solid #E2E8F0' }}>
          {/* A4 header */}
          <div className="px-5 py-4 border-b border-slate-100" style={{ background: isPracticeMode ? '#F0FDF4' : '#EFF6FF' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-base" style={{ color: isPracticeMode ? '#16A34A' : '#2563EB' }}>
                  {isPracticeMode ? `${activeChild?.avatar} ${activeChild?.name}的${practiceSubject}练习` : `${activeChild?.avatar} ${activeChild?.name}的错题本`}
                </h2>
                <p className="text-[10px] text-slate-500 font-600 mt-0.5">
                  {isPracticeMode
                    ? `随机练习题 · ${practiceQuestions.length}道题 · ${new Date().toLocaleDateString('zh-CN')}`
                    : `打印日期：${new Date().toLocaleDateString('zh-CN')} · ${printErrors.length}道错题`}
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">班级：____</div>
                <div className="text-[10px] text-slate-400 mt-1">得分：____</div>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className={`p-4 print:py-8 print:px-10 print:gap-4 ${printLayout === '2列' ? 'grid grid-cols-2 gap-3' : 'space-y-4'}`}>
            {isPracticeMode
              ? practiceQuestions.map((q, idx) => (
                  <div key={q.id} className="border border-green-200 rounded-xl overflow-hidden print:break-inside-avoid print:overflow-visible">
                    <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: '#F0FDF4' }}>
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-black" style={{ background: '#16A34A' }}>
                          {idx + 1}
                        </div>
                        <SubjectTag subject={practiceSubject!} />
                      </div>
                      <span className="text-[9px] text-green-600 font-600">随机题</span>
                    </div>
                    <div className="px-2 py-2">
                      <LatexPreview
                        text={q.content}
                        className="text-[10px] text-slate-700 leading-relaxed print:text-[11px]"
                      />
                    </div>
                    <div className="border-t border-dashed border-green-200 px-2 py-1.5">
                      <p className="text-[9px] text-green-600 font-600">我的解答：</p>
                      <div className="h-8 border-b border-green-300 mt-1" />
                    </div>
                    {showAnswer && q.answer && (
                      <div className="px-2 pb-2" style={{ background: '#F0FDF4' }}>
                        <p className="text-[9px] text-green-700 font-bold">参考答案：{q.answer}</p>
                      </div>
                    )}
                  </div>
                ))
              : printErrors.map((err, idx) => {
                  const answer = getAnswer(err)
                  const similar = err.similarQuestions || []
                  return (
                    <div key={err.id} className="border border-slate-200 rounded-xl overflow-hidden print:break-inside-avoid print:overflow-visible">
                      <div className="px-2 py-1.5 flex items-center justify-between" style={{ background: '#F8FAFC' }}>
                        <div className="flex items-center gap-1.5">
                          <div className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px] font-black" style={{ background: '#2563EB' }}>
                            {idx + 1}
                          </div>
                          <SubjectTag subject={err.subject} />
                        </div>
                        <span className="text-[9px] text-slate-400 font-600">{err.knowledgePoint}</span>
                      </div>
                      <div
                        className={`bg-slate-50 px-2 py-2 print:p-3 ${printLayout === '2列' ? 'min-h-[96px] max-h-[96px] print:max-h-none' : 'min-h-[120px] max-h-[240px] print:max-h-none'}`}
                      >
                        {err.textContent ? (
                          <LatexPreview
                            text={err.textContent}
                            className="text-[10px] text-slate-700 leading-relaxed print:text-[11px]"
                          />
                        ) : (
                          <p className="text-[9px] text-slate-400 italic">（未识别文字内容）</p>
                        )}
                      </div>
                      <div className="px-2 py-2">
                        <p className="text-[10px] font-bold text-slate-700 print-title-auto">{err.title}</p>
                        <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
                          <p className="text-[9px] text-slate-400 font-600">我的解答：</p>
                          <div className="h-8 border-b border-slate-200 mt-1" />
                        </div>
                        {showAnswer ? (
                          <div className="mt-2 rounded-lg p-1.5" style={{ background: '#FFF7ED' }}>
                            <p className="text-[9px] text-orange-500 font-bold">参考答案：{answer}</p>
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg p-1.5 border border-dashed border-slate-200">
                            <p className="text-[9px] text-slate-400 font-bold italic">（已隐藏参考答案，学生自测）</p>
                          </div>
                        )}
                      </div>

                      {/* 同类练习区(v16) */}
                      {similar.length > 0 && (
                        <div className="border-t-2 border-dashed border-blue-200 px-2 py-2" style={{ background: '#F0F9FF' }}>
                          <div className="flex items-center gap-1 mb-1.5">
                            <span className="text-[9px] font-black text-blue-600">📚 同类练习 · {similar.length} 题</span>
                          </div>
                          <div className={`grid ${printLayout === '2列' ? 'grid-cols-1 gap-2' : 'grid-cols-2 gap-2'}`}>
                            {similar.slice(0, printLayout === '2列' ? 2 : 3).map((sq, sIdx) => (
                              <div
                                key={sq.id || sIdx}
                                className="rounded-lg border border-blue-100 bg-white px-2 py-1.5 print:break-inside-avoid"
                              >
                                <div className="flex items-center gap-1 mb-1">
                                  <div className="w-3.5 h-3.5 rounded-full text-white flex items-center justify-center text-[8px] font-black" style={{ background: '#3B82F6' }}>
                                    {sIdx + 1}
                                  </div>
                                  <span className="text-[8px] text-blue-500 font-600">同类 {sIdx + 1}</span>
                                </div>
                                <div className="min-h-[32px]">
                                  <LatexPreview
                                    text={sq.content}
                                    className="text-[9px] text-slate-700 leading-relaxed print:text-[10px]"
                                  />
                                </div>
                                <div className="mt-1 border-t border-dashed border-blue-100 pt-1">
                                  <p className="text-[8px] text-blue-400 font-600">解答：</p>
                                  <div className="h-5 border-b border-blue-50 mt-0.5" />
                                </div>
                                {showAnswer && sq.answer ? (
                                  <div className="mt-1 rounded p-1" style={{ background: '#FFF7ED' }}>
                                    <p className="text-[8px] text-orange-500 font-bold">答案：{sq.answer}</p>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                          {similar.length > (printLayout === '2列' ? 2 : 3) && (
                            <p className="text-[8px] text-blue-400 italic mt-1">
                              还有 {similar.length - (printLayout === '2列' ? 2 : 3)} 道同类练习未显示
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
          </div>
          {/* A4 footer */}
          <div className="px-5 py-3 border-t border-slate-100 flex justify-between items-center">
            <p className="text-[9px] text-slate-400">
              {isPracticeMode ? 'AI同步练习 · 错题本APP' : '错题本 · AI辅助学习'}
            </p>
            <p className="text-[9px] text-slate-400">
              {isPracticeMode ? `${practiceQuestions.length}道题 · 第 1 页 / 共 1 页` : '第 1 页 / 共 1 页'}
            </p>
          </div>
        </div>

        {/* Print settings */}
        <div className="mt-4 bg-white rounded-2xl p-4 shadow-sm space-y-3 print:hidden">
          <h3 className="font-extrabold text-slate-800 text-sm">打印设置</h3>
          {[
            { label: '纸张大小', value: 'A4 (210 × 297mm)' },
            { label: '排版方式', value: printLayout === '2列' ? '两列排版' : '单列排版' },
            { label: '包含参考答案', value: showAnswer ? '是' : '否' },
            { label: isPracticeMode ? '题目来源' : '包含知识点标注', value: isPracticeMode ? 'AI 随机出题' : '是' },
            { label: isPracticeMode ? '题目数量' : '包含同类练习', value: isPracticeMode ? `${practiceQuestions.length} 道` : '是' },
          ].map((item) => (
            <div key={item.label} className="flex justify-between">
              <span className="text-xs text-slate-500 font-600">{item.label}</span>
              <span className="text-xs font-bold text-slate-700">{item.value}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handlePrint}
          className="w-full mt-4 mb-4 py-4 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg print:hidden"
          style={{ background: 'linear-gradient(135deg, #F97316, #EF4444)' }}
        >
          <Icon.Print /> 一键生成并打印
        </button>
      </div>
    </div>
  )
}
