/**
 * RegionSelector - 区域选择器
 *
 * 在拍照后插入的"框选识别区域"环节:
 *  - 用户可拖动矩形整体位置
 *  - 8 个手柄(4 角 + 4 边中点)缩放矩形
 *  - 支持添加/删除多个矩形(一次拍多题)
 *  - 默认 1 个全图矩形(等同"全图识别"行为,零学习成本)
 *  - 矩形按 [0,1] 比例存储 → 适配任意屏宽
 *
 * 交互使用 onTouchStart/Move/End + onMouseDown/Move/Up 双通道,
 * 保证 PC 调试和手机 WebView 都流畅。
 */
import React, { useRef, useState, useEffect, useCallback } from 'react'
import type { Region } from '@/utils/imageCrop'
import { clampRegion, regionArea } from '@/utils/imageCrop'

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'

interface Props {
  imageUrl: string
  initialRegions?: Region[]
  onConfirm: (regions: Region[]) => void
  onCancel: () => void
}

const MIN_RATIO = 0.04 // 最小矩形面积比(防止缩成点)

export default function RegionSelector({
  imageUrl,
  initialRegions,
  onConfirm,
  onCancel,
}: Props) {
  const [regions, setRegions] = useState<Region[]>(
    initialRegions && initialRegions.length > 0
      ? initialRegions
      : [{ x: 0, y: 0, w: 1, h: 1 }]
  )
  const [activeIdx, setActiveIdx] = useState(0)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // 拖拽状态(用 ref 避免 setState 抖动)
  const dragRef = useRef<{
    mode: DragMode
    startX: number
    startY: number
    startRegion: Region
    rectW: number
    rectH: number
  } | null>(null)

  // 同步区域尺寸信息显示(像素)
  const [pxSize, setPxSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    if (!imgRef.current) return
    const img = imgRef.current
    const r = regions[activeIdx] || regions[0]
    if (!r) return
    setPxSize({
      w: Math.round(r.w * img.naturalWidth),
      h: Math.round(r.h * img.naturalHeight),
    })
  }, [regions, activeIdx])

  const onImgLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const r = regions[activeIdx] || regions[0]
    if (!r) return
    setPxSize({
      w: Math.round(r.w * img.naturalWidth),
      h: Math.round(r.h * img.naturalHeight),
    })
  }, [regions, activeIdx])

  // ─── 拖拽实现 ──────────────────────────────────────────────────────────────
  const getRelativeXY = (clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const r = el.getBoundingClientRect()
    const x = (clientX - r.left) / r.width
    const y = (clientY - r.top) / r.height
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    }
  }

  const beginDrag = (mode: DragMode, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const point = 'touches' in e
      ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
      : { clientX: (e as React.MouseEvent).clientX, clientY: (e as React.MouseEvent).clientY }
    const el = containerRef.current
    const r = regions[activeIdx] || regions[0]
    if (!el || !r) return
    dragRef.current = {
      mode,
      startX: point.clientX,
      startY: point.clientY,
      startRegion: { ...r },
      rectW: el.getBoundingClientRect().width,
      rectH: el.getBoundingClientRect().height,
    }
  }

  const onMove = (e: MouseEvent | TouchEvent) => {
    if (!dragRef.current) return
    e.preventDefault()
    const point = 'touches' in e
      ? { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
      : { clientX: (e as MouseEvent).clientX, clientY: (e as MouseEvent).clientY }
    const { mode, startX, startY, startRegion, rectW, rectH } = dragRef.current
    const dx = (point.clientX - startX) / rectW
    const dy = (point.clientY - startY) / rectH

    let next = { ...startRegion }
    if (mode === 'move') {
      next = {
        x: startRegion.x + dx,
        y: startRegion.y + dy,
        w: startRegion.w,
        h: startRegion.h,
      }
    } else {
      // 手柄拖拽
      if (mode.includes('w')) {
        const newX = startRegion.x + dx
        const newW = startRegion.w - dx
        if (newW > MIN_RATIO) {
          next.x = newX
          next.w = newW
        } else {
          next.x = startRegion.x + startRegion.w - MIN_RATIO
          next.w = MIN_RATIO
        }
      }
      if (mode.includes('e')) {
        next.w = Math.max(MIN_RATIO, startRegion.w + dx)
      }
      if (mode.includes('n')) {
        const newY = startRegion.y + dy
        const newH = startRegion.h - dy
        if (newH > MIN_RATIO) {
          next.y = newY
          next.h = newH
        } else {
          next.y = startRegion.y + startRegion.h - MIN_RATIO
          next.h = MIN_RATIO
        }
      }
      if (mode.includes('s')) {
        next.h = Math.max(MIN_RATIO, startRegion.h + dy)
      }
    }
    next = clampRegion(next)
    setRegions((prev) => prev.map((r, i) => (i === activeIdx ? next : r)))
  }

  const onEnd = () => {
    dragRef.current = null
  }

  useEffect(() => {
    const moveHandler = (e: MouseEvent | TouchEvent) => onMove(e)
    const upHandler = () => onEnd()
    window.addEventListener('mousemove', moveHandler)
    window.addEventListener('mouseup', upHandler)
    window.addEventListener('touchmove', moveHandler, { passive: false })
    window.addEventListener('touchend', upHandler)
    return () => {
      window.removeEventListener('mousemove', moveHandler)
      window.removeEventListener('mouseup', upHandler)
      window.removeEventListener('touchmove', moveHandler)
      window.removeEventListener('touchend', upHandler)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIdx])

  // ─── 操作 ─────────────────────────────────────────────────────────────────
  const addRegion = () => {
    setRegions((prev) => {
      const N = prev.length
      // 错位堆叠新矩形:每加一个下移/右移 4%
      const offset = 0.04 * (N % 5)
      const w = 0.6
      const h = 0.2
      const newRegion = clampRegion({
        x: 0.2 + offset,
        y: 0.4 + offset,
        w,
        h,
      })
      return [...prev, newRegion]
    })
    setActiveIdx(regions.length)
  }

  const removeRegion = () => {
    if (regions.length <= 1) return
    setRegions((prev) => prev.filter((_, i) => i !== activeIdx))
    setActiveIdx((idx) => Math.max(0, Math.min(idx - 1, regions.length - 2)))
  }

  const resetRegions = () => {
    setRegions([{ x: 0, y: 0, w: 1, h: 1 }])
    setActiveIdx(0)
  }

  const confirm = () => {
    // 过滤过小区域
    const valid = regions.filter((r) => regionArea(r) >= MIN_RATIO * MIN_RATIO)
    if (valid.length === 0) {
      alert('请至少框选 1 个识别区域')
      return
    }
    onConfirm(valid)
  }

  // ─── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#0F172A]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-12 pb-3 z-10">
        <button
          onClick={onCancel}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="text-white font-extrabold text-sm">框选识别区域</div>
          <div className="text-white/60 text-[10px] mt-0.5">
            已框 {regions.length} 道题 · 第 {activeIdx + 1} 个
            {pxSize && ` · ${pxSize.w}×${pxSize.h}px`}
          </div>
        </div>
        <button
          onClick={resetRegions}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white text-xs"
          title="重置"
        >
          ↺
        </button>
      </div>

      {/* Image + Rectangles */}
      <div className="flex-1 flex items-center justify-center px-3 pb-3 min-h-0">
        <div
          ref={containerRef}
          className="relative max-h-full max-w-full select-none touch-none"
          style={{ touchAction: 'none' }}
        >
          <img
            ref={imgRef}
            src={imageUrl}
            alt="captured"
            onLoad={onImgLoad}
            draggable={false}
            className="block max-h-full max-w-full object-contain"
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
          />

          {/* 蒙层 + 矩形叠加 */}
          {regions.map((r, i) => {
            const isActive = i === activeIdx
            return (
              <RegionBox
                key={i}
                region={r}
                active={isActive}
                onSelect={() => setActiveIdx(i)}
                onBeginDrag={beginDrag}
              />
            )
          })}
        </div>
      </div>

      {/* 操作栏 */}
      <div className="bg-white/5 backdrop-blur px-4 pt-3 pb-8">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={addRegion}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#2563EB] px-4 py-2 rounded-xl active:scale-95 transition-transform"
          >
            <span className="text-base leading-none">+</span> 添加题目
          </button>

          {regions.length > 1 && (
            <button
              onClick={removeRegion}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-red-500/80 px-3 py-2 rounded-xl active:scale-95 transition-transform"
            >
              删除第 {activeIdx + 1} 个
            </button>
          )}
        </div>

        <button
          onClick={confirm}
          className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
        >
          ▶ 开始识别 {regions.length} 道题
        </button>
        <p className="text-center text-[10px] text-white/40 mt-2">
          提示:每个矩形拖中心移动,拖角/边缩放
        </p>
      </div>
    </div>
  )
}

