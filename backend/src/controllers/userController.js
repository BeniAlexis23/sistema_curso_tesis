import bcrypt from 'bcryptjs'
import { pool } from '../config/database.js'

const emailPattern = /^\S+@\S+\.\S+$/

async function getActiveRole(roleId) {
  const [roles] = await pool.query('SELECT id FROM roles WHERE id = ? AND is_active = 1 LIMIT 1', [roleId])
  return roles[0]
}

async function protectsLastSuperAdministrator(userId, nextRoleId, nextIsActive) {
  const [users] = await pool.query(
    `SELECT a.is_active, r.is_system, a.role_id
     FROM administrators a JOIN roles r ON r.id = a.role_id
     WHERE a.id = ? LIMIT 1`,
    [userId],
  )
  if (!users.length) return { missing: true }
  const user = users[0]
  const removesSuperAccess = user.is_system && user.is_active && (!nextIsActive || Number(nextRoleId) !== Number(user.role_id))
  if (!removesSuperAccess) return { user }
  const [[{ activeSuperAdministrators }]] = await pool.query(
    `SELECT COUNT(*) AS activeSuperAdministrators
     FROM administrators a JOIN roles r ON r.id = a.role_id
     WHERE a.is_active = 1 AND r.is_system = 1`,
  )
  return { user, isLastSuperAdministrator: Number(activeSuperAdministrators) <= 1 }
}

export async function listUsers(_req, res, next) {
  try {
    const [users] = await pool.query(
      `SELECT a.id, a.name, a.email, a.is_active, a.created_at, a.updated_at,
              r.id AS role_id, r.name AS role_name, r.is_system AS role_is_system
       FROM administrators a JOIN roles r ON r.id = a.role_id
       ORDER BY a.name, a.id`,
    )
    res.json({ data: users })
  } catch (error) { next(error) }
}

export async function listUserRoleOptions(_req, res, next) {
  try {
    const [roles] = await pool.query('SELECT id, name FROM roles WHERE is_active = 1 ORDER BY is_system DESC, name')
    res.json({ data: roles })
  } catch (error) { next(error) }
}

export async function createUser(req, res, next) {
  try {
    const name = req.body.name?.trim()
    const email = req.body.email?.trim().toLowerCase()
    const password = req.body.password
    const roleId = Number(req.body.roleId)
    if (!name || name.length > 120 || !emailPattern.test(email || '') || email.length > 180 || typeof password !== 'string' || password.length < 8 || !Number.isInteger(roleId)) {
      return res.status(400).json({ message: 'Revisa el nombre, correo, contraseña y rol ingresados' })
    }
    if (!(await getActiveRole(roleId))) return res.status(400).json({ message: 'El rol seleccionado no existe o está inactivo' })
    const passwordHash = await bcrypt.hash(password, 12)
    const [result] = await pool.query(
      'INSERT INTO administrators (role_id, name, email, password_hash) VALUES (?, ?, ?, ?)',
      [roleId, name, email, passwordHash],
    )
    res.status(201).json({ message: 'Usuario creado correctamente', data: { userId: result.insertId } })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe un usuario con ese correo' })
    next(error)
  }
}

export async function updateUser(req, res, next) {
  try {
    const name = req.body.name?.trim()
    const email = req.body.email?.trim().toLowerCase()
    const password = req.body.password
    const changesPassword = password !== undefined && password !== ''
    const roleId = Number(req.body.roleId)
    const isActive = req.body.isActive
    if (!name || name.length > 120 || !emailPattern.test(email || '') || email.length > 180 || !Number.isInteger(roleId) || typeof isActive !== 'boolean' || (changesPassword && (typeof password !== 'string' || password.length < 8))) {
      return res.status(400).json({ message: 'Revisa los datos ingresados' })
    }
    if (!(await getActiveRole(roleId))) return res.status(400).json({ message: 'El rol seleccionado no existe o está inactivo' })
    if (Number(req.params.id) === Number(req.admin.id) && !isActive) return res.status(409).json({ message: 'No puedes desactivar tu propio usuario' })

    const protection = await protectsLastSuperAdministrator(req.params.id, roleId, isActive)
    if (protection.missing) return res.status(404).json({ message: 'Usuario no encontrado' })
    if (protection.isLastSuperAdministrator) return res.status(409).json({ message: 'Debe permanecer al menos un super administrador activo' })

    const values = [roleId, name, email, isActive]
    let passwordSql = ''
    if (changesPassword) {
      passwordSql = ', password_hash = ?'
      values.push(await bcrypt.hash(password, 12))
    }
    values.push(req.params.id)
    await pool.query(
      `UPDATE administrators SET role_id = ?, name = ?, email = ?, is_active = ?${passwordSql} WHERE id = ?`,
      values,
    )
    res.json({ message: 'Usuario actualizado correctamente' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe un usuario con ese correo' })
    next(error)
  }
}

export async function deleteUser(req, res, next) {
  try {
    if (Number(req.params.id) === Number(req.admin.id)) return res.status(409).json({ message: 'No puedes eliminar tu propio usuario' })
    const protection = await protectsLastSuperAdministrator(req.params.id, null, false)
    if (protection.missing) return res.status(404).json({ message: 'Usuario no encontrado' })
    if (protection.isLastSuperAdministrator) return res.status(409).json({ message: 'Debe permanecer al menos un super administrador activo' })
    await pool.query('DELETE FROM administrators WHERE id = ?', [req.params.id])
    res.json({ message: 'Usuario eliminado correctamente' })
  } catch (error) { next(error) }
}
