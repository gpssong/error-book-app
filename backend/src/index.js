/**
 * 错题本后端 - 主入口
 *
 * 功能：
 * - 多子女隔离管理（child API）
 * - 错题 CRUD（error_question API）
 * - AI 讲解 & 同类题生成（/api/ai/*）
 * - 图片上传
 * - 内存数据库（MongoDB 不可用时自动启用）
 */
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config()

import childRoutes from './routes/child.js'
import errorQuestionRoutes from './routes/errorQuestion.js'
import aiRoutes from './routes/ai.js'
import uploadRoutes from './routes/upload.js'
import ocrRoutes from './routes/ocr.js'
import { connectDB } from './schemas/db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = Number(process.env.PORT) || 3001

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')))

// ─── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/children', childRoutes)
app.use('/api/errors', errorQuestionRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/ocr', ocrRoutes)

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', db: process.env.USE_MEMORY_DB ? 'memory' : 'mongodb' })
})

// ─── 启动 ─────────────────────────────────────────────────────────────────────
async function main() {
  if (process.env.USE_MEMORY_DB !== 'true') {
    try {
      await connectDB()
      console.log('✅ MongoDB 连接成功')
    } catch (err) {
      console.warn('⚠️  MongoDB 连接失败，自动启用内存数据库:', err.message)
      process.env.USE_MEMORY_DB = 'true'
    }
  } else {
    console.log('🧪 使用内存数据库模式')
  }

  app.listen(PORT, () => {
    console.log(`🚀 后端服务运行于 http://localhost:${PORT}`)
    console.log(`📖 API 文档: http://localhost:${PORT}/api/health`)
  })
}

main().catch(console.error)
