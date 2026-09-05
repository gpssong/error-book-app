/**
 * 配置数据模型 (Config)
 *
 * 存储全局配置数据（账号列表、OCR/AI Keys、当前账号、设置），
 * 替代前端 localStorage，使 error.93gushi.com 和 192.168.0.14 共用同一份数据。
 *
 * 字段：
 * - _id: 固定为 'global'（单条记录）
 * - accounts: 账号列表 [{ id, username, email, displayName, token, exp }]
 * - keys: API Keys [{ id, category, provider, name, base_url, value, appId, secretCode, default_model, note, enabled, current, usage, lastUsed }]
 * - current: 当前选中的账号 { id } 或 null
 * - settings: 设置对象 { autoFallback, parallel, verbose }
 */
import mongoose from 'mongoose'

const AccountSchema = new mongoose.Schema({
  id: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String },
  displayName: { type: String },
  token: { type: String },
  exp: { type: String },
}, { _id: false })

const KeySchema = new mongoose.Schema({
  id: { type: String, required: true },
  category: { type: String, enum: ['ocr', 'ai', 'fallback'], required: true },
  provider: { type: String, required: true },
  name: { type: String, required: true },
  base_url: { type: String },
  value: { type: String },
  appId: { type: String },
  secretCode: { type: String },
  default_model: { type: String },
  note: { type: String },
  enabled: { type: Boolean, default: true },
  current: { type: Boolean, default: false },
  usage: { type: Number, default: 0 },
  lastUsed: { type: String },
  createdAt: { type: String },
}, { _id: false })

const ConfigSchemaDef = new mongoose.Schema(
  {
    accounts: [AccountSchema],
    keys: [KeySchema],
    current: { type: mongoose.Schema.Types.Mixed },
    settings: {
      autoFallback: { type: Boolean, default: true },
      parallel: { type: Boolean, default: false },
      verbose: { type: Boolean, default: false },
    },
  },
  { _id: false, strict: false }
)

export const Config = mongoose.models.Config || mongoose.model('Config', ConfigSchemaDef)
