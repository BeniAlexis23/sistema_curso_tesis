import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { pool } from '../config/database.js'

const modalities = new Set(['in_person', 'synchronous'])
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

function normalizeLocalDateTime(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(localDateTimePattern)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '00'] = match
  const parts = [year, month, day, hour, minute, second].map(Number)
  const candidate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]))
  const valid = candidate.getUTCFullYear() === parts[0]
    && candidate.getUTCMonth() === parts[1] - 1
    && candidate.getUTCDate() === parts[2]
    && candidate.getUTCHours() === parts[3]
    && candidate.getUTCMinutes() === parts[4]
    && candidate.getUTCSeconds() === parts[5]
  return valid ? `${year}-${month}-${day} ${hour}:${minute}:${second}` : null
}

async function hasPermission(connection, administratorId, permissionCode) {
  const [rows] = await connection.query(
    `SELECT 1 FROM administrators a
     JOIN roles r ON r.id = a.role_id AND r.is_active = 1
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE a.id = ? AND a.is_active = 1 AND p.code = ? LIMIT 1`,
    [administratorId, permissionCode],
  )
  return rows.length > 0
}

async function isAssignableTeacher(connection, administratorId) {
  const [rows] = await connection.query(
    `SELECT 1 FROM administrators a
     JOIN roles r ON r.id = a.role_id AND r.is_active = 1 AND r.name = 'Docente'
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id AND p.code = 'attendance.mark'
     WHERE a.id = ? AND a.is_active = 1
       AND a.last_names IS NOT NULL AND TRIM(a.last_names) <> ''
     LIMIT 1`,
    [administratorId],
  )
  return rows.length > 0
}

