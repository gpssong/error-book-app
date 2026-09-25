/**
 * 数据库连接层
 * 支持 MongoDB（生产）和内存存储（开发/演示）两种模式
 */
import mongoose from 'mongoose'

let connected = false
let retryTimer = null   // 后台重连定时器
let retrying = false    // 防止并发重试

/**
 * 连接 MongoDB
 * @returns {Promise<boolean>} 是否成功连接
 */
export async function connectDB() {
  if (connected) return true

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/error_book'
  await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  })
  connected = true
  return true
}

/**
 * 判断当前是否使用内存数据库
 * 内存模式只在「USE_MEMORY_DB=true 且 mongoose 真的没连上」时成立，
 * 一旦后台重连成功 (readyState===1)，即自动切回 MongoDB，避免数据写进易失内存。
 */
export function isMemoryDB() {
  return process.env.USE_MEMORY_DB === 'true' && mongoose.connection.readyState !== 1
}

/** 获取当前 database 实例（内存模式返回 null） */
export function getDB() {
  if (isMemoryDB()) return null
  return mongoose.connection.db
}

/**
 * 注册运行期中断自愈
 * mongoose 连上后又中途断开（mongo 重启/OOM/网络抖动）时自动重连。
 * 应在 backend 启动后调用一次。
 */
export function watchDisconnection() {
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB 连接已断开，启动自愈重连')
    connected = false
    ensureMongoReconnect()
  })
}

/**
 * 后台重连兜底
 * 启动时 mongo 未就绪 → connectDB 失败 → 退内存模式；
 * 调用本函数后每 5s 重试，连上即清除 USE_MEMORY_DB 标记并停定时器。
 * 幂等：已在重连中或已连上则不做事。
 */
export function ensureMongoReconnect() {
  // 已连上或正在重连 → 直接返回
  if (mongoose.connection.readyState === 1 || retrying) return
  retrying = true

  const RETRY_MS = 5000
  const MAX_ATTEMPTS = 360          // 5s × 360 = 3 小时，覆盖 NAS 重启/网络慢场景
  let attempts = 0

  const attempt = () => {
    if (mongoose.connection.readyState === 1) { stop(); return }
    attempts += 1
    mongoose
      .connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/error_book', {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      })
      .then(() => {
        connected = true
        if (process.env.USE_MEMORY_DB === 'true') {
          delete process.env.USE_MEMORY_DB
          console.log(`✅ MongoDB 后台重连成功（第 ${attempts} 次），切回 MongoDB 模式`)
        }
        stop()
      })
      .catch((err) => {
        try { mongoose.connection.close() } catch (_) {}
        if (attempts >= MAX_ATTEMPTS) {
          console.error(`❌ MongoDB 重连 ${MAX_ATTEMPTS} 次仍失败，放弃:`, err.message)
          retrying = false
          return
        }
        console.warn(`🔄 MongoDB 重连中（第 ${attempts}/${MAX_ATTEMPTS} 次）: ${err.message}`)
        retryTimer = setTimeout(attempt, RETRY_MS)
      })
  }

  const stop = () => {
    retrying = false
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  }

  attempt()
}
