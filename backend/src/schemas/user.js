/**
 * User 数据模型
 *
 * 支持 MongoDB（生产）和内存（开发/演示）两种模式
 * 字段：
 * - username: 用户名（登录用）
 * - email: 邮箱（唯一、可用于找回）
 * - passwordHash: bcrypt 哈希后的密码
 * - displayName: 显示名
 * - createdAt / updatedAt
 */
import mongoose from 'mongoose'

const UserSchemaDef = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 32 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: '' },
  },
  { timestamps: true }
)

export const User = mongoose.models.User || mongoose.model('User', UserSchemaDef)

/**
 * 创建内存模式 User（不依赖 mongoose）
 */
export function createMemoryUser({ username, email, passwordHash, displayName }) {
  const now = new Date().toISOString()
  return {
    id: null, // 由 memoryStore 分配
    username,
    email,
    passwordHash,
    displayName: displayName || username,
    createdAt: now,
    updatedAt: now,
  }
}