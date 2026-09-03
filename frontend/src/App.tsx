/**
 * App.tsx - 主应用入口
 * 整合所有屏幕组件，处理路由和状态管理
 *
 * 启动流程：
 * 1. 检查 localStorage 有无 token
 *    - 有 → 加载数据进入主界面
 *    - 无 → 显示登录/注册页
 * 2. 任意 API 返回 401 时,通过 emitAuthRequired 自动跳回登录页
 */
import React, { useState, useEffect, useMemo } from 'react'
import { AppProvider, useApp } from './stores/AppContext'
import DashboardScreen from './components/DashboardScreen'
import ErrorListScreen from './components/ErrorListScreen'
import ErrorDetailScreen from './components/ErrorDetailScreen'
import ChildManageScreen from './components/ChildManageScreen'
import PrintPreviewScreen from './components/PrintPreviewScreen'
import CameraScreen from './components/CameraScreen'
import LoginScreen from './components/LoginScreen'
import RegisterScreen from './components/RegisterScreen'
import { Icon } from './components/Icons'
import { auth, AUTH_EVENT } from './stores/auth'

type Screen = 'dashboard' | 'childManage' | 'errorList' | 'errorDetail' | 'printPreview' | 'camera'
type AuthScreen = 'login' | 'register'

function AppContent() {
  const { children, activeChildId, activeChild } = useApp()
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null)
  const [navActive, setNavActive] = useState<'home' | 'list' | 'ai' | 'profile'>('home')

  // 登录状态
  const [loggedIn, setLoggedIn] = useState(auth.isLoggedIn())
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login')

  // 监听 401 事件，自动跳登录页
  useEffect(() => {
    const handler = () => {
      setLoggedIn(false)
      setAuthScreen('login')
    }
    window.addEventListener(AUTH_EVENT, handler)
    return () => window.removeEventListener(AUTH_EVENT, handler)
  }, [])

  const handleLoginSuccess = () => setLoggedIn(true)
  const handleGotoRegister = () => setAuthScreen('register')
  const handleGotoLogin = () => setAuthScreen('login')

  // 未登录：渲染登录/注册
  if (!loggedIn) {
    return authScreen === 'login' ? (
      <LoginScreen onSuccess={handleLoginSuccess} onGotoRegister={handleGotoRegister} />
    ) : (
      <RegisterScreen onSuccess={handleLoginSuccess} onGotoLogin={handleGotoLogin} />
    )
  }

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
