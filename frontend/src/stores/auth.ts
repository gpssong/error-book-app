/**
 * 认证状态管理
 * - 持久化 token + user 到 localStorage
 * - api.ts 调用时自动带 Authorization 头
 * - 401 自动清空并跳登录页
 */
const TOKEN_KEY = 'error_book_token'
const USER_KEY = 'error_book_user'

export interface AuthUser {
  id: string
  username: string
  email: string
  displayName: string
}

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
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
  isLoggedIn(): boolean {
    return !!this.getToken()
  },
}

/**
 * 触发"需要登录"事件，App.tsx 监听后切到登录页
 */
export const AUTH_EVENT = 'error-book:auth-required'
export function emitAuthRequired() {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT))
}