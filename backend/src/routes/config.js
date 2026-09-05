/**
 * 配置路由
 *
 * GET  /api/config        - 获取全部配置（公开）
 * POST /api/config        - 保存全部配置（公开，仅管理员操作，无权限校验）
 *
 * 注意：config.html 由管理员手动访问，暂不做 JWT 鉴权；
 *       生产环境可在此添加简单的 token 校验或 IP 白名单。
 */
import { Router } from 'express'
import { Config } from '../schemas/config.js'

const router = Router()

// ─── 获取配置 ─────────────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    let doc = await Config.findById('global')
    if (!doc) {
      doc = new Config({ _id: 'global', accounts: [], keys: [], current: null, settings: { autoFallback: true, parallel: false, verbose: false } })
      await doc.save()
    }
    res.json(doc)
  } catch (err) {
    console.error('GET /api/config 失败:', err)
    res.status(500).json({ error: err.message || '获取配置失败' })
  }
})

// ─── 保存配置 ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { accounts, keys, current, settings } = req.body
    let doc = await Config.findById('global')
    if (!doc) {
      doc = new Config({ _id: 'global' })
    }
    if (accounts !== undefined) doc.accounts = accounts
    if (keys !== undefined) doc.keys = keys
    if (current !== undefined) doc.current = current
    if (settings !== undefined) doc.settings = settings
    await doc.save()
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/config 失败:', err)
    res.status(500).json({ error: err.message || '保存配置失败' })
  }
})

export default router
