/**
 * CameraScreen - 拍照识题页
 * 支持：
 *  - 调用系统相机拍照 / 从相册选择图片
 *  - 在图片上手写批注（独立手绘图层）
 *  - 清除手写内容（不破坏原图）
 *  - AI 识别并录入错题
 *
 * 新增：AI 识别前自动做图片预处理
 *  - 去白边
 *  - 灰度增强
 *  - 去手写（连通域分析）
 *  - EXIF 自动旋转
 *  显著提升 OCR 准确率
 */
import React, { useState, useRef } from 'react'
import { useApp } from '@/stores/AppContext'
import { Icon } from '@/components/Icons'
import DrawingCanvas from '@/components/DrawingCanvas'
import LatexPreview from '@/components/LatexPreview'
import RegionSelector from '@/components/RegionSelector'
import type { Subject } from '@/stores/api'
import api from '@/stores/api'
import { preprocessImage } from '@/utils/imagePreprocess'
import { cropImage, type Region } from '@/utils/imageCrop'
import 'katex/dist/katex.min.css'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'
type Phase = 'viewfinder' | 'annotating' | 'captured' | 'regionSelect' | 'recognizing' | 'result' | 'batchResult'

interface Props {
  onNavigate: (screen: Screen) => void
}

export default function CameraScreen({ onNavigate }: Props) {
  const { activeChildId, createError } = useApp()
  const [cameraPhase, setCameraPhase] = useState<Phase>('viewfinder')
  const [flashOn, setFlashOn] = useState(false)
  const [cameraMode, setCameraMode] = useState<'拍题' | '作业' | '试卷'>('拍题')

  // 图片相关
  const [capturedImageUrl, setCapturedImageUrl] = useState<string>('')
  const [recognizedImageBase64, setRecognizedImageBase64] = useState<string>('')
  const [existingHandwritingSvg, setExistingHandwritingSvg] = useState<string>('')

  // AI 识别相关
  const [recognizeSubject, setRecognizeSubject] = useState<Subject>('数学')
  const [recognizeProgress, setRecognizeProgress] = useState(0)
  const [recognizedData, setRecognizedData] = useState<{ title: string; knowledgePoint: string; textContent: string } | null>(null)
  const [ocrSuccess, setOcrSuccess] = useState(false)

  // 手动编辑状态
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  // 文件输入引用
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // ─── 图片选择 ────────────────────────────────────────────────────────────────
  const handleCameraCapture = () => {
    cameraInputRef.current?.click()
  }

  const handleGallerySelect = () => {
    galleryInputRef.current?.click()
  }

  const processSelectedFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      setCapturedImageUrl(dataUrl)
      setRecognizedImageBase64('')
      setExistingHandwritingSvg('')
      setCameraPhase('annotating')
    }
    reader.readAsDataURL(file)
  }

  // ─── AI OCR 识别 ─────────────────────────────────────────────────────────────
  // 区域选择:用户在 regionSelect 阶段框选 N 个矩形,这里对每框裁剪 + 单独 OCR
  const [pendingRegions, setPendingRegions] = useState<Region[]>([])
  const handleRegionsConfirm = async (regions: Region[]) => {
    setPendingRegions(regions)
    setCameraPhase('recognizing')
    setRecognizeProgress(0)
    setOcrSuccess(false)

    const progressTimer = setInterval(() => {
      setRecognizeProgress((prev) => Math.min(prev + 100 / (regions.length * 8), 92))
    }, 200)

    try {
      // 1) 预处理原图(只做 1 次,后续裁剪直接从预处理后的图切)
      let fullBase64 = recognizedImageBase64 || capturedImageUrl
      try {
        fullBase64 = await preprocessImage(fullBase64, { maxDim: 1600 })
      } catch (preErr) {
        console.warn('[OCR] 预处理失败,使用原图:', preErr)
      }

      // 2) 对每框裁剪 + 独立 OCR
      const results: Array<{ idx: number; title: string; knowledgePoint: string; textContent: string; croppedUrl: string; ok: boolean; message?: string }> = []
      for (let i = 0; i < regions.length; i++) {
        try {
          const croppedUrl = await cropImage(fullBase64, regions[i])
          // 单题裁剪图已小,无需再 preprocess
          const r = await api.recognizeQuestion({ imageBase64: croppedUrl, subject: recognizeSubject })
          results.push({
            idx: i,
            title: r.title || '',
            knowledgePoint: r.knowledgePoint || '',
            textContent: r.textContent || '',
            croppedUrl,
            ok: true,
          })
        } catch (e: any) {
          console.error(`[OCR] 第 ${i + 1} 框识别失败:`, e)
          results.push({
            idx: i,
            title: '',
            knowledgePoint: '',
            textContent: '',
            croppedUrl: '',
            ok: false,
            message: e.message || '识别失败',
          })
        }
      }

      clearInterval(progressTimer)
      setRecognizeProgress(100)

      // 3) 全部入错题库(成功 + 失败的都创建,但失败的标记 title="需手动补录")
      let successCount = 0
      for (const r of results) {
        const title = r.ok && r.title ? r.title : `第 ${r.idx + 1} 题${r.ok ? '' : '(需补录)'}`
        const textContent = r.ok ? r.textContent : ''
        await createError({
          childId: activeChildId,
          subject: recognizeSubject,
          title,
          knowledgePoint: r.knowledgePoint || '',
          textContent,
          imageUrl: r.croppedUrl || (recognizedImageBase64 || capturedImageUrl),
          imageBase64: r.croppedUrl || undefined,
          handwritingSvg: existingHandwritingSvg || undefined,
        })
        if (r.ok) successCount++
      }

      setRecognizedData({
        title: `批量识别 ${results.length} 道题`,
        knowledgePoint: recognizeSubject,
        textContent: results.map((r, i) =>
          r.ok ? `第 ${i + 1} 题 ${r.title}\n${r.textContent}`
               : `第 ${i + 1} 题 识别失败:${r.message || '未知原因'}`
        ).join('\n\n'),
      })
      setOcrSuccess(successCount === results.length)
      setTimeout(() => setCameraPhase('batchResult'), 300)
    } catch (err) {
      clearInterval(progressTimer)
      setRecognizeProgress(100)
      console.error('[OCR] 批量识别失败:', err)
      alert('识别失败,请重试')
      setCameraPhase('regionSelect')
    }
  }

  // 单题旧入口保留 — 兼容只拍照 1 题的用户(全图直接识别)
  const handleRecognizeAll = async () => {
    await handleRegionsConfirm([{ x: 0, y: 0, w: 1, h: 1 }])
  }

  // ─── 录入错题(批量场景已自动入库,这里只是导航) ──────────────────────────
  const handleAddToErrors = async () => {
    onNavigate('errorList')
  }

  // ─── 标注完成回调 ────────────────────────────────────────────────────────────
  const handleAnnotationSave = (svgPaths: string, mergedBase64: string) => {
    setExistingHandwritingSvg(svgPaths)
    setRecognizedImageBase64(mergedBase64)
    setCameraPhase('captured')
  }

  const handleAnnotationCancel = () => {
    setCameraPhase('captured')
  }

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* 隐藏的文件输入 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) processSelectedFile(file)
          e.target.value = ''
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) processSelectedFile(file)
          e.target.value = ''
        }}
      />

      {/* ── Viewfinder phase ── */}
      {cameraPhase === 'viewfinder' && (
        <>
          <div className="flex items-center justify-between px-4 pt-12 pb-3 z-10">
            <button onClick={() => onNavigate('dashboard')} className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
              <Icon.Back />
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => setFlashOn(!flashOn)} className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
                <Icon.Flash on={flashOn} />
              </button>
              <button className="w-9 h-9 rounded-full bg-black/40 flex items-center justify-center text-white">
                <Icon.CameraFlip />
              </button>
            </div>
          </div>

          <div className="flex justify-center gap-2 mb-3 z-10">
            {(['拍题', '作业', '试卷'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setCameraMode(m)}
                className="text-xs font-bold px-4 py-1.5 rounded-full transition-all"
                style={cameraMode === m
                  ? { background: '#2563EB', color: '#fff' }
                  : { background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.95)' }
                }
              >
                {m}
              </button>
            ))}
          </div>

          <div className="relative flex-1 mx-4 rounded-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-slate-800 to-slate-900">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-5xl mb-3">📷</div>
                  <p className="text-white/95 text-sm font-bold">点击下方按钮拍照或选择图片</p>
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 left-0 right-0 flex justify-center">
              <div className="bg-black/50 rounded-full px-4 py-1.5 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse" />
                <span className="text-white/90 text-xs font-bold">支持拍照导入 / 相册选择</span>
              </div>
            </div>
          </div>

          <div className="px-6 pt-6 pb-10 flex items-center justify-between">
            <button
              onClick={handleGallerySelect}
              className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/20 flex items-center justify-center bg-white/10"
            >
              <Icon.ImagePick />
            </button>
            <button
              onClick={handleCameraCapture}
              className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center active:scale-90 transition-transform"
            >
              <div className="w-16 h-16 rounded-full bg-white" />
            </button>
            <button
              onClick={handleGallerySelect}
              className="w-14 h-14 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center"
            >
              <span className="text-xs font-bold text-white/95">相册</span>
            </button>
          </div>
        </>
      )}

      {/* ── Annotating phase (drawing canvas) ── */}
      {cameraPhase === 'annotating' && (
        <>
          <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-slate-100 shrink-0">
            <button onClick={handleAnnotationCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <Icon.Back />
            </button>
            <span className="text-slate-800 font-extrabold text-sm">✏️ 手写批注</span>
            <div className="w-9" />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <DrawingCanvas
              imageUrl={capturedImageUrl}
              existingSvg={existingHandwritingSvg || undefined}
              onSave={handleAnnotationSave}
              onCancel={handleAnnotationCancel}
            />
          </div>
        </>
      )}

      {/* ── Captured phase ── */}
      {cameraPhase === 'captured' && (
        <>
          <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-slate-100">
            <button onClick={() => setCameraPhase('viewfinder')} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <Icon.Back />
            </button>
            <span className="text-slate-800 font-extrabold text-sm">确认拍摄</span>
            <button
              onClick={() => setCameraPhase('annotating')}
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl"
              style={{ background: '#EFF6FF', color: '#2563EB' }}
            >
              <Icon.Pen /> 批注
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="relative rounded-2xl overflow-hidden bg-slate-100" style={{ maxHeight: '60vh' }}>
              <img
                src={recognizedImageBase64 || capturedImageUrl}
                alt="captured"
                className="w-full object-contain"
              />
              {/* 如果有手写笔迹，显示 SVG 叠加层 */}
              {existingHandwritingSvg && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: existingHandwritingSvg }}
                />
              )}
            </div>
          </div>
          <div className="bg-white px-4 pt-4 pb-10 flex gap-3 border-t border-slate-100">
            <button
              onClick={() => setCameraPhase('viewfinder')}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm"
            >
              重拍
            </button>
            <button
              onClick={() => setCameraPhase('regionSelect')}
              className="flex-[2] py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
            >
              <Icon.Scan /> 框选区域识别
            </button>
          </div>
        </>
      )}

      {/* ── RegionSelect phase ── */}
      {cameraPhase === 'regionSelect' && (
        <RegionSelector
          imageUrl={recognizedImageBase64 || capturedImageUrl}
          onConfirm={handleRegionsConfirm}
          onCancel={() => setCameraPhase('captured')}
        />
      )}

      {/* ── BatchResult phase(批量识别完成) ── */}
      {cameraPhase === 'batchResult' && recognizedData && (
        <>
          <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-slate-100">
            <button onClick={() => setCameraPhase('viewfinder')} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <Icon.Back />
            </button>
            <span className="text-slate-800 font-extrabold text-sm">识别完成</span>
            <div className="w-9" />
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3" style={{ background: '#F8FAFC' }}>
            <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
              <div className="text-5xl mb-3">{ocrSuccess ? '🎉' : '⚠️'}</div>
              <h2 className="font-extrabold text-slate-900 text-base mb-1">
                {ocrSuccess ? '全部识别成功' : '部分识别成功'}
              </h2>
              <p className="text-xs text-slate-500 font-bold">
                已自动录入 {pendingRegions.length} 道题到错题库
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-extrabold text-slate-700 mb-3">📋 录入明细</p>
              <LatexPreview
                text={recognizedData.textContent}
                className="text-xs text-slate-600 font-bold leading-relaxed"
              />
            </div>
          </div>

          <div className="bg-white px-4 pt-3 pb-10 flex gap-3 border-t border-slate-100">
            <button
              onClick={() => setCameraPhase('viewfinder')}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm"
            >
              再拍一组
            </button>
            <button
              onClick={handleAddToErrors}
              className="flex-[2] py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
            >
              ✓ 查看错题库
            </button>
          </div>
        </>
      )}

      {/* ── Recognizing phase ── */}
      {cameraPhase === 'recognizing' && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6 bg-[#F8FAFC]">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl" style={{ background: 'linear-gradient(135deg, #1E3A8A, #2563EB)' }}>
              🔍
            </div>
            <div className="absolute inset-0 rounded-3xl border-2 border-[#2563EB] animate-ping opacity-40" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-slate-800 font-extrabold text-lg">AI 正在识别题目</p>
            <p className="text-slate-400 text-sm font-bold">
              {recognizeProgress < 30 ? '图像预处理中…'
                : recognizeProgress < 60 ? 'OCR 文字提取中…'
                : recognizeProgress < 85 ? '知识点分类中…'
                : '生成解析报告…'}
            </p>
          </div>
          <div className="w-full">
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-150" style={{ width: `${recognizeProgress}%`, background: 'linear-gradient(90deg, #2563EB, #7C3AED)' }} />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-slate-400 text-[10px] font-bold">识别进度</span>
              <span className="text-slate-500 text-[10px] font-extrabold">{Math.round(recognizeProgress)}%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Result phase ── */}
      {cameraPhase === 'result' && recognizedData && (
        <>
          <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-slate-100">
            <button onClick={() => setCameraPhase('captured')} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
              <Icon.Back />
            </button>
            <span className="text-slate-800 font-extrabold text-sm">识别结果</span>
            <button onClick={() => setCameraPhase('captured')} className="text-slate-400 text-xs font-bold">重新识别</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3" style={{ background: '#F8FAFC' }}>
            <div className="relative rounded-2xl overflow-hidden bg-white shadow-sm" style={{ maxHeight: 200 }}>
              <img
                src={recognizedImageBase64 || capturedImageUrl}
                alt="captured"
                className="w-full h-full object-contain"
              />
              {existingHandwritingSvg && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  dangerouslySetInnerHTML={{ __html: existingHandwritingSvg }}
                />
              )}
              <div className="absolute top-3 right-3 bg-[#10B981] rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                <span className="text-white text-xs font-extrabold">识别成功</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-black" style={{ background: ocrSuccess ? '#10B981' : '#F59E0B' }}>
                      {ocrSuccess ? '✓' : '!'}
                    </div>
                    <span className="text-xs font-extrabold" style={{ color: ocrSuccess ? '#10B981' : '#F59E0B' }}>
                      {ocrSuccess ? '识别成功' : '请手动输入'}
                    </span>
                  </div>
                  <input
                    className="font-extrabold text-slate-900 text-sm w-full border-b border-dashed border-slate-200 pb-0.5 focus:border-[#2563EB] focus:outline-none transition-colors"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="点击输入题目标题…"
                  />
                </div>
                <span className="text-xs font-bold px-2 py-1 rounded-full bg-blue-50 text-blue-600">{recognizeSubject}</span>
              </div>

              <div className="rounded-xl p-3" style={{ background: '#F8FAFC' }}>
                <p className="text-[10px] font-extrabold text-slate-500 mb-1.5">📝 题目文字（可编辑）</p>
                <LatexPreview
                  text={editContent}
                  className="text-xs text-slate-700 font-bold leading-relaxed mb-2 p-2.5 rounded-lg border border-slate-100 bg-white"
                />
                <textarea
                  className="w-full text-xs text-slate-700 font-mono resize-none outline-none rounded-lg border border-slate-200 p-2.5"
                  rows={5}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="在这里输入或粘贴题目内容…"
                />
                <p className="text-[9px] text-slate-400 mt-1">支持 $行内公式$ 与 $$块级公式$$（KaTeX 渲染）</p>
              </div>

              <div>
                <p className="text-[10px] font-extrabold text-slate-400 mb-1.5">知识点标签</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-600">{recognizedData?.knowledgePoint || '未知'}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-extrabold text-slate-700 mb-2">科目确认（可修改）</p>
              <div className="flex flex-wrap gap-2">
                {(['数学', '物理', '化学', '语文', '英语', '生物'] as Subject[]).map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setRecognizeSubject(sub)}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border transition-all"
                    style={recognizeSubject === sub
                      ? { background: '#EFF6FF', color: '#2563EB', borderColor: '#BFDBFE' }
                      : { background: '#F8FAFC', color: '#94A3B8', borderColor: '#E2E8F0' }
                    }
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-extrabold text-slate-700 mb-2">错题备注（可选）</p>
              <textarea
                className="w-full text-sm text-slate-600 font-bold resize-none outline-none rounded-xl border border-slate-200 p-3"
                rows={2}
                placeholder="在这里记录你的解题思路或错误原因…"
              />
            </div>
          </div>

          <div className="bg-white px-4 pt-3 pb-10 flex gap-3 border-t border-slate-100">
            <button
              onClick={() => setCameraPhase('captured')}
              className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold text-sm"
            >
              再拍一题
            </button>
            <button
              onClick={handleAddToErrors}
              className="flex-[2] py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
            >
              ✓ 收入错题本
            </button>
          </div>
        </>
      )}
    </div>
  )
}
