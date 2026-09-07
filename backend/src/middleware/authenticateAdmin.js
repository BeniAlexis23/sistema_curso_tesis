import jwt from 'jsonwebtoken'

export function authenticateAdmin(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ message: 'Debes iniciar sesión' })
  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET || 'development-secret-change-me')
    next()
  } catch {
    res.status(401).json({ message: 'La sesión expiró o no es válida' })
  }
}
