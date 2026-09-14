/**
 * 认证状态管理
 * - 持久化 token + user 到 localStorage
 * - v38: 同时双写 Capacitor native (SharedPreferences),系统回收 WebView 本地存储后仍能回填
 * - api.ts 调用时自动带 Authorization 头
 * - 401 自动清空并跳登录页
 */
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const TOKEN_KEY = 'error_book_token'
const USER_KEY = 'error_book_user'
// native 侧 key(SharedPreferences,永不回收)
const NATIVE_TOKEN_KEY = 'native_token'
const NATIVE_USER_KEY = 'native_user'

export interface AuthUser {
  id: string
  username: string
  email: string
  displayName: string
  isAdmin?: boolean
}

/** 是否在 Capacitor native 环境(App 内);Preferences 调用全部 catch 兜底 */
const hasPreferences = Capacitor.isNativePlatform()

export const auth = {
  getToken(): string | null {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  getUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(USER_KEY)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  },
  setSession(token: string, user: AuthUser) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    // native 双写(永不回收)
    if (hasPreferences) {
      Preferences.set({ key: NATIVE_TOKEN_KEY, value: token }).catch(() => {})
      Preferences.set({ key: NATIVE_USER_KEY, value: JSON.stringify(user) }).catch(() => {})
    }
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    if (hasPreferences) {
      Preferences.remove({ key: NATIVE_TOKEN_KEY }).catch(() => {})
      Preferences.remove({ key: NATIVE_USER_KEY }).catch(() => {})
    }
  },
  isLoggedIn(): boolean {
    return !!this.getToken()
  },
  /**
   * v38: 启动时调用。若 localStorage 里 token 丢了但 native 还存着,
   * 从 native 回填,避免"每次退出重登"。返回 true 表示成功回填。
   */
  async restoreFromNative(): Promise<boolean> {
    if (this.getToken()) return true // 已有 token,无需回填
    if (!hasPreferences) return false
    try {
      const [t, u] = await Promise.all([
        Preferences.get({ key: NATIVE_TOKEN_KEY }),
        Preferences.get({ key: NATIVE_USER_KEY }),
      ])
      if (t.value && u.value) {
        localStorage.setItem(TOKEN_KEY, t.value)
        localStorage.setItem(USER_KEY, u.value)
        console.log('[auth] token 从 native 回填成功')
        return true
      }
    } catch { /* native 读取失败,保持登录页 */ }
    return false
  },
}

/**
 * 触发"需要登录"事件，App.tsx 监听后切到登录页
 */
export const AUTH_EVENT = 'error-book:auth-required'
/**
 * v24: 登录成功事件 - AppContext 监听后重新加载数据
 * (AUTH_EVENT 是"401/需登录",与"刚登录成功"语义相反,不能复用)
 */
export const LOGIN_SUCCESS_EVENT = 'error-book:login-success'
export function emitAuthRequired() {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT))
}
export function emitLoginSuccess() {
  window.dispatchEvent(new CustomEvent(LOGIN_SUCCESS_EVENT))
}