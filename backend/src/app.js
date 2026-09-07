import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import courseRoutes from './routes/courseRoutes.js'
import registrationRoutes from './routes/registrationRoutes.js'
import adminRoutes from './routes/adminRoutes.js'

const app = express()
app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/courses', courseRoutes)
app.use('/api/registrations', registrationRoutes)
app.use('/api/admin', adminRoutes)
app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada' }))
app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: 'Error interno del servidor' })
})
export default app
