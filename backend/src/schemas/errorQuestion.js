/**
 * ErrorQuestion 数据模型
 * MongoDB Schema + 内存数据库使用
 *
 * 字段说明：
 * - childId: 归属的孩子 ID（核心隔离字段）
 * - subject: 科目（数学/语文/英语/物理/化学/生物/历史/地理/科学）
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
      // 9 学科:6 大主科 + 历史/地理/科学(LLM 学科分类 2026-09-14 起会输出后 3 类)
      enum: ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '科学'],
    },
    title: { type: String, required: true, trim: true },
    knowledgePoint: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: '' },
    imageBase64: { type: String, default: '' },
    textContent: { type: String, default: '' },
    // 语文题:诗词原文/文言文/阅读文章(2026-09-14)
    sourceText: { type: String, default: '' },
    handwritingSvg: { type: String, default: '' },
    wrongCount: { type: Number, default: 1 },
    isFavorite: { type: Boolean, default: false },
    aiAnalysis: {
      mistakeReason: { type: String, default: '' },
      knowledgeExplained: { type: String, default: '' },
      stepByStepGuide: { type: String, default: '' },
      answer: { type: String, default: '' },
      analyzedAt: { type: Date },
    },
    similarQuestions: [{
      id: String,
      content: String,
      answer: String,
      answerFolded: { type: Boolean, default: true },
    }],
    // v40: 跨页拍题标记 — 自动垂直拼接 2 张拍图后入库,单条错题挂拼接图
    isSplitPage:  { type: Boolean, default: false },
    pageIndex:    { type: Number,  default: 0 },   // 该条在跨页题中的序号(单条入库下固定为 1)
    totalPages:   { type: Number,  default: 0 },   // 拼接时实际页数(典型为 2)
    splitGroupId: { type: String,  default: '' },  // 跨页会话 id,便于未来多条聚合
    // 题目插图(AI 识别出的关键示意图:几何图/物理装置/化学结构等),单独裁剪存储,
    // 复习时孩子在详情页可见「题目插图」卡片,不用翻整题大图。无图 → ''
    figureBase64: { type: String, default: '' },
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
    sourceText: payload.sourceText || '',     // 语文题诗词原文
    handwritingSvg: payload.handwritingSvg || '',
    wrongCount: payload.wrongCount || 1,
    isFavorite: false,
    aiAnalysis: {
      mistakeReason: '',
      knowledgeExplained: '',
      stepByStepGuide: '',
      answer: '',
      analyzedAt: null,
    },
    similarQuestions: [],
    // v40: 跨页拍题标记 — 透传自前端
    isSplitPage:  payload.isSplitPage ?? false,
    pageIndex:    payload.pageIndex ?? 0,
    totalPages:   payload.totalPages ?? 0,
    splitGroupId: payload.splitGroupId ?? '',
    figureBase64: payload.figureBase64 ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}
