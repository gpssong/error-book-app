/**
 * 全局状态管理 - 使用 React Context + useReducer
 *
 * 状态包括：
 * - children: 所有孩子档案
 * - activeChildId: 当前选中的孩子 ID
 * - errors: 错题列表（按当前孩子过滤）
 * - loading / error: 加载状态
 *
 * 所有数据变更都会触发对应组件重新渲染
 */
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'
import api, { Child, ErrorItem } from './api'

// ─── 状态类型 ─────────────────────────────────────────────────────────────────
interface AppState {
  children: Child[]
  activeChildId: string
  errors: ErrorItem[]
  loading: boolean
  error: string | null
}

type Action =
  | { type: 'SET_CHILDREN'; payload: Child[] }
  | { type: 'ADD_CHILD'; payload: Child }
  | { type: 'UPDATE_CHILD'; payload: Child }
  | { type: 'DELETE_CHILD'; payload: string }
  | { type: 'SET_ACTIVE_CHILD'; payload: string }
  | { type: 'SET_ERRORS'; payload: ErrorItem[] }
  | { type: 'ADD_ERROR'; payload: ErrorItem }
  | { type: 'UPDATE_ERROR'; payload: ErrorItem }
  | { type: 'DELETE_ERROR'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }

// ─── Reducer ──────────────────────────────────────────────────────────────────
const initialState: AppState = {
  children: [],
  activeChildId: '',
  errors: [],
  loading: false,
  error: null,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_CHILDREN':
      return { ...state, children: action.payload }
    case 'ADD_CHILD':
      return { ...state, children: [action.payload, ...state.children] }
    case 'UPDATE_CHILD':
      return {
        ...state,
        children: state.children.map((c) => c.id === action.payload.id ? action.payload : c),
      }
    case 'DELETE_CHILD':
      return {
        ...state,
        children: state.children.filter((c) => c.id !== action.payload),
        // 若删除的是当前孩子且有剩余，切换到第一个；否则保持空（由 refreshChildren 兜底）
        activeChildId: state.activeChildId === action.payload
          ? state.children.filter((c) => c.id !== action.payload)[0]?.id ?? ''
          : state.activeChildId,
      }
    case 'SET_ACTIVE_CHILD':
      return { ...state, activeChildId: action.payload }
    case 'SET_ERRORS':
      return { ...state, errors: action.payload }
    case 'ADD_ERROR':
      return { ...state, errors: [action.payload, ...state.errors] }
    case 'UPDATE_ERROR':
      return {
        ...state,
        errors: state.errors.map((e) => e.id === action.payload.id ? action.payload : e),
      }
    case 'DELETE_ERROR':
      return { ...state, errors: state.errors.filter((e) => e.id !== action.payload) }
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload }
    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface AppContextType extends AppState {
  activeChild: Child | undefined
  dispatch: React.Dispatch<Action>
  refreshChildren: () => Promise<void>
  refreshErrors: () => Promise<void>
  addChild: (data: Partial<Child>) => Promise<void>
  updateChild: (id: string, data: Partial<Child>) => Promise<void>
  deleteChild: (id: string) => Promise<void>
  setActiveChild: (id: string) => void
  createError: (data: Partial<ErrorItem>) => Promise<void>
  updateError: (id: string, data: Partial<ErrorItem>) => Promise<void>
  deleteError: (id: string) => Promise<void>
  // v19: 跨页传递打印勾选(ErrorList 多选 → PrintPreview)
  pendingPrintIds: string[]
  setPendingPrintIds: (ids: string[]) => void
}

const AppContext = createContext<AppContextType | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  // v19: ErrorList 多选 → PrintPreview 跨页传递
  const [pendingPrintIds, setPendingPrintIds] = useState<string[]>([])

  // 加载孩子列表（带重试，适配 WebView Mixed Content 环境）
  const refreshChildren = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    let lastErr: unknown
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[AppContext] refreshChildren attempt ${attempt}`)
        const children = await api.getChildren()
        console.log(`[AppContext] refreshChildren ok, ${children.length} children`)
        dispatch({ type: 'SET_CHILDREN', payload: children })
        if (!state.activeChildId && children.length > 0) {
          dispatch({ type: 'SET_ACTIVE_CHILD', payload: children[0].id })
        }
        // 若当前 activeChildId 对应的孩子已被删除，自动切换
        if (state.activeChildId && !children.find((c) => c.id === state.activeChildId) && children.length > 0) {
          dispatch({ type: 'SET_ACTIVE_CHILD', payload: children[0].id })
        }
        return
      } catch (err) {
        lastErr = err
        console.warn(`[AppContext] refreshChildren attempt ${attempt} failed:`, err)
        await new Promise(r => setTimeout(r, 500 * attempt))
      }
    }
    dispatch({ type: 'SET_ERROR', payload: String(lastErr) })
    dispatch({ type: 'SET_LOADING', payload: false })
  }, [state.activeChildId])

  // 加载错题列表
  const refreshErrors = useCallback(async () => {
    if (!state.activeChildId) return
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const errors = await api.getErrors({ childId: state.activeChildId })
      dispatch({ type: 'SET_ERRORS', payload: errors })
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: String(err) })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [state.activeChildId])

  // 切换孩子时自动刷新错题
  useEffect(() => {
    if (state.activeChildId) {
      refreshErrors()
    }
  }, [state.activeChildId])

  // 初始化加载
  useEffect(() => {
    refreshChildren()
  }, [])

  // ─── 操作方法 ──────────────────────────────────────────────────────────────
  const addChild = async (data: Partial<Child>) => {
    const child = await api.createChild(data)
    dispatch({ type: 'ADD_CHILD', payload: child })
  }

  const updateChild = async (id: string, data: Partial<Child>) => {
    const child = await api.updateChild(id, data)
    dispatch({ type: 'UPDATE_CHILD', payload: child })
  }

  const deleteChild = async (id: string) => {
    await api.deleteChild(id)
    dispatch({ type: 'DELETE_CHILD', payload: id })
  }

  const setActiveChild = (id: string) => {
    dispatch({ type: 'SET_ACTIVE_CHILD', payload: id })
  }

  const createError = async (data: Partial<ErrorItem>) => {
    const err = await api.createError(data)
    dispatch({ type: 'ADD_ERROR', payload: err })
  }

  const updateError = async (id: string, data: Partial<ErrorItem>) => {
    const err = await api.updateError(id, data)
    dispatch({ type: 'UPDATE_ERROR', payload: err })
  }

  const deleteError = async (id: string) => {
    await api.deleteError(id)
    dispatch({ type: 'DELETE_ERROR', payload: id })
  }

  const value: AppContextType = {
    ...state,
    activeChild: state.children.find((c) => c.id === state.activeChildId),
    dispatch,
    refreshChildren,
    refreshErrors,
    addChild,
    updateChild,
    deleteChild,
    setActiveChild,
    createError,
    updateError,
    deleteError,
    pendingPrintIds,
    setPendingPrintIds,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
