/**
 * API 层 - 封装所有后端接口调用
 * 自动检测运行环境：本地开发、内网 WebView、外网域名访问
 */
function getApiBase(): string {
  // 优先使用环境变量
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
  // 如果是 Capacitor WebView（file:// 或 capacitor:// 协议）
  const protocol = window.location.protocol
  if (protocol === 'file:' || protocol === 'capacitor:') return 'http://192.168.0.14:3001'
  // 如果在服务器上通过 nginx 访问
  const host = window.location.hostname
  if (host === 'error.93gushi.com') return `http://${host}:4040`
  // 默认内网地址
  return 'http://192.168.0.14:3001'
}
const BASE_URL = getApiBase()
console.log(`[API] BASE_URL=${BASE_URL}`)

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
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
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
  saveAiAnalysis: (id: string, data: { mistakeReason: string; knowledgeExplained: string; stepByStepGuide: string; similarQuestions?: SimilarQuestion[] }) =>
    request<ErrorItem>(`/errors/${id}/ai-analysis`, { method: 'PATCH', body: JSON.stringify(data) }),

  // ─── AI 服务 ────────────────────────────────────────────────────────────────
  analyzeError: (data: { title: string; knowledgePoint: string; subject: string; textContent?: string }) =>
    request<AIAnalysisResult>('/ai/analyze', { method: 'POST', body: JSON.stringify(data) }),
  generateSimilar: (data: { title: string; knowledgePoint: string; subject: string; difficulty?: string }) =>
    request<{ questions: SimilarQuestion[] }>('/ai/similar', { method: 'POST', body: JSON.stringify(data) }),

  // ─── 图片上传 ───────────────────────────────────────────────────────────────
  uploadBase64: (data: { data: string; filename?: string }) =>
    request<{ url: string }>('/upload/base64', { method: 'POST', body: JSON.stringify(data) }),

  // ─── 题目 OCR 识别 ───────────────────────────────────────────────────────────
  recognizeQuestion: (data: { imageBase64: string; subject?: string }) =>
    request<{ title: string; knowledgePoint: string; textContent: string }>('/ocr', { method: 'POST', body: JSON.stringify(data) }),
}

export default api
