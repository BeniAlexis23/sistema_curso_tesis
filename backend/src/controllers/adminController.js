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
