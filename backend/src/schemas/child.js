/**
 * Child 数据模型
 * MongoDB Schema + 内存数据库使用
 *
 * 字段说明：
 * - name: 孩子姓名
 * - grade: 年级（如"初三"、"高一"）
 * - avatar: 头像 emoji
 * - color: 主题色（用于 UI 区分）
 * - errorCount: 错题总数（冗余字段，更新时自动维护）
 * - masteredCount: 已掌握错题数
 * - weeklyCount: 本周新增错题数
 * - createdAt: 创建时间
 */
import mongoose from 'mongoose'

export const childSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    grade: { type: String, required: true, trim: true },
    avatar: { type: String, default: '🧒' },
    color: { type: String, default: '#2563EB' },
    errorCount: { type: Number, default: 0 },
    masteredCount: { type: Number, default: 0 },
    weeklyCount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

childSchema.virtual('id').get(function () { return this._id.toString() })
childSchema.set('toJSON', { virtuals: true, timestamps: true })
childSchema.set('toObject', { virtuals: true, timestamps: true })

/** 索引：按姓名查找 */
childSchema.index({ name: 1 })

export const Child = mongoose.model('Child', childSchema)

/** 内存模式下的数据结构（与 Schema 一致） */
export function createMemoryChild(payload) {
  return {
    id: '',          // 由 memory store 填充
    name: payload.name,
    grade: payload.grade,
    avatar: payload.avatar || '🧒',
    color: payload.color || '#2563EB',
    errorCount: 0,
    masteredCount: 0,
    weeklyCount: 0,
    createdAt: new Date().toISOString(),
  }
}
