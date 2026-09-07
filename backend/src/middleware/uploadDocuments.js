import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'

const uploadDirectory = path.resolve('uploads')
fs.mkdirSync(uploadDirectory, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')
    callback(null, `${Date.now()}-${crypto.randomUUID()}-${safeName}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== 'application/pdf') return callback(new Error('Solo se permiten documentos PDF'))
    callback(null, true)
  },
})

export const uploadDocuments = upload.fields([
  { name: 'bachelorDiploma', maxCount: 1 },
  { name: 'suneduRegistration', maxCount: 1 },
  { name: 'futRequest', maxCount: 1 },
  { name: 'paymentVoucher', maxCount: 1 },
])
export const uploadOneDocument = upload.single('document')
