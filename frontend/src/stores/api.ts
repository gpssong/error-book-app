/**
 * API 层 - 封装所有后端接口调用
 * 自动检测运行环境：本地开发、内网 WebView、外网域名访问
 *
 * 自动注入 Authorization: Bearer <token>
 * 401 响应时自动清除 token 并触发登录页跳转
 */
import { auth, emitAuthRequired } from './auth'

function getApiBase(): string {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  // 如果是 Capacitor WebView（file:// 或 capacitor:// 协议）
  const protocol = window.location.protocol
  if (protocol === 'file:' || protocol === 'capacitor:') {
    // 容器内直连外网域名（手机 4G 也能访问）
    return 'http://error.93gushi.com:4040'
  }
  // 如果在服务器上通过 nginx 访问
  const host = window.location.hostname
  if (host === 'error.93gushi.com') return `http://${host}:4040`
  // 默认内网地址（开发调试）
  return 'http://192.168.0.14:3001'
}
const BASE_URL = getApiBase()
console.log(`[API] BASE_URL=${BASE_URL}`)

// ─── 全局配置缓存（来自 /api/config，替代 localStorage eb_keys）────────────────
let _configCache: { keys: Array<{ category: string; provider: string; current: boolean; enabled: boolean; appId?: string; secretCode?: string }> } | null = null
// 启动时预取，保证 OCR 请求发出前数据就绪
fetch(`${BASE_URL}/api/config`)
  .then(r => r.json())
  .then((d: any) => { _configCache = d })
  .catch(() => {})
export function getConfigKeys() { return _configCache?.keys ?? [] }

export interface Child {
  id: string
  name: string
  avatar: string
  grade: string
  color: string
  errorCount: number
  weeklyCount: number
  masteredCount: number
  createdAt: string
}

export type Subject = '数学' | '语文' | '英语' | '物理' | '化学' | '生物'

export interface SimilarQuestion {
  id: string
  content: string
  answer: string
  answerFolded?: boolean
}

export interface ErrorItem {
  id: string
  childId: string
  subject: Subject
  title: string
  knowledgePoint: string
  date: string
  imageUrl: string
  imageBase64?: string
  textContent?: string
  handwritingSvg?: string
  isFavorite: boolean
  wrongCount: number
  aiAnalyzed?: boolean
  aiAnalysis?: {
    mistakeReason: string
    knowledgeExplained: string
    stepByStepGuide: string
    answer?: string
    analyzedAt: string | null
  }
  similarQuestions?: SimilarQuestion[]
  createdAt: string
  updatedAt: string
}

export interface AIAnalysisResult {
  mistakeReason: string
  knowledgeExplained: string
  stepByStepGuide: string
  answer?: string
}

// ─── 订阅类型 ─────────────────────────────────────────────────────────────────
export interface SubscriptionLimits {
  ocr:          { limit: number; used: number; remaining: number }
  ai_analyze:   { limit: number; used: number; remaining: number }
  ai_similar:   { limit: number; used: number; remaining: number }
}

export interface SubscriptionInfo {
  plan: 'free' | 'pro' | 'family'
  expiresAt: string | null
  childrenCount: number
  limits: SubscriptionLimits
  isPaid: boolean
}

export interface PaywallError {
  error: string
  action: 'ocr' | 'ai_analyze' | 'ai_similar'
  limit: number
  used: number
  remaining: number
  message: string
  plan: 'free' | 'pro' | 'family'
}

