/// <reference types="vite/client" />

// 自定义注入(Vite define): 取自 package.json version, build 时自动更新
declare module '*.css'

interface ImportMetaEnv {
  /** 应用版本号, 来自 frontend/package.json "version", 每次 build 自动跟随 */
  readonly APP_VERSION: string
}
