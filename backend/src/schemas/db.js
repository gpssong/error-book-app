/**
 * 数据库连接层
 * 支持 MongoDB（生产）和内存存储（开发/演示）两种模式
 */
import mongoose from 'mongoose'

let connected = false

/**
 * 连接 MongoDB
 * @returns {Promise<boolean>} 是否成功连接
 */
export async function connectDB() {
  if (connected) return true

  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/error_book'
  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    connected = true
    return true
  } catch (err) {
    throw err
  }
}

/** 判断当前是否使用内存数据库 */
export function isMemoryDB() {
  return process.env.USE_MEMORY_DB === 'true' || !mongoose.connection.readyState
}

/** 获取当前 database 实例（内存模式返回 null） */
export function getDB() {
  if (isMemoryDB()) return null
  return mongoose.connection.db
}
