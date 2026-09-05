/**
 * JWT 鉴权中间件
 *
 * 用法：
 *   router.get('/me', authMiddleware, handler)
 *
 * 解析 Authorization: Bearer <token>
 * 验证通过后将 req.userId / req.username 注入
 * 失败返回 401
 */
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'error-book-dev-secret-change-me'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'
/** 全局管理员用户名（硬编码，仅 gpssong） */
export const ADMIN_USERNAME = 'gpssong'

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: '未登录,请先登录' })
  }
  const payload = verifyToken(token)
  if (!payload || !payload.userId) {
    return res.status(401).json({ error: 'token 无效或已过期' })
  }
  req.userId = payload.userId
  req.username = payload.username
  req.isAdmin = payload.isAdmin === true
  next()
}