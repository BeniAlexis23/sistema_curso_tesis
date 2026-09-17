import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { pool } from '../config/database.js'
import {
  attendanceConformityFooterHeight, drawAttendanceConformity,
  drawInstitutionalAttendanceHeader, drawPdfLabeledValue, uppercase,
} from '../utils/attendancePdfLayout.js'
import {
  clearAttendanceConformityForModule, clearAttendanceConformityForSession,
  getAttendanceConformity, setActiveAttendanceConformity,
} from '../services/attendanceConformity.js'
import {
  addInformationField, setupAttendanceSheet, styleAttendanceDataRow,
  styleAttendanceTableHeader, toExcelDate,
} from '../utils/attendanceExcelLayout.js'

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
     JOIN roles r ON r.id = a.role_id AND r.is_active = 1
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
            c.id AS course_id, c.name AS course_name, c.attendance_conformity_at,
            m.teacher_id AS current_teacher_id,
            current_teacher.name AS current_teacher_name,
            current_teacher.last_names AS current_teacher_last_names,
            s.id AS session_id, s.session_number, s.topic, s.modality,
            s.scheduled_start, s.scheduled_end, s.check_in_opens_minutes, s.teacher_id,
            teacher.name AS teacher_name, teacher.last_names AS teacher_last_names,
            teacher.email AS teacher_email,
            ta.id AS attendance_id, ta.check_in_at, ta.check_out_at,
            EXISTS(SELECT 1 FROM registration_attendances ra
                   WHERE ra.session_id = s.id) AS has_student_attendance,
            CASE
              WHEN ta.id IS NULL THEN 'pending'
              WHEN ta.check_out_at IS NULL THEN 'checked_in'
              ELSE 'completed'
            END AS attendance_status
     FROM course_modules m
     JOIN courses c ON c.id = m.course_id
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
     WHERE a.is_active = 1
       AND a.last_names IS NOT NULL AND TRIM(a.last_names) <> ''
     ORDER BY a.last_names, a.name`,
  )
  return teachers
}

export async function listAttendance(req, res, next) {
  try {
    const [canManage, canApprove] = await Promise.all([
      hasPermission(pool, req.admin.id, 'attendance.manage'),
      hasPermission(pool, req.admin.id, 'attendance.approve'),
    ])
    const [rows, teachers, [[clock]], conformity] = await Promise.all([
      getAttendanceRows({ administratorId: canManage || canApprove ? null : req.admin.id }),
      canManage ? getTeacherOptions() : Promise.resolve([]),
      pool.query(`SELECT DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now`),
      getAttendanceConformity(pool),
    ])
    res.json({ data: {
      rows, teachers, canManage, canApprove, currentTime: clock.peru_now,
      conformityAt: conformity.attendance_conformity_at,
    } })
  } catch (error) { next(error) }
}

export async function updateAttendanceConformity(req, res, next) {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ message: 'Indica un estado de conformidad válido' })
  try {
    const conformity = await setActiveAttendanceConformity(pool, req.body.enabled)
    if (!conformity) return res.status(404).json({ message: 'No hay un curso activo para actualizar' })
    res.json({
      message: req.body.enabled ? 'Conformidad activada correctamente' : 'Conformidad retirada correctamente',
      data: { conformityAt: conformity.attendance_conformity_at },
    })
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
      return res.status(400).json({ message: 'Selecciona un usuario activo con permiso de marcación y apellidos completos' })
    }
    await connection.query('UPDATE course_modules SET teacher_id = ? WHERE id = ?', [teacherId, req.params.id])
    await connection.query(
      `UPDATE module_sessions s
       LEFT JOIN teacher_attendances ta ON ta.session_id = s.id
       LEFT JOIN registration_attendances ra ON ra.session_id = s.id
       SET s.teacher_id = ?
       WHERE s.module_id = ? AND ta.id IS NULL AND ra.id IS NULL
         AND (s.teacher_id IS NULL OR s.scheduled_start > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`,
      [teacherId, req.params.id],
    )
    await clearAttendanceConformityForModule(connection, req.params.id)
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
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [result] = await connection.query(
      `UPDATE module_sessions
       SET topic = ?, modality = ?, scheduled_start = ?, scheduled_end = ?,
           check_in_opens_minutes = ?
       WHERE id = ?`,
      [topic, modality, scheduledStart, scheduledEnd, checkInOpensMinutes, req.params.id],
    )
    if (!result.affectedRows) {
      const [sessions] = await connection.query('SELECT id FROM module_sessions WHERE id = ?', [req.params.id])
      if (!sessions.length) { await connection.rollback(); return res.status(404).json({ message: 'Sesión no encontrada' }) }
    }
    await clearAttendanceConformityForSession(connection, req.params.id)
    await connection.commit()
    res.json({ message: 'Sesión actualizada correctamente' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
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
    await clearAttendanceConformityForSession(connection, session.id)
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
    await clearAttendanceConformityForSession(connection, req.params.id)
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
    await clearAttendanceConformityForSession(connection, session.id)
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
    const buffer = await buildTeacherAttendanceExcel(rows, {
      moduleLabel: moduleId && rows.length ? rows[0].module_name : 'Todos los módulos',
    })
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-docentes-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
}

export async function buildTeacherAttendanceExcel(rows, { moduleLabel = 'Todos los módulos' } = {}) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Asistencia docente')
  sheet.columns = [
    { key: 'number', width: 7 }, { key: 'module', width: 21 }, { key: 'session', width: 9 },
    { key: 'date', width: 13 }, { key: 'modality', width: 15 }, { key: 'teacher', width: 34 },
    { key: 'email', width: 34 }, { key: 'schedule', width: 18 }, { key: 'checkIn', width: 13 },
    { key: 'checkOut', width: 13 },
  ]
  setupAttendanceSheet(workbook, sheet, {
    title: 'Registro de asistencia docente', lastColumn: 'J', columnCount: 10, layout: 'landscape',
  })
  const issuedAt = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
  }).format(new Date())
  const courseName = (rows[0]?.course_name || 'Taller de Investigación Aplicada').replace(/^Curso\s+/i, '')
  addInformationField(sheet, { row: 6, labelColumn: 'A', valueEnd: 'F', label: 'Carrera profesional', value: 'Ingeniería de Sistemas' })
  addInformationField(sheet, { row: 6, labelColumn: 'G', valueEnd: 'J', label: 'Fecha de emisión', value: issuedAt })
  addInformationField(sheet, { row: 7, labelColumn: 'A', valueEnd: 'F', label: 'Curso', value: courseName })
  addInformationField(sheet, { row: 7, labelColumn: 'G', valueEnd: 'J', label: 'Módulos', value: moduleLabel })

  const headerRowNumber = 9
  const header = sheet.getRow(headerRowNumber)
  header.values = ['N.º', 'Módulo', 'Sesión', 'Fecha', 'Modalidad', 'Apellidos y nombres', 'Correo electrónico', 'Horario', 'Entrada', 'Salida']
  styleAttendanceTableHeader(header)
  rows.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1,
      item.module_name,
      item.session_number,
      toExcelDate(item.scheduled_start),
      modalityLabel(item.modality),
      [item.teacher_last_names, item.teacher_name].filter(Boolean).join(', ') || 'Sin asignar',
      item.teacher_email || '',
      `${timePart(item.scheduled_start)} - ${timePart(item.scheduled_end)}`,
      timePart(item.check_in_at),
      timePart(item.check_out_at),
    ])
    styleAttendanceDataRow(row, index, [1, 3, 4, 5, 8, 9, 10])
    row.getCell(4).numFmt = 'dd/mm/yyyy'
  })
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `J${headerRowNumber + rows.length}` }
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }]
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`
  sheet.pageSetup.printArea = `A1:J${Math.max(headerRowNumber + rows.length, headerRowNumber + 1)}`
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function exportAttendancePdf(req, res, next) {
  try {
    const moduleId = req.query.moduleId ? Number(req.query.moduleId) : null
    if (moduleId !== null && !Number.isInteger(moduleId)) return res.status(400).json({ message: 'Módulo inválido' })
    const rows = await getAttendanceRows({ moduleId })
    const buffer = await buildTeacherAttendancePdf(rows, {
      moduleLabel: moduleId && rows.length ? rows[0].module_name : 'Todos los módulos',
      conformityAt: rows[0]?.attendance_conformity_at || null,
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-docentes-${new Date().toISOString().slice(0, 10)}.pdf"`)
    res.send(buffer)
  } catch (error) { next(error) }
}

export async function buildTeacherAttendancePdf(rows, {
  moduleLabel = 'Todos los módulos', conformityAt = null,
} = {}) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: 'Registro de Asistencia Docente' } })
  const chunks = []
  const completed = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', resolve)
    doc.on('error', reject)
  })
  const left = 34
  const contentWidth = doc.page.width - (left * 2)
  const widths = [24, 82, 36, 56, 60, 170, 170, 78, 48, contentWidth - 724]
  const titles = ['N.', 'MÓDULO', 'SES.', 'FECHA', 'MODALIDAD', 'APELLIDOS Y NOMBRES', 'CORREO', 'HORARIO', 'ENTRADA', 'SALIDA']
  const keys = ['number', 'module', 'session', 'date', 'modality', 'teacher', 'email', 'schedule', 'checkIn', 'checkOut']
  const columns = []
  let columnX = left
  widths.forEach((width, index) => {
    columns.push({ key: keys[index], title: titles[index], x: columnX, width })
    columnX += width
  })
  const headerHeight = 20
  const rowHeight = 24
  const issuedAt = new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima',
  }).format(new Date())
  const courseName = uppercase(rows[0]?.course_name || 'Taller de Investigación Aplicada').replace(/^CURSO\s+/, '')

  const drawPageHeader = (continued = false) => {
    const detailY = drawInstitutionalAttendanceHeader(doc, {
      left, contentWidth, title: 'REGISTRO DE ASISTENCIA DOCENTE', continued,
    })
    drawPdfLabeledValue(doc, 'Carrera Profesional', 'INGENIERÍA DE SISTEMAS', left, detailY, 88, 300)
    drawPdfLabeledValue(doc, 'Fecha de emisión', issuedAt, doc.page.width - left - 190, detailY, 75, 115)
    drawPdfLabeledValue(doc, 'Curso', courseName, left, detailY + 15, 88, 300)
    drawPdfLabeledValue(doc, 'Módulos', uppercase(moduleLabel), left, detailY + 30, 88, 300)
    return detailY + 50
  }

  const drawTableHeader = y => {
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(6.5)
    columns.forEach(column => {
      doc.lineWidth(0.7).rect(column.x, y, column.width, headerHeight).stroke('#000000')
      doc.fillColor('#000000').text(column.title, column.x + 2, y + 6, {
        width: column.width - 4, align: ['number', 'session', 'checkIn', 'checkOut'].includes(column.key) ? 'center' : 'left',
        lineBreak: false, ellipsis: true,
      })
    })
  }

  const drawRow = (row, index, y) => {
    const values = {
      number: index + 1,
      module: uppercase(row.module_name),
      session: row.session_number,
      date: datePart(row.scheduled_start),
      modality: uppercase(modalityLabel(row.modality)),
      teacher: uppercase([row.teacher_last_names, row.teacher_name].filter(Boolean).join(' ')) || 'SIN ASIGNAR',
      email: row.teacher_email || '',
      schedule: `${timePart(row.scheduled_start)} - ${timePart(row.scheduled_end)}`,
      checkIn: timePart(row.check_in_at) || '-',
      checkOut: timePart(row.check_out_at) || '-',
    }
    doc.fillColor('#000000').font('Helvetica').fontSize(6.6)
    columns.forEach(column => {
      doc.lineWidth(0.7).rect(column.x, y, column.width, rowHeight).stroke('#000000')
      doc.text(String(values[column.key]), column.x + 2, y + 8, {
        width: column.width - 4,
        align: ['number', 'session', 'checkIn', 'checkOut'].includes(column.key) ? 'center' : 'left',
        lineBreak: false, ellipsis: true,
      })
    })
  }

  let y = drawPageHeader(false)
  drawTableHeader(y)
  y += headerHeight
  if (!rows.length) {
    doc.lineWidth(0.7).rect(left, y, contentWidth, 30).stroke('#000000')
    doc.fillColor('#000000').font('Helvetica').fontSize(8)
      .text('No hay sesiones para el filtro seleccionado.', left, y + 10, { width: contentWidth, align: 'center' })
  } else {
    rows.forEach((row, index) => {
      const bottomReserve = conformityAt ? attendanceConformityFooterHeight : 30
      if (y + rowHeight > doc.page.height - bottomReserve) {
        doc.addPage()
        y = drawPageHeader(true)
        drawTableHeader(y)
        y += headerHeight
      }
      drawRow(row, index, y)
      y += rowHeight
    })
  }
  drawAttendanceConformity(doc, conformityAt, { left, contentWidth })
  doc.end()
  await completed
  return Buffer.concat(chunks)
}
