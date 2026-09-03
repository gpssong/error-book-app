/**
 * 错题本前端 - 入口文件
 * 初始化 React 应用并挂载到 #root 元素
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

try {
  const root = document.getElementById('root')
  if (!root) throw new Error('#root not found')

  ReactDOM.createRoot(root).render(
    React.createElement(React.StrictMode, null,
      React.createElement(App, null)
    )
  )
} catch (err: any) {
  console.error('[BOOT] RENDER ERROR:', err.message)
}
