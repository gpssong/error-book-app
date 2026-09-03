/**
 * 内存数据库实现
 * 用于 MongoDB 不可用时的降级方案，数据结构与 MongoDB 完全一致
 */
const children = new Map()   // id -> Child
const errors = new Map()     // id -> ErrorQuestion
const users = new Map()      // id -> User
let childIdCounter = 1
let errorIdCounter = 1
let userIdCounter = 1

export default {
  children,
  errors,
  users,

  /** 生成唯一 ID */
  genChildId() { return `child_${++childIdCounter}_${Date.now()}` },
  genErrorId() { return `err_${++errorIdCounter}_${Date.now()}` },
  genUserId() { return `user_${++userIdCounter}_${Date.now()}` },

  /** 清空所有数据（测试用） */
  clear() {
    children.clear()
    errors.clear()
    users.clear()
    childIdCounter = 1
    errorIdCounter = 1
    userIdCounter = 1
  },
}
