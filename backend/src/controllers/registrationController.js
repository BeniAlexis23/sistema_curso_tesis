import fs from 'node:fs/promises'
import { pool } from '../config/database.js'
import { createPaymentSchedule } from '../services/paymentSchedule.js'

const requiredFiles = ['bachelorDiploma', 'suneduRegistration', 'futRequest', 'paymentVoucher']

async function removeUploadedFiles(files = {}) {
  await Promise.all(Object.values(files).flat().map((file) => fs.unlink(file.path).catch(() => {})))
}

export async function createRegistration(req, res, next) {
  const { firstNames, lastNames, dni, email, phone, paymentMode } = req.body
  const fields = [firstNames, lastNames, dni, email, phone]

  if (fields.some((value) => !value?.trim()) || !/^\d{8}$/.test(dni) || !/^\S+@\S+\.\S+$/.test(email) || !['option1', 'option2'].includes(paymentMode)) {
    await removeUploadedFiles(req.files)
    return res.status(400).json({ message: 'Revisa los datos personales ingresados' })
  }
  if (requiredFiles.some((field) => !req.files?.[field]?.[0])) {
    await removeUploadedFiles(req.files)
    return res.status(400).json({ message: 'Debes adjuntar los cuatro documentos PDF' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [courses] = await connection.query('SELECT id FROM courses WHERE is_active = 1 ORDER BY id DESC LIMIT 1')
    if (!courses.length) throw Object.assign(new Error('No hay un curso activo'), { status: 409 })

    const [duplicates] = await connection.query(
      'SELECT id FROM registrations WHERE course_id = ? AND (dni = ? OR email = ?) LIMIT 1',
      [courses[0].id, dni, email.toLowerCase()],
    )
    if (duplicates.length) throw Object.assign(new Error('Ya existe una inscripción con este DNI o correo'), { status: 409 })

    const [result] = await connection.query(
      `INSERT INTO registrations (course_id, first_names, last_names, dni, email, phone, payment_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [courses[0].id, firstNames.trim(), lastNames.trim(), dni, email.trim().toLowerCase(), phone.trim(), paymentMode],
    )

    const documents = requiredFiles.map((type) => [result.insertId, type, req.files[type][0].filename, req.files[type][0].originalname])
    await connection.query(
      'INSERT INTO registration_documents (registration_id, document_type, stored_name, original_name) VALUES ?',
      [documents],
    )
    await createPaymentSchedule(connection, result.insertId, paymentMode)
    await connection.commit()
    res.status(201).json({ message: 'Inscripción registrada correctamente', data: { registrationId: result.insertId } })
  } catch (error) {
    await connection.rollback()
    await removeUploadedFiles(req.files)
    if (error.status) return res.status(error.status).json({ message: error.message })
    next(error)
  } finally { connection.release() }
}
