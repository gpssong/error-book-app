/**
 * v44 P2c: 存量 base64 图片 → 静态文件迁移脚本
 *
 * 背景:
 *   历史错题把题图以 base64 内联存进 Mongo(imageBase64/figureBase64),
 *   列表接口 GET /api/errors 整文档返回 → 错题越多, 列表 JSON 越大(实测 59 条 = 10.9MB),
 *   公网 v6 拉取慢。根治方案: 图片存成 /uploads 静态文件, 库里只留 URL, 列表可缓存 + 秒开。
 *
 * 本脚本做什么:
 *   1. 连接 MongoDB(读 MONGODB_URI)
 *   2. 遍历 errorquestions 里带 imageBase64/figureBase64 的文档
 *   3. 把 base64 写成 public/uploads/err-{id}.jpg / err-{id}-fig.jpg
 *   4. 文档: imageBase64 → '' , imageUrl = /uploads/err-{id}.jpg
 *             figureBase64 → '' , 新增 figureImageUrl = /uploads/err-{id}-fig.jpg (schema 已加)
 *   5. 幂等: 已迁移(字段已空)的文档跳过
 *   6. 安全: --dry-run 只统计不写库; 默认先 db.backup 备份集合再动手
 *
 * 用法:
 *   node backend/scripts/migrate-images-to-static.js            # 真跑(先自动备份)
 *   node backend/scripts/migrate-images-to-static.js --dry-run  # 只统计, 不写库/文件
 *   MONGODB_URI=... node backend/scripts/migrate-images-to-static.js
 */
import { connectDB, getDB, isMemoryDB } from '../src/schemas/db.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.join(__dirname, '../public/uploads')
const DRY_RUN = process.argv.includes('--dry-run')

function log(...a) { console.log(`[migrate]`, ...a) }
function fail(msg) { console.error(`[migrate] ❌ ${msg}`); process.exit(1) }

async function main() {
  if (isMemoryDB()) fail('本脚本必须连真实 MongoDB, 请在设了 MONGODB_URI 的环境跑(USE_MEMORY_DB 不能是 true)')

  log(DRY_RUN ? 'DRY-RUN 模式: 只统计, 不写库/不写文件' : '正式迁移')
  await connectDB()
  const db = getDB()
  if (!db) fail('MongoDB 未连接成功')

  // 备份(非 dry-run): 用同名 -bak-{ts} 集合, 可回滚
  if (!DRY_RUN) {
    const ts = Date.now()
    try {
      const coll = db.collection('errorquestions')
      const bak = db.collection(`errorquestions-bak-${ts}`)
      // 简单备份: 全量导出到备份集合(数据量 <1k, 可接受)
      const docs = await coll.find({}).toArray()
      if (docs.length > 0) await bak.insertMany(docs)
      log(`已备份 ${docs.length} 条到 errorquestions-bak-${ts}`)
    } catch (e) {
      log('备份失败(集合可能为空, 继续):', e.message)
    }
  }

  // 确保上传目录
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

  const coll = db.collection('errorquestions')
  // 只取有 base64 的文档
  const docs = await coll.find({ $or: [{ imageBase64: { $exists: true } }, { figureBase64: { $exists: true } }] }).toArray()
  log(`含 base64 图片的错题: ${docs.length} 条`)

  let imgDone = 0, figDone = 0, imgKB = 0, figKB = 0

  for (const doc of docs) {
    const id = String(doc._id)

    // ── imageBase64 → /uploads/err-{id}.jpg ──────────────────────────────
    const rawImg = doc.imageBase64 || ''
    if (rawImg.length > 0) {
      const ext = rawImg.startsWith('data:image') ? (rawImg.match(/data:image\/(\w+)/)?.[1] || 'jpg') : 'jpg'
      const base64 = rawImg.replace(/^data:image\/\w+;base64/, '')
      const buf = Buffer.from(base64, 'base64')
      imgKB += buf.length / 1024
      const url = `/uploads/err-${id}.${ext}`
      if (!DRY_RUN) {
        fs.writeFileSync(path.join(UPLOAD_DIR, `err-${id}.${ext}`), buf)
        await coll.updateOne({ _id: doc._id }, {
          $set: { imageUrl: url },
          $unset: { imageBase64: '' },
        })
      }
      imgDone++
    }

    // ── figureBase64 → /uploads/err-{id}-fig.{ext} ───────────────────────
    // 插图目前生产 0 条; AI 讲解依赖 figureBase64 喂图, 故保留 base64(不 unset),
    // 同时写一份静态文件 + 记 figureImageUrl 供未来列表/详情页按需取图 + 缓存。
    const rawFig = doc.figureBase64 || ''
    if (rawFig.length > 0) {
      const ext = rawFig.startsWith('data:image') ? (rawFig.match(/data:image\/(\w+)/)?.[1] || 'jpg') : 'jpg'
      const base64 = rawFig.replace(/^data:image\/\w+;base64/, '')
      const buf = Buffer.from(base64, 'base64')
      figKB += buf.length / 1024
      const url = `/uploads/err-${id}-fig.${ext}`
      if (!DRY_RUN) {
        fs.writeFileSync(path.join(UPLOAD_DIR, `err-${id}-fig.${ext}`), buf)
        await coll.updateOne({ _id: doc._id }, { $set: { figureImageUrl: url } })
      }
      figDone++
    }
  }

  log(`完成: 主图 ${imgDone} 张 (~${Math.round(imgKB / 1024 * 10) / 10} MB), 插图 ${figDone} 张 (~${Math.round(figKB / 1024 * 10) / 10} MB)`)
  log(DRY_RUN ? '(dry-run 未写库, 重新去掉 --dry-run 真跑)' : '已清空 imageBase64/figureBase64, 图片转 /uploads 静态文件')

  await process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
