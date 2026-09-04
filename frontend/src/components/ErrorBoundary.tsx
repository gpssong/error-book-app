/**
 * 全局错误边界
 *
 * 当任意子组件抛错时显示兜底页面，避免整应用白屏。
 * 提供"刷新"按钮可尝试恢复。
 */
import React from 'react'

interface Props {
  children: React.ReactNode
}
interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-50 px-6"
          style={{ fontFamily: "'Nunito', sans-serif" }}>
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-lg font-extrabold text-slate-800 mb-2">页面开小差了</h2>
          <p className="text-sm text-slate-500 text-center mb-6">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl text-white font-bold text-sm"
            style={{ background: '#2563EB' }}
          >
            刷新页面
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
