import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import request from 'supertest'
import express from 'express'

// 必须在 import router 之前设好内存模式,
// 让 isMemoryDB() 走内存分支, 避免触碰 MongoDB
process.env.USE_MEMORY_DB = 'true'

let app
let memoryStore

// 延迟 import(保证上面 env 已设)
beforeAll(async () => {
  const router = (await import('./auth.js')).default
  memoryStore = (await import('../schemas/memory.js')).default
  app = express()
  // router 本身不挂 body-parser(生产里由 index.js 统一挂 express.json),
  // 测试里手动补上, 否则 req.body 为 undefined
  app.use(express.json())
  app.use('/api/auth', router)
})

beforeEach(() => {
  memoryStore.clear()
})

describe('POST /register (内存模式)', () => {
  it('三字段齐全 → 201 + token + user', async () => {
    const r = await request(app)
      .post('/api/auth/register')
      .send({ username: 'mom', email: 'mom@x.com', password: 'secret1' })
    expect(r.status).toBe(201)
    expect(r.body.token).toBeTruthy()
    expect(r.body.user.username).toBe('mom')
  })

  it('缺用户名/邮箱/密码任一 → 400「均为必填项」', async () => {
    for (const body of [
      { email: 'a@x.com', password: 'secret1' },
      { username: 'mom', password: 'secret1' },
      { username: 'mom', email: 'a@x.com' },
    ]) {
      const r = await request(app).post('/api/auth/register').send(body)
      expect(r.status).toBe(400)
      expect(r.body.error).toBe('用户名、邮箱、密码均为必填项')
    }
  })

  it('密码不足 6 位 → 400「密码至少 6 位」', async () => {
    const r = await request(app)
      .post('/api/auth/register')
      .send({ username: 'mom', email: 'a@x.com', password: '12345' })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('密码至少 6 位')
  })

  it('邮箱格式错 → 400「邮箱格式不正确」', async () => {
    const r = await request(app)
      .post('/api/auth/register')
      .send({ username: 'mom', email: 'not-an-email', password: 'secret1' })
    expect(r.status).toBe(400)
    expect(r.body.error).toBe('邮箱格式不正确')
  })

  it('重复用户名 / 重复邮箱 → 409', async () => {
    await request(app).post('/api/auth/register').send({ username: 'mom', email: 'a@x.com', password: 'secret1' })
    const dupName = await request(app).post('/api/auth/register').send({ username: 'mom', email: 'b@x.com', password: 'secret1' })
    expect(dupName.status).toBe(409)
    expect(dupName.body.error).toBe('用户名已被占用')
    const dupEmail = await request(app).post('/api/auth/register').send({ username: 'dad', email: 'a@x.com', password: 'secret1' })
    expect(dupEmail.status).toBe(409)
    expect(dupEmail.body.error).toBe('邮箱已被注册')
  })
})

describe('POST /login (内存模式) — account 可匹配用户名或邮箱', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ username: 'mom', email: 'mom@x.com', password: 'secret1' })
  })

  it('用用户名登录 → 200 + isAdmin=false', async () => {
    const r = await request(app).post('/api/auth/login').send({ account: 'mom', password: 'secret1' })
    expect(r.status).toBe(200)
    expect(r.body.user.username).toBe('mom')
  })

  it('用邮箱登录(大小写不敏感) → 200', async () => {
    const r = await request(app).post('/api/auth/login').send({ account: 'MOM@X.COM', password: 'secret1' })
    expect(r.status).toBe(200)
    expect(r.body.user.email).toBe('mom@x.com')
  })

  it('密码错 → 401「账号或密码错误」', async () => {
    const r = await request(app).post('/api/auth/login').send({ account: 'mom', password: 'wrong' })
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('账号或密码错误')
  })

  it('不存在的账号 → 401 同文案(不泄露账号是否存在)', async () => {
    const r = await request(app).post('/api/auth/login').send({ account: 'ghost', password: 'secret1' })
    expect(r.status).toBe(401)
    expect(r.body.error).toBe('账号或密码错误')
  })

  it('缺 account / password → 400「请输入账号和密码」', async () => {
    const r1 = await request(app).post('/api/auth/login').send({ password: 'secret1' })
    const r2 = await request(app).post('/api/auth/login').send({ account: 'mom' })
    expect(r1.status).toBe(400)
    expect(r2.status).toBe(400)
    expect(r1.body.error).toBe('请输入账号和密码')
  })
})
