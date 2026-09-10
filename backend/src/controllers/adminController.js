import path from 'node:path'
import fs from 'node:fs/promises'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../config/database.js'
import { sendApprovalEmail } from '../services/emailService.js'
import { replacePaymentSchedule } from '../services/paymentSchedule.js'

export async function login(req, res, next) {
  try {
    const email = req.body.email?.trim().toLowerCase()
    const password = req.body.password
    if (!email || !password) return res.status(400).json({ message: 'Correo y contraseña son obligatorios' })
    const [admins] = await pool.query('SELECT id, name, email, password_hash FROM administrators WHERE email = ? AND is_active = 1 LIMIT 1', [email])
    if (!admins.length || !(await bcrypt.compare(password, admins[0].password_hash))) return res.status(401).json({ message: 'Credenciales incorrectas' })
    const admin = { id: admins[0].id, name: admins[0].name, email: admins[0].email }
    const token = jwt.sign(admin, process.env.JWT_SECRET || 'development-secret-change-me', { expiresIn: '8h' })
    res.json({ data: { token, admin } })
  } catch (error) { next(error) }
}

export async function getCurrentUser(req, res, next) {
  try {
    const [admins] = await pool.query(
      'SELECT id, name, email, is_active, created_at FROM administrators WHERE id = ? AND is_active = 1 LIMIT 1',
      [req.admin.id],
    )
    if (!admins.length) return res.status(404).json({ message: 'Usuario no encontrado' })
    res.json({ data: admins[0] })
  } catch (error) { next(error) }
}

export async function listUsers(_req, res, next) {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, is_active, created_at FROM administrators ORDER BY created_at DESC',
    )
    res.json({ data: rows })
  } catch (error) { next(error) }
}

export async function createUser(req, res, next) {
  try {
    const { name, email, password } = req.body
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'Todos los campos son obligatorios' })
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ message: 'El correo electrónico no es válido' })
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const [result] = await pool.query(
      'INSERT INTO administrators (name, email, password_hash, is_active) VALUES (?, ?, ?, 1)',
      [name.trim(), email.trim().toLowerCase(), passwordHash],
    )

    res.status(201).json({
      message: 'Usuario creado correctamente',
      data: {
        id: result.insertId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        is_active: 1,
      },
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El correo electrónico ya se encuentra registrado' })
    }
    next(error)
  }
}

export async function updateUser(req, res, next) {
  try {
    const { id } = req.params
    const { name, email, isActive, password } = req.body

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({ message: 'El nombre y el correo son obligatorios' })
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({ message: 'El correo electrónico no es válido' })
    }

    const activeValue = isActive === false || isActive === 0 || isActive === '0' ? 0 : 1

    if (Number(id) === req.admin.id && activeValue === 0) {
      return res.status(400).json({ message: 'No puedes desactivar tu propia cuenta en sesión' })
    }

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' })
      }
      const passwordHash = await bcrypt.hash(password, 12)
      const [result] = await pool.query(
        'UPDATE administrators SET name = ?, email = ?, is_active = ?, password_hash = ? WHERE id = ?',
        [name.trim(), email.trim().toLowerCase(), activeValue, passwordHash, id],
      )
      if (!result.affectedRows) return res.status(404).json({ message: 'Usuario no encontrado' })
    } else {
      const [result] = await pool.query(
        'UPDATE administrators SET name = ?, email = ?, is_active = ? WHERE id = ?',
        [name.trim(), email.trim().toLowerCase(), activeValue, id],
      )
      if (!result.affectedRows) return res.status(404).json({ message: 'Usuario no encontrado' })
    }

    res.json({ message: 'Usuario actualizado correctamente' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El correo electrónico ya se encuentra registrado por otro usuario' })
    }
    next(error)
  }
}


export async function listRegistrations(req, res, next) {
  try {
    const status = req.query.status
    const params = []
    let where = ''
    if (status && ['pending', 'approved', 'observed', 'rejected'].includes(status)) { where = 'WHERE r.status = ?'; params.push(status) }
    const [rows] = await pool.query(
      `SELECT r.id, r.first_names, r.last_names, r.dni, r.email, r.phone, r.payment_mode, r.status, r.created_at,
              COUNT(d.id) AS document_count
       FROM registrations r LEFT JOIN registration_documents d ON d.registration_id = r.id
       ${where} GROUP BY r.id ORDER BY r.created_at DESC`, params,
    )
    res.json({ data: rows })
  } catch (error) { next(error) }
}

export async function getRegistration(req, res, next) {
  try {
    const [rows] = await pool.query('SELECT id, first_names, last_names, dni, email, phone, payment_mode, status, created_at FROM registrations WHERE id = ?', [req.params.id])
    if (!rows.length) return res.status(404).json({ message: 'Inscripción no encontrada' })
    const [documents] = await pool.query('SELECT id, document_type, original_name, uploaded_at FROM registration_documents WHERE registration_id = ? ORDER BY id', [req.params.id])
    res.json({ data: { ...rows[0], documents } })
  } catch (error) { next(error) }
}

