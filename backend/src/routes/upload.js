/**
 * 图片上传路由
 *
 * POST /api/upload/base64 - 上传 base64 图片
 * POST /api/upload        - 上传文件（multipart/form-data）
 * 返回 { url: '/uploads/filename.jpg' }
 */
import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'

const router = Router()

// 配置存储：文件名使用 UUID，防止冲突
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'public/uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || path.extname(file.filename)
    const filename = `${uuidv4()}${ext}`
    cb(null, filename)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB 限制
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|gif)$/i
    if (allowed.test(file.originalname)) {
      cb(null, true)
    } else {
      cb(new Error('仅支持图片格式'))
    }
  },
})

// 处理 base64 图片上传
router.post('/base64', async (req, res) => {
  try {
    const { data, filename } = req.body

    if (!data || !data.startsWith('data:image')) {
      return res.status(400).json({ error: '请提供有效的 base64 图片数据' })
    }

    const ext = data.match(/data:image\/(\w+);base64/)?.[1] || 'jpg'
    const base64 = data.replace(/^data:image\/\w+;base64/, '')
    const buffer = Buffer.from(base64, 'base64')

    const fileName = `${uuidv4()}.${ext}`
    const filePath = path.join(process.cwd(), 'public/uploads', fileName)

    if (!fs.existsSync(path.join(process.cwd(), 'public/uploads'))) {
      fs.mkdirSync(path.join(process.cwd(), 'public/uploads'), { recursive: true })
    }

    fs.writeFileSync(filePath, buffer)
    res.json({ url: `/uploads/${fileName}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 处理文件上传
router.post('/', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传文件' })
    }
    res.json({ url: `/uploads/${req.file.filename}` })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
