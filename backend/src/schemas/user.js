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
 *
 * 订阅字段(v27新增):
 * - subscription.plan: 'free' | 'pro' | 'family'
 * - subscription.expiresAt: 到期时间(null = 永久)
 * - subscription.childrenCount: 最大孩子数(free=1, pro=1, family=5)
 * - subscription.dailyOcrUsed: 今日 OCR 已用次数
 * - subscription.dailyAiUsed: 今日 AI 讲解已用次数
 * - subscription.dailySimilarUsed: 今日同类题已用次数
 * - subscription.lastResetDate: 上次清零日期(YYYY-MM-DD)
 */
import mongoose from 'mongoose'

const UserSchemaDef = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 32 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, default: '' },
    subscription: {
      plan: { type: String, enum: ['free', 'pro', 'family'], default: 'free' },
      expiresAt: { type: Date },
      childrenCount: { type: Number, default: 1 },
      dailyOcrUsed: { type: Number, default: 0 },
      dailyAiUsed: { type: Number, default: 0 },
      dailySimilarUsed: { type: Number, default: 0 },
      lastResetDate: { type: String, default: '' },
    },
  },
  { timestamps: true }
)

export const User = mongoose.models.User || mongoose.model('User', UserSchemaDef)

// ─── 免费版额度上限 ───────────────────────────────────────────────────────────
export const DAILY_OCR_LIMIT = 10
export const DAILY_AI_LIMIT = 3
export const DAILY_SIMILAR_LIMIT = 3

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
    subscription: {
      plan: 'free',
      expiresAt: null,
      childrenCount: 1,
      dailyOcrUsed: 0,
      dailyAiUsed: 0,
      dailySimilarUsed: 0,
      lastResetDate: '',
    },
    createdAt: now,
    updatedAt: now,
  }
}