async function getAttendanceRows({ administratorId = null, moduleId = null } = {}) {
  const conditions = []
  const params = []
  if (administratorId) { conditions.push('s.teacher_id = ?'); params.push(administratorId) }
  if (moduleId) { conditions.push('m.id = ?'); params.push(moduleId) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const [rows] = await pool.query(
    `SELECT m.id AS module_id, m.module_number, m.name AS module_name,
            m.teacher_id AS current_teacher_id,
            current_teacher.name AS current_teacher_name,
            current_teacher.last_names AS current_teacher_last_names,
            s.id AS session_id, s.session_number, s.topic, s.modality,
            s.scheduled_start, s.scheduled_end, s.check_in_opens_minutes, s.teacher_id,
            teacher.name AS teacher_name, teacher.last_names AS teacher_last_names,
            teacher.email AS teacher_email,
            ta.id AS attendance_id, ta.check_in_at, ta.check_out_at,
            CASE
              WHEN ta.id IS NULL THEN 'pending'
              WHEN ta.check_out_at IS NULL THEN 'checked_in'
              ELSE 'completed'
            END AS attendance_status
     FROM course_modules m
     JOIN module_sessions s ON s.module_id = m.id
     LEFT JOIN administrators current_teacher ON current_teacher.id = m.teacher_id
     LEFT JOIN administrators teacher ON teacher.id = s.teacher_id
     LEFT JOIN teacher_attendances ta ON ta.session_id = s.id
     ${where}
     ORDER BY m.module_number, s.session_number`,
    params,
  )
  return rows
}

async function getTeacherOptions() {
  const [teachers] = await pool.query(
    `SELECT DISTINCT a.id, a.name, a.last_names, a.email
     FROM administrators a
     JOIN roles r ON r.id = a.role_id AND r.is_active = 1
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id AND p.code = 'attendance.mark'
     WHERE a.is_active = 1 AND r.name = 'Docente'
       AND a.last_names IS NOT NULL AND TRIM(a.last_names) <> ''
     ORDER BY a.last_names, a.name`,
  )
  return teachers
}

export async function listAttendance(req, res, next) {
  try {
    const canManage = await hasPermission(pool, req.admin.id, 'attendance.manage')
    const [rows, teachers, [[clock]]] = await Promise.all([
      getAttendanceRows({ administratorId: canManage ? null : req.admin.id }),
      canManage ? getTeacherOptions() : Promise.resolve([]),
      pool.query(`SELECT DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now`),
    ])
    res.json({ data: { rows, teachers, canManage, currentTime: clock.peru_now } })
  } catch (error) { next(error) }
}

export async function assignModuleTeacher(req, res, next) {
  const teacherId = req.body.teacherId === null || req.body.teacherId === '' ? null : Number(req.body.teacherId)
  if (teacherId !== null && !Number.isInteger(teacherId)) return res.status(400).json({ message: 'Selecciona un docente válido' })
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [modules] = await connection.query('SELECT id FROM course_modules WHERE id = ? FOR UPDATE', [req.params.id])
    if (!modules.length) { await connection.rollback(); return res.status(404).json({ message: 'Módulo no encontrado' }) }
    if (teacherId !== null && !(await isAssignableTeacher(connection, teacherId))) {
      await connection.rollback()
      return res.status(400).json({ message: 'Selecciona un usuario activo con rol Docente, permiso de marcación y apellidos completos' })
    }
    await connection.query('UPDATE course_modules SET teacher_id = ? WHERE id = ?', [teacherId, req.params.id])
    await connection.query(
      `UPDATE module_sessions s
       LEFT JOIN teacher_attendances ta ON ta.session_id = s.id
       SET s.teacher_id = ?
       WHERE s.module_id = ? AND ta.id IS NULL
         AND (s.teacher_id IS NULL OR s.scheduled_start > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`,
      [teacherId, req.params.id],
    )
    await connection.commit()
    res.json({ message: teacherId ? 'Docente asignado correctamente' : 'Asignación de docente retirada' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
}

export async function updateSession(req, res, next) {
  const topic = req.body.topic?.trim()
  const modality = req.body.modality
  const scheduledStart = normalizeLocalDateTime(req.body.scheduledStart)
  const scheduledEnd = normalizeLocalDateTime(req.body.scheduledEnd)
  const checkInOpensMinutes = Number(req.body.checkInOpensMinutes)
  if (!topic || topic.length > 500 || !modalities.has(modality) || !scheduledStart || !scheduledEnd
      || scheduledEnd <= scheduledStart || !Number.isInteger(checkInOpensMinutes) || checkInOpensMinutes < 0 || checkInOpensMinutes > 720) {
    return res.status(400).json({ message: 'Revisa el tema, modalidad y horario de la sesión' })
  }
  try {
    const [result] = await pool.query(
      `UPDATE module_sessions s
       LEFT JOIN teacher_attendances ta ON ta.session_id = s.id
       SET s.topic = ?, s.modality = ?, s.scheduled_start = ?, s.scheduled_end = ?,
           s.check_in_opens_minutes = ?
       WHERE s.id = ? AND ta.id IS NULL`,
      [topic, modality, scheduledStart, scheduledEnd, checkInOpensMinutes, req.params.id],
    )
    if (!result.affectedRows) {
      const [sessions] = await pool.query('SELECT id FROM module_sessions WHERE id = ?', [req.params.id])
      return res.status(sessions.length ? 409 : 404).json({ message: sessions.length ? 'No puedes editar una sesión que ya tiene una marcación' : 'Sesión no encontrada' })
    }
    res.json({ message: 'Sesión actualizada correctamente' })
  } catch (error) { next(error) }
}

export async function checkIn(req, res, next) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [sessions] = await connection.query(
      `SELECT s.id, s.teacher_id, s.scheduled_start, s.scheduled_end,
              DATE_SUB(s.scheduled_start, INTERVAL s.check_in_opens_minutes MINUTE) AS opens_at,
              DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now
       FROM module_sessions s WHERE s.id = ? FOR UPDATE`,
      [req.params.id],
    )
    if (!sessions.length) { await connection.rollback(); return res.status(404).json({ message: 'Sesión no encontrada' }) }
    const session = sessions[0]
    if (Number(session.teacher_id) !== Number(req.admin.id)) { await connection.rollback(); return res.status(403).json({ message: 'Esta sesión no está asignada a tu usuario' }) }
    const [existing] = await connection.query('SELECT id FROM teacher_attendances WHERE session_id = ? FOR UPDATE', [session.id])
    if (existing.length) { await connection.rollback(); return res.status(409).json({ message: 'La entrada de esta sesión ya fue registrada' }) }
    if (session.peru_now < session.opens_at) { await connection.rollback(); return res.status(409).json({ message: `La entrada estará disponible desde ${session.opens_at}` }) }
    if (session.peru_now > session.scheduled_end) { await connection.rollback(); return res.status(409).json({ message: 'El horario de esta sesión ya finalizó; solicita al administrador editar la marcación' }) }
    await connection.query(
      `INSERT INTO teacher_attendances (session_id, teacher_id, check_in_at)
       VALUES (?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`,
      [session.id, req.admin.id],
    )
    await connection.commit()
    res.status(201).json({ message: 'Entrada registrada correctamente' })
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'La entrada de esta sesión ya fue registrada' })
    next(error)
  } finally { connection.release() }
}