export async function updateRegistration(req, res, next) {
  const { firstNames, lastNames, dni, email, phone, paymentMode } = req.body
  if ([firstNames, lastNames, dni, email, phone].some(value => !value?.trim()) || !/^\d{8}$/.test(dni) || !/^\S+@\S+\.\S+$/.test(email) || !['option1', 'option2'].includes(paymentMode)) {
    return res.status(400).json({ message: 'Revisa los datos ingresados' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [current] = await connection.query('SELECT payment_mode FROM registrations WHERE id = ? FOR UPDATE', [req.params.id])
    if (!current.length) { await connection.rollback(); return res.status(404).json({ message: 'Inscripción no encontrada' }) }
    if (current[0].payment_mode !== paymentMode) {
      const [[{ paidCount }]] = await connection.query(
        `SELECT COUNT(*) AS paidCount FROM registration_payments WHERE registration_id = ? AND status = 'paid'`,
        [req.params.id],
      )
      if (Number(paidCount) > 0) {
        await connection.rollback()
        return res.status(409).json({ message: 'No se puede cambiar la modalidad porque ya existen pagos registrados' })
      }
      await replacePaymentSchedule(connection, req.params.id, paymentMode)
    }
    await connection.query(
      `UPDATE registrations SET first_names = ?, last_names = ?, dni = ?, email = ?, phone = ?, payment_mode = ? WHERE id = ?`,
      [firstNames.trim(), lastNames.trim(), dni, email.trim().toLowerCase(), phone.trim(), paymentMode, req.params.id],
    )
    await connection.commit()
    res.json({ message: 'Datos actualizados correctamente' })
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'El DNI o correo ya pertenece a otra inscripción' })
    next(error)
  } finally { connection.release() }
}

export async function deleteRegistration(req, res, next) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [documents] = await connection.query('SELECT stored_name FROM registration_documents WHERE registration_id = ?', [req.params.id])
    const [result] = await connection.query('DELETE FROM registrations WHERE id = ?', [req.params.id])
    if (!result.affectedRows) { await connection.rollback(); return res.status(404).json({ message: 'Inscripción no encontrada' }) }
    await connection.commit()
    await Promise.all(documents.map(document => fs.unlink(path.resolve('uploads', document.stored_name)).catch(() => {})))
    res.json({ message: 'Inscripción eliminada correctamente' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
}

export async function updateStatus(req, res, next) {
  try {
    const { status, observation } = req.body
    if (!['pending', 'approved', 'observed', 'rejected'].includes(status)) return res.status(400).json({ message: 'Estado no válido' })
    if (status === 'observed' && !observation?.trim()) return res.status(400).json({ message: 'Debes indicar la observación' })
    const [result] = await pool.query(
      'UPDATE registrations SET status = ?, observation_text = ?, correction_token_hash = ? WHERE id = ?',
      [status, status === 'observed' ? observation.trim() : null, null, req.params.id],
    )
    if (!result.affectedRows) return res.status(404).json({ message: 'Inscripción no encontrada' })
    let email = { sent: false, reason: 'NOT_REQUIRED' }
    if (status === 'approved') {
      const [participants] = await pool.query('SELECT first_names, last_names, dni, email, phone, payment_mode FROM registrations WHERE id = ?', [req.params.id])
      email = await sendApprovalEmail(participants[0])
    }
    res.json({ message: 'Estado actualizado correctamente', data: { email } })
  } catch (error) { next(error) }
}

export async function replaceDocument(req, res, next) {
  if (!req.file) return res.status(400).json({ message: 'Selecciona un archivo PDF' })
  try {
    const [documents] = await pool.query(
      'SELECT stored_name FROM registration_documents WHERE id = ? AND registration_id = ?',
      [req.params.documentId, req.params.id],
    )
    if (!documents.length) {
      await fs.unlink(req.file.path).catch(() => {})
      return res.status(404).json({ message: 'Documento no encontrado' })
    }
    await pool.query(
      'UPDATE registration_documents SET stored_name = ?, original_name = ?, uploaded_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.file.filename, req.file.originalname, req.params.documentId],
    )
    await fs.unlink(path.resolve('uploads', documents[0].stored_name)).catch(() => {})
    res.json({ message: 'Documento reemplazado correctamente', data: { originalName: req.file.originalname } })
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {})
    next(error)
  }
}

export async function downloadDocument(req, res, next) {
  try {
    const [documents] = await pool.query('SELECT stored_name, original_name FROM registration_documents WHERE id = ? AND registration_id = ?', [req.params.documentId, req.params.id])
    if (!documents.length) return res.status(404).json({ message: 'Documento no encontrado' })
    res.download(path.resolve('uploads', documents[0].stored_name), documents[0].original_name)
  } catch (error) { next(error) }
}