// ─── 单个矩形 + 8 个手柄 ─────────────────────────────────────────────────────
function RegionBox({
  region,
  active,
  onSelect,
  onBeginDrag,
}: {
  region: Region
  active: boolean
  onSelect: () => void
  onBeginDrag: (mode: DragMode, e: React.MouseEvent | React.TouchEvent) => void
}) {
  const style: React.CSSProperties = {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.w * 100}%`,
    height: `${region.h * 100}%`,
    position: 'absolute',
    border: active ? '2px solid #2563EB' : '2px solid rgba(255,255,255,0.6)',
    boxShadow: active
      ? '0 0 0 9999px rgba(15, 23, 42, 0.45)'
      : '0 0 0 9999px rgba(15, 23, 42, 0.3)',
    cursor: 'move',
    zIndex: active ? 5 : 1,
  }

  return (
    <div
      style={style}
      onMouseDown={(e) => {
        onSelect()
        onBeginDrag('move', e)
      }}
      onTouchStart={(e) => {
        onSelect()
        onBeginDrag('move', e)
      }}
    >
      {/* 序号标签 */}
      <div
        className="absolute -top-7 left-0 px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white"
        style={{ background: active ? '#2563EB' : 'rgba(255,255,255,0.3)' }}
      >
        题目 {Math.round(region.x * 100) === 0 && region.w === 1 ? '全图' : ''}
      </div>

      {/* 8 个手柄 */}
      {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
        <Handle key={corner} corner={corner} active={active} onBeginDrag={onBeginDrag} />
      ))}
      {(['n', 's', 'w', 'e'] as const).map((edge) => (
        <Handle key={edge} edge={edge} active={active} onBeginDrag={onBeginDrag} />
      ))}
    </div>
  )
}

function Handle({
  corner,
  edge,
  active,
  onBeginDrag,
}: {
  corner?: 'nw' | 'ne' | 'sw' | 'se'
  edge?: 'n' | 's' | 'w' | 'e'
  active: boolean
  onBeginDrag: (mode: DragMode, e: React.MouseEvent | React.TouchEvent) => void
}) {
  if (corner) {
    const pos: React.CSSProperties = {
      position: 'absolute',
      width: 22,
      height: 22,
      background: '#2563EB',
      border: '2px solid #fff',
      borderRadius: 4,
      transform:
        corner === 'nw' ? 'translate(-50%, -50%)'
        : corner === 'ne' ? 'translate(50%, -50%)'
        : corner === 'sw' ? 'translate(-50%, 50%)'
        : 'translate(50%, 50%)',
      ...(corner === 'nw' ? { left: 0, top: 0 } : {}),
      ...(corner === 'ne' ? { right: 0, top: 0 } : {}),
      ...(corner === 'sw' ? { left: 0, bottom: 0 } : {}),
      ...(corner === 'se' ? { right: 0, bottom: 0 } : {}),
    }
    const cursor =
      corner === 'nw' || corner === 'se' ? 'nwse-resize'
      : 'nesw-resize'
    return (
      <div
        style={{ ...pos, cursor }}
        onMouseDown={(e) => {
          e.stopPropagation()
          onBeginDrag(corner, e)
        }}
        onTouchStart={(e) => {
          e.stopPropagation()
          onBeginDrag(corner, e)
        }}
      />
    )
  }

  if (edge) {
    const pos: React.CSSProperties = {
      position: 'absolute',
      background: active ? '#2563EB' : 'transparent',
      ...(edge === 'n' ? { left: '25%', right: '25%', top: 0, height: 8, transform: 'translateY(-50%)' } : {}),
      ...(edge === 's' ? { left: '25%', right: '25%', bottom: 0, height: 8, transform: 'translateY(50%)' } : {}),
      ...(edge === 'w' ? { top: '25%', bottom: '25%', left: 0, width: 8, transform: 'translateX(-50%)' } : {}),
      ...(edge === 'e' ? { top: '25%', bottom: '25%', right: 0, width: 8, transform: 'translateX(50%)' } : {}),
    }
    const cursor =
      edge === 'n' || edge === 's' ? 'ns-resize' : 'ew-resize'
    return (
      <div
        style={{ ...pos, cursor }}
        onMouseDown={(e) => {
          e.stopPropagation()
          onBeginDrag(edge, e)
        }}
        onTouchStart={(e) => {
          e.stopPropagation()
          onBeginDrag(edge, e)
        }}
      />
    )
  }

  return null
}