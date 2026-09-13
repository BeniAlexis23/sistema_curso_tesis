import { pool } from '../config/database.js'

export function requirePermission(permissionCode) {
  return async function authorizePermission(req, res, next) {
    try {
      const [rows] = await pool.query(
        `SELECT 1
         FROM administrators a
         JOIN roles r ON r.id = a.role_id AND r.is_active = 1
         JOIN role_permissions rp ON rp.role_id = r.id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE a.id = ? AND a.is_active = 1 AND p.code = ?
         LIMIT 1`,
        [req.admin.id, permissionCode],
      )
      if (!rows.length) return res.status(403).json({ message: 'No tienes permiso para realizar esta acción' })
      next()
    } catch (error) { next(error) }
  }
}
