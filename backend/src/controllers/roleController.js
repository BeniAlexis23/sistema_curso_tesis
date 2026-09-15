import { pool } from '../config/database.js'

function normalizePermissionIds(values) {
  if (!Array.isArray(values)) return null
  const ids = [...new Set(values.map(Number))]
  return ids.length && ids.every(Number.isInteger) ? ids : null
}

async function validatePermissions(connection, permissionIds) {
  const [rows] = await connection.query('SELECT id, code FROM permissions WHERE id IN (?)', [permissionIds])
  if (rows.length !== permissionIds.length) return { valid: false, message: 'Uno o más permisos no existen' }
  const codes = new Set(rows.map(permission => permission.code))
  const dependencies = {
    'registrations.manage': 'registrations.view',
    'registrations.delete': 'registrations.view',
    'payments.manage': 'payments.view',
    'reports.export': 'reports.view',
    'users.manage': 'users.view',
    'roles.manage': 'roles.view',
    'attendance.mark': 'attendance.view',
    'attendance.manage': 'attendance.view',
    'attendance.export': 'attendance.view',
  }
  const missing = Object.entries(dependencies).find(([permission, required]) => codes.has(permission) && !codes.has(required))
  if (missing) return { valid: false, message: `El permiso ${missing[0]} requiere también ${missing[1]}` }
  return { valid: true }
}

async function assignPermissions(connection, roleId, permissionIds) {
  await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId])
  await connection.query(
    'INSERT INTO role_permissions (role_id, permission_id) VALUES ?',
    [permissionIds.map(permissionId => [roleId, permissionId])],
  )
}

export async function listPermissions(_req, res, next) {
  try {
    const [permissions] = await pool.query(
      'SELECT id, code, name, description, module FROM permissions ORDER BY module, id',
    )
    res.json({ data: permissions })
  } catch (error) { next(error) }
}

export async function listRoles(_req, res, next) {
  try {
    const [roles] = await pool.query(
      `SELECT r.id, r.name, r.description, r.is_system, r.is_active, r.created_at, r.updated_at,
              COUNT(DISTINCT a.id) AS user_count
       FROM roles r LEFT JOIN administrators a ON a.role_id = r.id
       GROUP BY r.id ORDER BY r.is_system DESC, r.name`,
    )
    if (roles.length) {
      const [assigned] = await pool.query(
        `SELECT rp.role_id, p.id, p.code, p.name, p.description, p.module
         FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id IN (?) ORDER BY p.module, p.id`,
        [roles.map(role => role.id)],
      )
      const permissionsByRole = new Map()
      assigned.forEach(permission => {
        if (!permissionsByRole.has(permission.role_id)) permissionsByRole.set(permission.role_id, [])
        permissionsByRole.get(permission.role_id).push(permission)
      })
      roles.forEach(role => { role.permissions = permissionsByRole.get(role.id) || [] })
    }
    res.json({ data: roles })
  } catch (error) { next(error) }
}

export async function createRole(req, res, next) {
  const name = req.body.name?.trim()
  const description = req.body.description?.trim() || null
  const permissionIds = normalizePermissionIds(req.body.permissionIds)
  if (!name || name.length > 100 || (description && description.length > 255) || !permissionIds) {
    return res.status(400).json({ message: 'Indica un nombre y al menos un permiso válido' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const validation = await validatePermissions(connection, permissionIds)
    if (!validation.valid) {
      await connection.rollback()
      return res.status(400).json({ message: validation.message })
    }
    const [result] = await connection.query(
      'INSERT INTO roles (name, description) VALUES (?, ?)',
      [name, description],
    )
    await assignPermissions(connection, result.insertId, permissionIds)
    await connection.commit()
    res.status(201).json({ message: 'Rol creado correctamente', data: { roleId: result.insertId } })
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe un rol con ese nombre' })
    next(error)
  } finally { connection.release() }
}

export async function updateRole(req, res, next) {
  const name = req.body.name?.trim()
  const description = req.body.description?.trim() || null
  const permissionIds = normalizePermissionIds(req.body.permissionIds)
  const isActive = req.body.isActive
  if (!name || name.length > 100 || (description && description.length > 255) || !permissionIds || typeof isActive !== 'boolean') {
    return res.status(400).json({ message: 'Revisa los datos y permisos del rol' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [roles] = await connection.query('SELECT is_system FROM roles WHERE id = ? FOR UPDATE', [req.params.id])
    if (!roles.length) { await connection.rollback(); return res.status(404).json({ message: 'Rol no encontrado' }) }
    if (roles[0].is_system) { await connection.rollback(); return res.status(409).json({ message: 'El rol del sistema no se puede modificar' }) }
    const validation = await validatePermissions(connection, permissionIds)
    if (!validation.valid) { await connection.rollback(); return res.status(400).json({ message: validation.message }) }
    if (!isActive) {
      const [[{ assignedUsers }]] = await connection.query('SELECT COUNT(*) AS assignedUsers FROM administrators WHERE role_id = ?', [req.params.id])
      if (Number(assignedUsers) > 0) { await connection.rollback(); return res.status(409).json({ message: 'No puedes desactivar un rol que tiene usuarios asignados' }) }
    }
    await connection.query('UPDATE roles SET name = ?, description = ?, is_active = ? WHERE id = ?', [name, description, isActive, req.params.id])
    await assignPermissions(connection, req.params.id, permissionIds)
    await connection.commit()
    res.json({ message: 'Rol actualizado correctamente' })
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe un rol con ese nombre' })
    next(error)
  } finally { connection.release() }
}

export async function deleteRole(req, res, next) {
  try {
    const [roles] = await pool.query(
      `SELECT r.is_system, COUNT(a.id) AS assigned_users
       FROM roles r LEFT JOIN administrators a ON a.role_id = r.id
       WHERE r.id = ? GROUP BY r.id`,
      [req.params.id],
    )
    if (!roles.length) return res.status(404).json({ message: 'Rol no encontrado' })
    if (roles[0].is_system) return res.status(409).json({ message: 'El rol del sistema no se puede eliminar' })
    if (Number(roles[0].assigned_users) > 0) return res.status(409).json({ message: 'Asigna otro rol a sus usuarios antes de eliminarlo' })
    await pool.query('DELETE FROM roles WHERE id = ?', [req.params.id])
    res.json({ message: 'Rol eliminado correctamente' })
  } catch (error) { next(error) }
}
