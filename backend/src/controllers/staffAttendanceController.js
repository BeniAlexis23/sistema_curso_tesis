import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { pool } from '../config/database.js'
import { drawInstitutionalAttendanceHeader, uppercase } from '../utils/attendancePdfLayout.js'
import {
  addInformationField, setupAttendanceSheet, styleAttendanceDataRow,
  styleAttendanceTableHeader, toExcelDate,
} from '../utils/attendanceExcelLayout.js'

const datePart = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : ''
const timePart = value => value ? String(value).slice(11, 16) : ''
const modalityLabel = value => value === 'in_person' ? 'Presencial' : 'Síncrona'
const fullName = row => [row.last_names, row.name].filter(Boolean).join(', ')
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

function normalizeLocalDateTime(value) {
  if (typeof value !== 'string') return null
  const match = value.trim().match(localDateTimePattern)
  if (!match) return null
  const [, year, month, day, hour, minute, second = '00'] = match
  const parts = [year, month, day, hour, minute, second].map(Number)
  const candidate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]))
  const valid = candidate.getUTCFullYear() === parts[0] && candidate.getUTCMonth() === parts[1] - 1
    && candidate.getUTCDate() === parts[2] && candidate.getUTCHours() === parts[3]
    && candidate.getUTCMinutes() === parts[4] && candidate.getUTCSeconds() === parts[5]
  return valid ? `${year}-${month}-${day} ${hour}:${minute}:${second}` : null
}

async function hasPermission(administratorId, permissionCode) {
  const [rows] = await pool.query(
    `SELECT 1 FROM administrators a
     JOIN roles r ON r.id = a.role_id AND r.is_active = 1
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE a.id = ? AND a.is_active = 1 AND p.code = ? LIMIT 1`,
    [administratorId, permissionCode],
  )
  return rows.length > 0
}

async function getRows({ administratorId = null, includeAllStaff = false } = {}) {
  if (includeAllStaff) {
    const [rows] = await pool.query(
      `SELECT m.module_number, m.name AS module_name, s.id AS session_id,
              s.session_number, s.topic, s.modality, s.scheduled_start, s.scheduled_end,
              a.id AS administrator_id, a.name, a.last_names, a.email,
              r.name AS role_name,
              sa.id AS attendance_id, sa.check_in_at, sa.check_out_at
       FROM module_sessions s
       JOIN course_modules m ON m.id = s.module_id
       CROSS JOIN administrators a
       JOIN roles r ON r.id = a.role_id AND r.is_active = 1
       LEFT JOIN staff_attendances sa
         ON sa.session_id = s.id AND sa.administrator_id = a.id
       WHERE a.is_active = 1 AND r.id <> 1 AND EXISTS (
         SELECT 1 FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         WHERE rp.role_id = a.role_id AND p.code = 'staff_attendance.mark'
       )
       ORDER BY m.module_number, s.session_number, a.last_names, a.name`,
    )
    return rows
  }
  const [rows] = await pool.query(
    `SELECT m.module_number, m.name AS module_name, s.id AS session_id,
            s.session_number, s.topic, s.modality, s.scheduled_start, s.scheduled_end,
            sa.check_in_at, sa.check_out_at,
            CASE WHEN sa.id IS NULL THEN 'pending'
                 WHEN sa.check_out_at IS NULL THEN 'checked_in' ELSE 'completed' END AS attendance_status
     FROM module_sessions s
     JOIN course_modules m ON m.id = s.module_id
     LEFT JOIN staff_attendances sa
       ON sa.session_id = s.id AND sa.administrator_id = ?
     ORDER BY m.module_number, s.session_number`,
    [administratorId],
  )
  return rows
}

export async function listStaffAttendance(req, res, next) {
  try {
    const isSuperAdministrator = Number(req.admin.role?.id) === 1
    const canManage = await hasPermission(req.admin.id, 'staff_attendance.manage')
    const [rows, personnelRows, [[clock]]] = await Promise.all([
      isSuperAdministrator ? Promise.resolve([]) : getRows({ administratorId: req.admin.id }),
      canManage ? getRows({ includeAllStaff: true }) : Promise.resolve([]),
      pool.query('SELECT DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now'),
    ])
    res.json({ data: { rows, personnelRows, canManage, currentTime: clock.peru_now } })
  } catch (error) { next(error) }
}

