/**
 * SplitPageScreen — 跨页拍题容器
 *
 * 用户流程:
 *   idle        → 拍照 → firstReady   (已拍第 1 张,等待第 2 张)
 *   firstReady  → 拍照 → aligning     (进入对齐模式)
 *   aligning    → 拖滑块 → 实时预览拼接结果
 *   aligning    → 「确认拼接」→ onComplete(stitchedDataUrl, 2)
 *   aligning    → 「重拍第 X 张」→ 回 idle
 *   任意阶段     → 「取消」→ onCancel()
 *
 * 数据流:
 *   拍照 → preprocessImage (maxDim=1600, q=0.82) → stitchImagesVertically
 *   → onComplete 回调 → CameraScreen 把拼接图塞回 capturedImageUrl → regionSelect
 */
import React, { useRef, useState, useEffect } from 'react'
import { Icon } from '@/components/Icons'
import { preprocessImage } from '@/utils/imagePreprocess'
import { stitchImagesVertically } from '@/utils/imageStitch'
import 'katex/dist/katex.min.css'

type SplitPhase = 'idle' | 'firstReady' | 'aligning' | 'confirmed'

interface Props {
  onComplete: (stitchedDataUrl: string, pageCount: number) => void
  onCancel: () => void
  /** 透传给 preprocessImage；缺省走 imagePreprocess 默认值 */
  preprocessOpts?: { maxDim?: number; jpegQuality?: number }
}

const DROP_TOP_RATIO_MAX = 0.6