// ─── 402 事件 ─────────────────────────────────────────────────────────────────
export const PAYWALL_EVENT = 'error-book:paywall'
export function emitPaywall(data: PaywallError) {
  window.dispatchEvent(new CustomEvent(PAYWALL_EVENT, { detail: data }))
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  }
  const token = auth.getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}/api${path}`, { ...options, headers })

  // 401 → token 失效或未登录，跳登录页
  if (res.status === 401) {
    auth.clear()
    const err = await res.json().catch(() => ({ error: '未登录' }))
    emitAuthRequired()
    throw new Error(err.error || '请先登录')
  }

  // 402 → 付费墙触发
  if (res.status === 402) {
    const data = await res.json().catch(() => ({})) as PaywallError
    emitPaywall(data)
    throw new Error(data.message || '额度已用完')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

const api = {
  // ─── 孩子管理 ───────────────────────────────────────────────────────────────
  getChildren: () => request<Child[]>('/children'),
  createChild: (data: Partial<Child>) => request<Child>('/children', { method: 'POST', body: JSON.stringify(data) }),
  updateChild: (id: string, data: Partial<Child>) => request<Child>(`/children/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteChild: (id: string) => request<{ deleted: boolean }>(`/children/${id}`, { method: 'DELETE' }),

  // ─── 错题管理 ───────────────────────────────────────────────────────────────
  getErrors: (params?: { childId?: string; subject?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return request<ErrorItem[]>(`/errors${qs ? `?${qs}` : ''}`)
  },
  getError: (id: string) => request<ErrorItem>(`/errors/${id}`),
  createError: (data: Partial<ErrorItem>) => request<ErrorItem>('/errors', { method: 'POST', body: JSON.stringify(data) }),
  updateError: (id: string, data: Partial<ErrorItem>) =>
    request<ErrorItem>(`/errors/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteError: (id: string) => request<{ deleted: boolean }>(`/errors/${id}`, { method: 'DELETE' }),
  batchDeleteErrors: (ids: string[]) => request<{ deleted: number }>('/errors/batch-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  }),
  clearHandwriting: (id: string) =>
    request<ErrorItem>(`/errors/${id}/handwriting`, { method: 'PATCH', body: JSON.stringify({ clear: true }) }),
  saveAiAnalysis: (id: string, data: { mistakeReason: string; knowledgeExplained: string; stepByStepGuide: string; answer?: string; similarQuestions?: SimilarQuestion[] }) =>
    request<ErrorItem>(`/errors/${id}/ai-analysis`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ─── AI 服务 ────────────────────────────────────────────────────────────────
  analyzeError: (data: { title: string; knowledgePoint: string; subject: string; textContent?: string; childId?: string }) =>
    request<AIAnalysisResult>('/ai/analyze', { method: 'POST', body: JSON.stringify(data) }),
  generateSimilar: (data: { title: string; knowledgePoint: string; subject: string; difficulty?: string; childId?: string }) =>
    request<{ questions: SimilarQuestion[] }>('/ai/similar', { method: 'POST', body: JSON.stringify(data) }),
  generateRandom: (data: { subject: string; grade?: string; childId?: string }) =>
    request<{ questions: SimilarQuestion[] }>('/ai/random', { method: 'POST', body: JSON.stringify(data) }),

  // ─── 图片上传 ───────────────────────────────────────────────────────────────
  uploadBase64: (data: { data: string; filename?: string }) =>
    request<{ url: string }>('/upload/base64', { method: 'POST', body: JSON.stringify(data) }),

  // ─── 题目 OCR 识别 ───────────────────────────────────────────────────────────
  recognizeQuestion: (data: { imageBase64: string; subject?: string }) => {
    // 从后端缓存读取当前启用的 TextIn key（已预取，无竞态）
    const extraHeaders: Record<string, string> = {}
    try {
      const textin = getConfigKeys().find((k) => k.category === 'ocr' && k.provider === 'textin' && k.current && k.enabled)
      if (textin && textin.appId && textin.secretCode) {
        extraHeaders['X-TextIn-App-Id'] = textin.appId
        extraHeaders['X-TextIn-Secret-Code'] = textin.secretCode
      }
    } catch { /* 忽略 */ }
    return request<{ title: string; knowledgePoint: string; textContent: string }>('/ocr', {
      method: 'POST',
      headers: extraHeaders,
      body: JSON.stringify(data),
    })
  },

  // ─── 订阅管理 ────────────────────────────────────────────────────────────────
  subscription: {
    getMe: () => request<SubscriptionInfo>('/subscription/me'),
    upgrade: (data: { plan: 'pro' | 'family'; payMethod: string; screenshotUrl?: string }) =>
      request<{ success: boolean; plan: string; message: string }>('/subscription/upgrade', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },

  // ─── 认证 ─────────────────────────────────────────────────────────────────────
  // 注意：register/login 不走统一的 request()（不带 token，且 200 而非 401 处理）
  auth: {
    async register(data: { username: string; email: string; password: string; displayName?: string }) {
      const res = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || '注册失败')
      return body as { token: string; user: { id: string; username: string; email: string; displayName: string; isAdmin?: boolean } }
    },
    async login(data: { account: string; password: string }) {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || '登录失败')
      return body as { token: string; user: { id: string; username: string; email: string; displayName: string; isAdmin?: boolean } }
    },
    async me() {
      const token = auth.getToken()
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('未登录')
      return res.json() as Promise<{ id: string; username: string; email: string; displayName: string; isAdmin?: boolean }>
    },
    async updateMe(data: { displayName?: string; oldPassword?: string; newPassword?: string }) {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(auth.getToken() ? { Authorization: `Bearer ${auth.getToken()}` } : {}) },
        body: JSON.stringify(data),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || '更新失败')
      return body as { id: string; username: string; email: string; displayName: string }
    },
  },
}

export default api
