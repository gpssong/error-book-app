/**
 * PrintPreviewScreen - 批量打印预览页
 * 支持 A4 排版预览、1列/2列切换、导出打印
 *
 * v16: 每道错题卡下方追加同类练习(similarQuestions),也用 LatexPreview 渲染
 */
import React, { useState } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon, SubjectTag } from '@/components/Icons'
import LatexPreview from '@/components/LatexPreview'
import type { Subject } from '@/stores/api'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

interface Props {
  onNavigate: (screen: Screen) => void
}

export default function PrintPreviewScreen({ onNavigate }: Props) {
  const { children, activeChildId, errors, activeChild } = useApp()
  const [printLayout, setPrintLayout] = useState<'2列' | '1列'>('2列')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const childErrors = errors.filter((e) => e.childId === activeChildId)
  const printErrors = selectedIds.length > 0
    ? childErrors.filter((e) => selectedIds.includes(e.id))
    : childErrors.slice(0, 6)

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  const handlePrint = () => {
    window.print()
  }

  // 获取每道错题的参考答案：优先用 first similarQuestion.answer
  const getAnswer = (err: typeof printErrors[number]) => {
    if (err.similarQuestions && err.similarQuestions.length > 0) {
      return err.similarQuestions[0].answer
    }
    return null
  }

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div className="bg-white px-4 pt-12 pb-4 shadow-sm print:hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('errorList')} className="text-slate-600"><Icon.Back /></button>
            <div>
              <h1 className="font-black text-slate-900 text-base">打印预览</h1>
              <p className="text-[10px] text-slate-400">A4版式 · {printErrors.length}道错题</p>
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
            <div className="w-8 h-4 rounded-full bg-blue-200 flex items-center" style={{ justifyContent: 'flex-end', padding: '2px' }}>
              <div className="w-3 h-3 rounded-full bg-[#2563EB]" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 print:overflow-visible print:p-0">
        {/* A4 preview */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden print:shadow-none print:rounded-none" style={{ border: '1px solid #E2E8F0' }}>
          {/* A4 header */}
          <div className="px-5 py-4 border-b border-slate-100" style={{ background: '#EFF6FF' }}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black text-[#2563EB] text-base">{activeChild?.avatar} {activeChild?.name}的错题本</h2>
                <p className="text-[10px] text-slate-500 font-600 mt-0.5">
                  打印日期：{new Date().toLocaleDateString('zh-CN')} · {printErrors.length}道错题
                </p>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">班级：____</div>
                <div className="text-[10px] text-slate-400 mt-1">得分：____</div>
              </div>
            </div>
          </div>

          {/* Grid */}
          <div className={`p-4 ${printLayout === '2列' ? 'grid grid-cols-2 gap-3' : 'space-y-4'}`}>
            {printErrors.map((err, idx) => {
              const answer = getAnswer(err)
              const similar = err.similarQuestions || []
              return (
                <div key={err.id} className="border border-slate-200 rounded-xl overflow-hidden print:break-inside-avoid">
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
                    className="bg-slate-50 px-2 py-2 overflow-hidden print:overflow-visible print:max-h-none"
                    style={{
                      minHeight: printLayout === '2列' ? 96 : 120,
                      maxHeight: printLayout === '2列' ? 96 : 240,
                    }}
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
                    <p className="text-[10px] font-bold text-slate-700 truncate">{err.title}</p>
                    <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
                      <p className="text-[9px] text-slate-400 font-600">我的解答：</p>
                      <div className="h-8 border-b border-slate-200 mt-1" />
                    </div>
                    {answer ? (
                      <div className="mt-2 rounded-lg p-1.5" style={{ background: '#FFF7ED' }}>
                        <p className="text-[9px] text-orange-500 font-bold">参考答案：{answer}</p>
                      </div>
                    ) : (
                      <div className="mt-2 rounded-lg p-1.5" style={{ background: '#FFF7ED' }}>
                        <p className="text-[9px] text-orange-400 font-bold italic">暂无答案（请先 AI 生成）</p>
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
                            {sq.answer ? (
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
            <p className="text-[9px] text-slate-400">错题本 · AI辅助学习</p>
            <p className="text-[9px] text-slate-400">第 1 页 / 共 1 页</p>
          </div>
        </div>

        {/* Print settings */}
        <div className="mt-4 bg-white rounded-2xl p-4 shadow-sm space-y-3 print:hidden">
          <h3 className="font-extrabold text-slate-800 text-sm">打印设置</h3>
          {[
            { label: '纸张大小', value: 'A4 (210 × 297mm)' },
            { label: '排版方式', value: printLayout === '2列' ? '两列排版' : '单列排版' },
            { label: '包含参考答案', value: '是' },
            { label: '包含知识点标注', value: '是' },
            { label: '包含同类练习', value: '是' },
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