export async function staffCheckIn(req, res, next) {
  if (Number(req.admin.role?.id) === 1) {
    return res.status(403).json({ message: 'El Superadministrador gestiona la asistencia, pero no realiza marcaciones' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [sessions] = await connection.query(
      `SELECT id, scheduled_end,
              DATE_SUB(scheduled_start, INTERVAL check_in_opens_minutes MINUTE) AS opens_at,
              DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now
       FROM module_sessions WHERE id = ? FOR UPDATE`,
      [req.params.id],
    )
    if (!sessions.length) { await connection.rollback(); return res.status(404).json({ message: 'Sesión no encontrada' }) }
    const session = sessions[0]
    if (session.peru_now < session.opens_at) { await connection.rollback(); return res.status(409).json({ message: `La entrada estará disponible desde ${session.opens_at}` }) }
    if (session.peru_now > session.scheduled_end) { await connection.rollback(); return res.status(409).json({ message: 'El horario de esta sesión ya finalizó' }) }
    await connection.query(
      `INSERT INTO staff_attendances (session_id, administrator_id, check_in_at)
       VALUES (?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR))`,
      [session.id, req.admin.id],
    )
    await connection.commit()
    res.status(201).json({ message: 'Entrada registrada correctamente' })
  } catch (error) {
    await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Tu entrada de esta sesión ya fue registrada' })
    next(error)
  } finally { connection.release() }
}

export async function staffCheckOut(req, res, next) {
  if (Number(req.admin.role?.id) === 1) {
    return res.status(403).json({ message: 'El Superadministrador gestiona la asistencia, pero no realiza marcaciones' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query(
      `SELECT sa.id, sa.check_out_at, s.scheduled_start,
              DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now
       FROM staff_attendances sa JOIN module_sessions s ON s.id = sa.session_id
       WHERE sa.session_id = ? AND sa.administrator_id = ? FOR UPDATE`,
      [req.params.id, req.admin.id],
    )
    if (!rows.length) { await connection.rollback(); return res.status(409).json({ message: 'Primero debes registrar tu entrada' }) }
    const row = rows[0]
    if (row.check_out_at) { await connection.rollback(); return res.status(409).json({ message: 'Tu salida de esta sesión ya fue registrada' }) }
    if (row.peru_now < row.scheduled_start) { await connection.rollback(); return res.status(409).json({ message: 'La salida estará disponible cuando inicie la sesión' }) }
    await connection.query(
      `UPDATE staff_attendances SET check_out_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR)
       WHERE id = ?`, [row.id],
    )
    await connection.commit()
    res.json({ message: 'Salida registrada correctamente' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
}

export async function updateStaffAttendance(req, res, next) {
  const checkInAt = normalizeLocalDateTime(req.body.checkInAt)
  const checkOutAt = req.body.checkOutAt ? normalizeLocalDateTime(req.body.checkOutAt) : null
  if (!checkInAt || (req.body.checkOutAt && !checkOutAt) || (checkOutAt && checkOutAt < checkInAt)) {
    return res.status(400).json({ message: 'Indica horas de entrada y salida válidas' })
  }
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const [rows] = await connection.query(
      `SELECT sa.id, s.scheduled_start,
              DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR) AS peru_now
       FROM staff_attendances sa JOIN module_sessions s ON s.id = sa.session_id
       WHERE sa.id = ? FOR UPDATE`,
      [req.params.id],
    )
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ message: 'Marcación no encontrada' }) }
    const attendance = rows[0]
    const sessionDate = String(attendance.scheduled_start).slice(0, 10)
    if (checkInAt.slice(0, 10) !== sessionDate || (checkOutAt && checkOutAt.slice(0, 10) !== sessionDate)) {
      await connection.rollback()
      return res.status(400).json({ message: 'Las horas deben corresponder a la fecha de la sesión' })
    }
    if (checkInAt > attendance.peru_now || (checkOutAt && checkOutAt > attendance.peru_now)) {
      await connection.rollback()
      return res.status(400).json({ message: 'No puedes registrar horas futuras' })
    }
    await connection.query(
      'UPDATE staff_attendances SET check_in_at = ?, check_out_at = ? WHERE id = ?',
      [checkInAt, checkOutAt, attendance.id],
    )
    await connection.commit()
    res.json({ message: 'Marcación del personal actualizada correctamente' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
}

export async function buildStaffAttendanceExcel(rows) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Asistencia del personal')
  sheet.columns = [
    { width: 7 }, { width: 20 }, { width: 9 }, { width: 13 }, { width: 15 },
    { width: 24 }, { width: 34 }, { width: 32 }, { width: 17 }, { width: 12 }, { width: 12 },
  ]
  setupAttendanceSheet(workbook, sheet, {
    title: 'Registro de asistencia del personal', lastColumn: 'K', columnCount: 11, layout: 'landscape',
  })
  addInformationField(sheet, { row: 6, labelColumn: 'A', valueEnd: 'F', label: 'Carrera profesional', value: 'Ingeniería de Sistemas' })
  addInformationField(sheet, { row: 6, labelColumn: 'G', valueEnd: 'K', label: 'Curso', value: 'Taller de Investigación Aplicada' })
  const headerRow = 8
  const header = sheet.getRow(headerRow)
  header.values = ['N.º', 'Módulo', 'Sesión', 'Fecha', 'Modalidad', 'Cargo', 'Apellidos y nombres', 'Correo', 'Horario', 'Entrada', 'Salida']
  styleAttendanceTableHeader(header)
  rows.forEach((item, index) => {
    const row = sheet.addRow([
      index + 1, item.module_name, item.session_number, toExcelDate(item.scheduled_start),
      modalityLabel(item.modality), item.role_name, fullName(item), item.email,
      `${timePart(item.scheduled_start)} - ${timePart(item.scheduled_end)}`,
      timePart(item.check_in_at), timePart(item.check_out_at),
    ])
    styleAttendanceDataRow(row, index, [1, 3, 4, 5, 9, 10, 11])
    row.getCell(4).numFmt = 'dd/mm/yyyy'
  })
  sheet.autoFilter = { from: `A${headerRow}`, to: `K${headerRow + rows.length}` }
  sheet.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }]
  return workbook.xlsx.writeBuffer()
}

export async function buildStaffAttendancePdf(rows) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28, bufferPages: true })
  const chunks = []
  doc.on('data', chunk => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject) })
  const left = 28
  const width = doc.page.width - 56
  const columns = [28, 104, 38, 58, 73, 92, 145, 70, 48, 48]
  const labels = ['N.º', 'Módulo', 'Ses.', 'Fecha', 'Cargo', 'Apellidos y nombres', 'Correo', 'Horario', 'Entrada', 'Salida']
  const drawHeader = continued => {
    let y = drawInstitutionalAttendanceHeader(doc, { left, contentWidth: width, title: 'REGISTRO DE ASISTENCIA DEL PERSONAL', continued })
    doc.font('Helvetica-Bold').fontSize(7).text('Carrera profesional:', left, y + 4)
    doc.font('Helvetica').text('INGENIERÍA DE SISTEMAS', left + 82, y + 4)
    doc.font('Helvetica-Bold').text('Curso:', left + 350, y + 4)
    doc.font('Helvetica').text('TALLER DE INVESTIGACIÓN APLICADA', left + 383, y + 4)
    y += 22
    let x = left
    labels.forEach((label, index) => {
      doc.rect(x, y, columns[index], 22).stroke('#000000')
      doc.font('Helvetica-Bold').fontSize(6.5).text(label, x + 2, y + 7, { width: columns[index] - 4, align: 'center' })
      x += columns[index]
    })
    return y + 22
  }
  let y = drawHeader(false)
  rows.forEach((item, index) => {
    if (y + 24 > doc.page.height - 30) { doc.addPage(); y = drawHeader(true) }
    const values = [index + 1, item.module_name, item.session_number, datePart(item.scheduled_start),
      item.role_name, uppercase(fullName(item)), item.email,
      `${timePart(item.scheduled_start)}-${timePart(item.scheduled_end)}`,
      timePart(item.check_in_at), timePart(item.check_out_at)]
    let x = left
    values.forEach((value, columnIndex) => {
      doc.rect(x, y, columns[columnIndex], 24).stroke('#000000')
      doc.font('Helvetica').fontSize(6).text(String(value || ''), x + 2, y + 7, {
        width: columns[columnIndex] - 4, align: [0, 2, 3, 7, 8, 9].includes(columnIndex) ? 'center' : 'left', ellipsis: true,
      })
      x += columns[columnIndex]
    })
    y += 24
  })
  doc.end()
  await done
  return Buffer.concat(chunks)
}

export async function exportStaffAttendanceExcel(_req, res, next) {
  try {
    const buffer = await buildStaffAttendanceExcel(await getRows({ includeAllStaff: true }))
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="asistencia-personal.xlsx"')
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
}

export async function exportStaffAttendancePdf(_req, res, next) {
  try {
    const buffer = await buildStaffAttendancePdf(await getRows({ includeAllStaff: true }))
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="asistencia-personal.pdf"')
    res.send(buffer)
  } catch (error) { next(error) }
}
