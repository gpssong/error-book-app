/**
 * ErrorQuestion 数据模型
 * MongoDB Schema + 内存数据库使用
 *
 * 字段说明：
 * - childId: 归属的孩子 ID（核心隔离字段）
 * - subject: 科目（数学/语文/英语/物理/化学/生物）
 * - title: 题目简略标题
 * - knowledgePoint: 知识点标签
 * - imageUrl: 题目图片 URL（本地或云端）
 * - imageBase64: 题目图片 Base64（离线场景）
 * - textContent: 题目文字内容（OCR 识别结果）
 * - handwritingSvg: 手写批注 SVG 数据（独立图层，可擦除）
 * - wrongCount: 做错过的次数
 * - isFavorite: 是否收藏
 * - aiAnalysis: AI 讲解记录（含错误原因、知识点讲解、分步解题）
 * - similarQuestions: AI 生成的同类练习题
 * - createdAt: 录入时间
 * - reviewedAt: 最近复习时间
 */
import mongoose from 'mongoose'

export const errorQuestionSchema = new mongoose.Schema(
  {
    childId: { type: String, required: true, index: true },
    subject: {
      type: String,
      required: true,
      enum: ['数学', '语文', '英语', '物理', '化学', '生物'],
    },
    title: { type: String, required: true, trim: true },
    knowledgePoint: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' },
    imageBase64: { type: String, default: '' },
    textContent: { type: String, default: '' },
    handwritingSvg: { type: String, default: '' },
    wrongCount: { type: Number, default: 1 },
    isFavorite: { type: Boolean, default: false },
    aiAnalysis: {
      mistakeReason: { type: String, default: '' },
      knowledgeExplained: { type: String, default: '' },
      stepByStepGuide: { type: String, default: '' },
      analyzedAt: { type: Date },
    },
    similarQuestions: [{
      id: String,
      content: String,
      answer: String,
      answerFolded: { type: Boolean, default: true },
    }],
  },
  { timestamps: true }
)

errorQuestionSchema.virtual('id').get(function () { return this._id.toString() })
errorQuestionSchema.set('toJSON', { virtuals: true, timestamps: true })
errorQuestionSchema.set('toObject', { virtuals: true, timestamps: true })

/** 复合索引：按孩子 + 科目查询 */
errorQuestionSchema.index({ childId: 1, subject: 1 })
errorQuestionSchema.index({ childId: 1, createdAt: -1 })

export const ErrorQuestion = mongoose.model('ErrorQuestion', errorQuestionSchema)

/** 内存模式下的数据结构 */
export function createMemoryError(payload, childId) {
  return {
    id: '',
    childId,
    subject: payload.subject,
    title: payload.title,
    knowledgePoint: payload.knowledgePoint,
    imageUrl: payload.imageUrl || '',
    imageBase64: payload.imageBase64 || '',
    textContent: payload.textContent || '',
    handwritingSvg: payload.handwritingSvg || '',
    wrongCount: payload.wrongCount || 1,
    isFavorite: false,
    aiAnalysis: {
      mistakeReason: '',
      knowledgeExplained: '',
      stepByStepGuide: '',
      analyzedAt: null,
    },
    similarQuestions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