export async function checkOut(req, res, next) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [attendances] = await connection.query(
      `SELECT ta.id, ta.teacher_id, ta.check_out_at, s.scheduled_start,
              DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now
       FROM teacher_attendances ta JOIN module_sessions s ON s.id = ta.session_id
       WHERE ta.session_id = ? FOR UPDATE`,
      [req.params.id],
    )
    if (!attendances.length) { await connection.rollback(); return res.status(409).json({ message: 'Primero debes registrar tu entrada' }) }
    const attendance = attendances[0]
    if (Number(attendance.teacher_id) !== Number(req.admin.id)) { await connection.rollback(); return res.status(403).json({ message: 'Esta marcación no pertenece a tu usuario' }) }
    if (attendance.check_out_at) { await connection.rollback(); return res.status(409).json({ message: 'La salida de esta sesión ya fue registrada' }) }
    if (attendance.peru_now < attendance.scheduled_start) { await connection.rollback(); return res.status(409).json({ message: 'La salida estará disponible cuando inicie la sesión' }) }
    await connection.query(
      `UPDATE teacher_attendances SET check_out_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)
       WHERE id = ?`,
      [attendance.id],
    )
    await connection.commit()
    res.json({ message: 'Salida registrada correctamente' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
}

export async function updateAttendance(req, res, next) {
  const checkInAt = normalizeLocalDateTime(req.body.checkInAt)
  const checkOutAt = req.body.checkOutAt ? normalizeLocalDateTime(req.body.checkOutAt) : null
  if (!checkInAt || (req.body.checkOutAt && !checkOutAt) || (checkOutAt && checkOutAt < checkInAt)) {
    return res.status(400).json({ message: 'Indica horas de entrada y salida válidas' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [sessions] = await connection.query(
      `SELECT s.id, s.teacher_id, s.scheduled_start,
              DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now
       FROM module_sessions s WHERE s.id = ? FOR UPDATE`,
      [req.params.id],
    )
    if (!sessions.length) { await connection.rollback(); return res.status(404).json({ message: 'Sesión no encontrada' }) }
    const session = sessions[0]
    if (!session.teacher_id) { await connection.rollback(); return res.status(409).json({ message: 'Asigna un docente antes de editar la marcación' }) }
    const sessionDate = String(session.scheduled_start).slice(0, 10)
    if (checkInAt.slice(0, 10) !== sessionDate || (checkOutAt && checkOutAt.slice(0, 10) !== sessionDate)) {
      await connection.rollback()
      return res.status(400).json({ message: 'Las marcaciones corregidas deben corresponder a la fecha de la sesión' })
    }
    if (checkInAt > session.peru_now || (checkOutAt && checkOutAt > session.peru_now)) {
      await connection.rollback()
      return res.status(400).json({ message: 'No puedes registrar marcaciones futuras' })
    }
    const [rows] = await connection.query(
      'SELECT id FROM teacher_attendances WHERE session_id = ? FOR UPDATE',
      [session.id],
    )
    if (rows.length) {
      await connection.query(
        'UPDATE teacher_attendances SET teacher_id = ?, check_in_at = ?, check_out_at = ? WHERE id = ?',
        [session.teacher_id, checkInAt, checkOutAt, rows[0].id],
      )
    } else {
      await connection.query(
        'INSERT INTO teacher_attendances (session_id, teacher_id, check_in_at, check_out_at) VALUES (?, ?, ?, ?)',
        [session.id, session.teacher_id, checkInAt, checkOutAt],
      )
    }
    await connection.commit()
    res.json({ message: 'Marcación actualizada correctamente' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
}

const datePart = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : ''
const timePart = value => value ? String(value).slice(11, 16) : ''
const modalityLabel = value => value === 'in_person' ? 'Presencial' : 'Síncrona'

export async function exportAttendanceExcel(req, res, next) {
  try {
    const moduleId = req.query.moduleId ? Number(req.query.moduleId) : null
    if (moduleId !== null && !Number.isInteger(moduleId)) return res.status(400).json({ message: 'Módulo inválido' })
    const rows = await getAttendanceRows({ moduleId })
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Asistencia docente', { views: [{ state: 'frozen', ySplit: 1 }] })
    sheet.columns = [
      { header: 'Módulo', key: 'module', width: 18 }, { header: 'Sesión', key: 'session', width: 10 },
      { header: 'Fecha', key: 'date', width: 13 }, { header: 'Modalidad', key: 'modality', width: 14 },
      { header: 'Nombres', key: 'names', width: 24 }, { header: 'Apellidos', key: 'lastNames', width: 25 },
      { header: 'Correo electrónico', key: 'email', width: 32 }, { header: 'Hora programada', key: 'schedule', width: 20 },
      { header: 'Entrada', key: 'checkIn', width: 13 }, { header: 'Salida', key: 'checkOut', width: 13 },
    ]
    rows.forEach(row => sheet.addRow({
      module: row.module_name, session: row.session_number, date: datePart(row.scheduled_start),
      modality: modalityLabel(row.modality), names: row.teacher_name || '', lastNames: row.teacher_last_names || '',
      email: row.teacher_email || '', schedule: `${timePart(row.scheduled_start)} - ${timePart(row.scheduled_end)}`,
      checkIn: timePart(row.check_in_at), checkOut: timePart(row.check_out_at),
    }))
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4D96' } }
      cell.alignment = { vertical: 'middle' }
    })
    sheet.getRow(1).height = 25
    sheet.autoFilter = { from: 'A1', to: 'J1' }
    sheet.eachRow((row, index) => { if (index > 1 && index % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F9' } } }) })
    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-docentes-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
}

export async function exportAttendancePdf(req, res, next) {
  try {
    const moduleId = req.query.moduleId ? Number(req.query.moduleId) : null
    if (moduleId !== null && !Number.isInteger(moduleId)) return res.status(400).json({ message: 'Módulo inválido' })
    const rows = await getAttendanceRows({ moduleId })
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-docentes-${new Date().toISOString().slice(0, 10)}.pdf"`)
    doc.pipe(res)
    const columns = [
      { x: 28, w: 75, title: 'Módulo' }, { x: 103, w: 30, title: 'Ses.' },
      { x: 133, w: 55, title: 'Fecha' }, { x: 188, w: 65, title: 'Modalidad' },
      { x: 253, w: 95, title: 'Nombres' }, { x: 348, w: 105, title: 'Apellidos' },
      { x: 453, w: 150, title: 'Correo' }, { x: 603, w: 70, title: 'Horario' },
      { x: 673, w: 42, title: 'Entrada' }, { x: 715, w: 42, title: 'Salida' },
    ]
    const drawHeader = () => {
      doc.fillColor('#0b4d96').rect(28, 76, 729, 24).fill()
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7)
      columns.forEach(column => doc.text(column.title, column.x + 3, 84, { width: column.w - 6 }))
    }
    doc.fillColor('#071a35').font('Helvetica-Bold').fontSize(18).text('Control de asistencia docente', 28, 28)
    doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(`Facultad de Ingeniería · Generado el ${new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}`, 28, 53)
    drawHeader()
    let y = 100
    rows.forEach((row, index) => {
      if (y > 535) { doc.addPage(); drawHeader(); y = 100 }
      if (index % 2 === 0) doc.fillColor('#f3f6f9').rect(28, y, 729, 28).fill()
      const values = [row.module_name, row.session_number, datePart(row.scheduled_start), modalityLabel(row.modality),
        row.teacher_name || '', row.teacher_last_names || '', row.teacher_email || '',
        `${timePart(row.scheduled_start)}-${timePart(row.scheduled_end)}`,
        timePart(row.check_in_at) || '-', timePart(row.check_out_at) || '-']
      doc.fillColor('#243b53').font('Helvetica').fontSize(6.8)
      values.forEach((value, columnIndex) => doc.text(String(value), columns[columnIndex].x + 3, y + 9, { width: columns[columnIndex].w - 6, ellipsis: true, lineBreak: false }))
      y += 28
    })
    doc.end()
  } catch (error) { next(error) }
}
