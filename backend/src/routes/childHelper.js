/**
 * 孩子查询 helper
 * 供 ai.js 等其他路由复用 — 不挂 router 链 (不强制 auth)
 * 调用方需自行校验 ownerId (例如仅使用 req.userId 自己的 child)
 */
import { Child } from '../schemas/child.js'
import memoryStore from '../schemas/memory.js'
import { isMemoryDB } from '../schemas/db.js'

/**
 * 获取指定 ID 的孩子 (不校验 owner)
 * 返回 Child 或 null
 */
export async function findChildById(childId) {
  if (!childId) return null
  if (isMemoryDB()) {
    return memoryStore.children.get(childId) || null
  }
  const c = await Child.findById(childId)
  return c || null
}

/**
 * 校验 child 是否属于 userId
 */
export function childBelongsTo(child, userId) {
  return !!child && child.ownerId === userId
}
