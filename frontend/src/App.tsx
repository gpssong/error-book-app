/**
 * App.tsx - 主应用入口
 * 整合所有屏幕组件，处理路由和状态管理
 */
import React, { useState, useMemo } from 'react'
import { AppProvider, useApp } from './stores/AppContext'
import DashboardScreen from './components/DashboardScreen'
import ErrorListScreen from './components/ErrorListScreen'
import ErrorDetailScreen from './components/ErrorDetailScreen'
import ChildManageScreen from './components/ChildManageScreen'
import PrintPreviewScreen from './components/PrintPreviewScreen'
import CameraScreen from './components/CameraScreen'
import { Icon } from './components/Icons'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'

function AppContent() {
  const { children, activeChildId, activeChild } = useApp()
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null)
  const [navActive, setNavActive] = useState<'home' | 'list' | 'ai' | 'profile'>('home')

  const goTo = (s: Screen, errorId?: string) => {
    if (errorId) setSelectedErrorId(errorId)
    setScreen(s)
  }

  const navItems = [
    { key: 'home' as const, label: '首页', icon: <Icon.Home />, screen: 'dashboard' as Screen },
    { key: 'list' as const, label: '错题', icon: <Icon.List />, screen: 'errorList' as Screen },
    { key: 'ai' as const, label: 'AI练习', icon: <Icon.AI />, screen: 'errorList' as Screen },
    { key: 'profile' as const, label: '孩子', icon: <Icon.Person />, screen: 'childManage' as Screen },
  ]

  const BottomNav = () => (
    <div className="flex items-center bg-white border-t border-slate-100" style={{ paddingBottom: 'env(safe-area-inset-bottom, 8px)' }}>
      {navItems.map((item) => (
        <button
          key={item.key}
          onClick={() => { setNavActive(item.key); goTo(item.screen); }}
          className="flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors"
          style={{ color: navActive === item.key ? '#2563EB' : '#94A3B8' }}
        >
          {item.icon}
          <span className="text-[10px] font-bold">{item.label}</span>
        </button>
      ))}
    </div>
  )

  // 根据当前屏幕决定渲染内容和是否显示底部导航
  const showNav = !['errorDetail', 'camera'].includes(screen)

  return (
    <div className="flex flex-col" style={{ height: '100%' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        {screen === 'dashboard' && (
          <DashboardScreen onNavigate={goTo} />
        )}
        {screen === 'errorList' && <ErrorListScreen onNavigate={goTo} />}
        {screen === 'errorDetail' && selectedErrorId && (
          <ErrorDetailScreen onErrorId={goTo} errorId={selectedErrorId} />
        )}
        {screen === 'childManage' && <ChildManageScreen onNavigate={goTo} />}
        {screen === 'printPreview' && <PrintPreviewScreen onNavigate={goTo} />}
        {screen === 'camera' && <CameraScreen onNavigate={goTo} />}
      </div>
      {showNav && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