export default function SplitPageScreen({ onComplete, onCancel, preprocessOpts }: Props) {
  const [phase, setPhase] = useState<SplitPhase>('idle')
  const [img1Url, setImg1Url] = useState<string>('')
  const [img2Url, setImg2Url] = useState<string>('')
  const [dropTopRatio, setDropTopRatio] = useState(0.15)
  const [stitchedUrl, setStitchedUrl] = useState<string>('')
  const [stitching, setStitching] = useState(false)
  const [stitchError, setStitchError] = useState<string>('')

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  // 拍第几张？由 phase 决定
  const isTakingFirst = phase === 'idle'
  const isTakingSecond = phase === 'firstReady'

  const handlePickFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      if (phase === 'idle') {
        setImg1Url(url)
        setPhase('firstReady')
      } else if (phase === 'firstReady') {
        setImg2Url(url)
        setPhase('aligning')
      }
    }
    reader.readAsDataURL(file)
  }

  // 切到 aligning 时立即算一次拼接结果（默认 dropTopRatio=0.15）
  useEffect(() => {
    if (phase !== 'aligning' || !img1Url || !img2Url) return
    let cancelled = false
    setStitching(true)
    setStitchError('')
    ;(async () => {
      try {
        // 1) 先预处理两张图（避免 10MB JSON 闸）
        const [p1, p2] = await Promise.all([
          preprocessImage(img1Url, preprocessOpts).catch(() => img1Url),
          preprocessImage(img2Url, preprocessOpts).catch(() => img2Url),
        ])
        if (cancelled) return
        // 2) 拼接
        const stitched = await stitchImagesVertically(p1, p2, { dropTopRatio })
        if (!cancelled) {
          setStitchedUrl(stitched)
          setStitching(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setStitchError(err.message || '拼接失败')
          setStitching(false)
        }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, img1Url, img2Url])

  // 滑块变动 → 重算拼接
  useEffect(() => {
    if (phase !== 'aligning' || !img1Url || !img2Url) return
    let cancelled = false
    setStitching(true)
    ;(async () => {
      try {
        const [p1, p2] = await Promise.all([
          preprocessImage(img1Url, preprocessOpts).catch(() => img1Url),
          preprocessImage(img2Url, preprocessOpts).catch(() => img2Url),
        ])
        if (cancelled) return
        const stitched = await stitchImagesVertically(p1, p2, { dropTopRatio })
        if (!cancelled) {
          setStitchedUrl(stitched)
          setStitching(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setStitchError(err.message || '拼接失败')
          setStitching(false)
        }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropTopRatio])

  const handleConfirm = () => {
    if (!stitchedUrl) return
    setPhase('confirmed')
    onComplete(stitchedUrl, 2)
  }

  const handleRetakeFirst = () => {
    setImg1Url('')
    setImg2Url('')
    setStitchedUrl('')
    setStitchError('')
    setPhase('idle')
  }

  const handleRetakeSecond = () => {
    setImg2Url('')
    setStitchedUrl('')
    setStitchError('')
    setPhase('firstReady')
  }

  // ─── UI ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* 隐藏文件输入 */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handlePickFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handlePickFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-slate-100 shrink-0">
        <button onClick={onCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
          <Icon.Back />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-slate-800 font-extrabold text-sm">📄 跨页拍题</span>
          <span className="text-[10px] text-slate-400 font-bold mt-0.5">
            {phase === 'idle' && '步骤 1/2 · 拍题目上半部分'}
            {phase === 'firstReady' && '步骤 2/2 · 拍题目下半部分'}
            {phase === 'aligning' && '✓ 已拍 2 张 — 拖动滑块调整对齐'}
            {phase === 'confirmed' && '✓ 拼接完成 — 即将进入框选'}
          </span>
        </div>
        <div className="w-9" />
      </div>

      {/* 主体 */}
      {phase === 'idle' && (
        <CapturePrompt
          title="拍第 1 张（题目上半）"
          hint="清晰拍下题目上半部分，底部可与下一张重叠"
          cameraInputRef={cameraInputRef}
          galleryInputRef={galleryInputRef}
        />
      )}

      {phase === 'firstReady' && (
        <>
          <div className="px-4 py-3 bg-white">
            <p className="text-[11px] text-emerald-600 font-bold mb-2">✓ 第 1 张已拍</p>
            <div className="rounded-xl overflow-hidden bg-slate-100" style={{ maxHeight: '32vh' }}>
              <img src={img1Url} alt="第 1 张" className="w-full object-contain" />
            </div>
          </div>
          <CapturePrompt
            title="拍第 2 张（题目下半）"
            hint="把题本底部内容拍下，确保与第 1 张底部有重叠"
            cameraInputRef={cameraInputRef}
            galleryInputRef={galleryInputRef}
            onRetake={handleRetakeFirst}
            retakeLabel="重拍第 1 张"
          />
        </>
      )}

      {phase === 'aligning' && (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* 第 1 张预览 */}
            <div>
              <p className="text-[11px] text-slate-500 font-extrabold mb-1.5">📷 第 1 张</p>
              <div className="rounded-xl overflow-hidden bg-slate-100" style={{ maxHeight: '20vh' }}>
                <img src={img1Url} alt="第 1 张" className="w-full object-contain" />
              </div>
            </div>

            {/* 第 2 张预览 */}
            <div>
              <p className="text-[11px] text-slate-500 font-extrabold mb-1.5">📷 第 2 张</p>
              <div className="rounded-xl overflow-hidden bg-slate-100" style={{ maxHeight: '20vh' }}>
                <img src={img2Url} alt="第 2 张" className="w-full object-contain" />
              </div>
            </div>

            {/* 滑块 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-extrabold text-slate-700 mb-1">对齐滑块</p>
              <p className="text-[10px] text-slate-500 mb-3">
                拖动滑块，裁掉第 2 张顶部 <b>{Math.round(dropTopRatio * 100)}%</b>，让两图自然衔接
              </p>
              <input
                type="range"
                min={0}
                max={DROP_TOP_RATIO_MAX}
                step={0.01}
                value={dropTopRatio}
                onChange={(e) => setDropTopRatio(parseFloat(e.target.value))}
                className="w-full accent-[#2563EB]"
              />
              <div className="flex justify-between mt-1 text-[10px] text-slate-400 font-bold">
                <span>0%</span><span>30%</span><span>60%</span>
              </div>
            </div>

            {/* 拼接结果预览 */}
            <div className="bg-white rounded-2xl p-3 shadow-sm">
              <p className="text-xs font-extrabold text-slate-700 mb-2 flex items-center justify-between">
                <span>🧩 拼接预览</span>
                {stitching && <span className="text-[10px] text-blue-500">计算中…</span>}
              </p>
              {stitchError ? (
                <p className="text-xs text-red-500 font-bold p-3 bg-red-50 rounded-lg">⚠️ {stitchError}</p>
              ) : (
                <div className="rounded-lg overflow-hidden bg-slate-100" style={{ maxHeight: '40vh' }}>
                  {stitchedUrl && (
                    <img src={stitchedUrl} alt="拼接预览" className="w-full object-contain" />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 底部按钮 */}
          <div className="bg-white px-4 pt-3 pb-10 flex gap-2 border-t border-slate-100">
            <button
              onClick={handleRetakeSecond}
              className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs"
            >
              重拍第 2 张
            </button>
            <button
              onClick={handleRetakeFirst}
              className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-600 font-bold text-xs"
            >
              重拍第 1 张
            </button>
            <button
              onClick={handleConfirm}
              disabled={!stitchedUrl || stitching}
              className="flex-[2] py-3 rounded-2xl text-white font-extrabold text-sm disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #2563EB, #7C3AED)' }}
            >
              ✓ 确认拼接
            </button>
          </div>
        </>
      )}

      {phase === 'confirmed' && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-500 font-bold">✓ 拼接完成，即将进入框选…</p>
        </div>
      )}
    </div>
  )
}

// 拍图按钮组
interface CapturePromptProps {
  title: string
  hint: string
  cameraInputRef: React.RefObject<HTMLInputElement | null>
  galleryInputRef: React.RefObject<HTMLInputElement | null>
  onRetake?: () => void
  retakeLabel?: string
}

function CapturePrompt({ title, hint, cameraInputRef, galleryInputRef, onRetake, retakeLabel }: CapturePromptProps) {
  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center px-8 gap-4">
        <div className="text-6xl">📄</div>
        <h2 className="font-extrabold text-slate-900 text-lg">{title}</h2>
        <p className="text-xs text-slate-500 font-bold text-center max-w-xs">{hint}</p>
      </div>
      <div className="px-6 pt-6 pb-10 flex items-center justify-between">
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-200 flex items-center justify-center bg-white"
        >
          <Icon.ImagePick />
        </button>
        <button
          onClick={() => cameraInputRef.current?.click()}
          className="w-20 h-20 rounded-full border-4 border-slate-300 flex items-center justify-center active:scale-90 transition-transform"
        >
          <div className="w-16 h-16 rounded-full bg-slate-200" />
        </button>
        <button
          onClick={() => galleryInputRef.current?.click()}
          className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center"
        >
          <span className="text-xs font-bold text-slate-600">相册</span>
        </button>
      </div>
      {onRetake && (
        <div className="px-6 pb-10 -mt-6">
          <button
            onClick={onRetake}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs"
          >
            {retakeLabel || '重拍'}
          </button>
        </div>
      )}
    </>
  )
}