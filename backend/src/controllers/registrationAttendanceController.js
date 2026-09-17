import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { pool } from '../config/database.js'
import {
  attendanceConformityFooterHeight, drawAttendanceConformity,
  drawInstitutionalAttendanceHeader, drawPdfLabeledValue, uppercase,
} from '../utils/attendancePdfLayout.js'
import { clearAttendanceConformityForSession } from '../services/attendanceConformity.js'
import {
  addInformationField, excelColors, setupAttendanceSheet, styleAttendanceDataRow,
  styleAttendanceTableHeader, styleStatusCell,
} from '../utils/attendanceExcelLayout.js'

const attendanceStatuses = new Set(['present', 'absent'])

function sessionIdFrom(req) {
  const id = Number(req.params.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

async function getSession(connection, id, lock = false) {
  const [rows] = await connection.query(
    `SELECT s.id, s.session_number, s.topic, s.modality, s.scheduled_start, s.scheduled_end,
            s.teacher_id, m.course_id, m.module_number, m.name AS module_name,
            c.name AS course_name, c.attendance_conformity_at,
            teacher.name AS teacher_name,
            teacher.last_names AS teacher_last_names
     FROM module_sessions s
     JOIN course_modules m ON m.id = s.module_id
     JOIN courses c ON c.id = m.course_id
     LEFT JOIN administrators teacher ON teacher.id = s.teacher_id
     WHERE s.id = ?${lock ? ' FOR UPDATE' : ''}`,
    [id],
  )
  return rows[0]
}

async function hasPermission(connection, administratorId, permissionCode) {
  const [rows] = await connection.query(
    `SELECT 1 FROM administrators a
     JOIN roles r ON r.id = a.role_id AND r.is_active = 1
     JOIN role_permissions rp ON rp.role_id = r.id
     JOIN permissions p ON p.id = rp.permission_id AND p.code = ?
     WHERE a.id = ? AND a.is_active = 1 LIMIT 1`,
    [permissionCode, administratorId],
  )
  return rows.length > 0
}

async function getRoster(connection, sessionId, courseId, lock = false) {
  const [rows] = await connection.query(
    `SELECT r.id AS registration_id, r.first_names, r.last_names, r.dni, r.email, r.phone,
            r.status AS registration_status, ra.status AS attendance_status
     FROM registrations r
     LEFT JOIN registration_attendances ra
       ON ra.registration_id = r.id AND ra.session_id = ?
     WHERE r.course_id = ? AND (r.status = 'approved' OR ra.id IS NOT NULL)
     ORDER BY r.last_names, r.first_names, r.id${lock ? ' FOR UPDATE' : ''}`,
    [sessionId, courseId],
  )
  return rows
}

export async function listRegistrationAttendance(req, res, next) {
  const sessionId = sessionIdFrom(req)
  if (!sessionId) return res.status(400).json({ message: 'Sesión inválida' })
  try {
    const session = await getSession(pool, sessionId)
    if (!session) return res.status(404).json({ message: 'Sesión no encontrada' })
    const isAssignedTeacher = Number(session.teacher_id) === Number(req.admin.id)
    if (!isAssignedTeacher
        && !(await hasPermission(pool, req.admin.id, 'attendance.manage'))
        && !(await hasPermission(pool, req.admin.id, 'registration_attendance.export'))) {
      return res.status(403).json({ message: 'Esta sesión no está asignada a tu usuario' })
    }
    const students = await getRoster(pool, session.id, session.course_id)
    const canRegister = await hasPermission(pool, req.admin.id, 'registration_attendance.mark')
    const canManage = await hasPermission(pool, req.admin.id, 'attendance.manage')
    const canMark = canRegister && (isAssignedTeacher || canManage)
    res.json({ data: { session, students, canMark } })
  } catch (error) { next(error) }
}

export async function saveRegistrationAttendance(req, res, next) {
  const sessionId = sessionIdFrom(req)
  if (!sessionId) return res.status(400).json({ message: 'Sesión inválida' })
  const entries = req.body.entries
  if (!Array.isArray(entries) || !entries.length || entries.length > 500) {
    return res.status(400).json({ message: 'Indica la asistencia de todos los estudiantes de esta sesión' })
  }
  const ids = new Set()
  for (const entry of entries) {
    if (!entry || !Number.isInteger(entry.registrationId) || entry.registrationId <= 0
        || !attendanceStatuses.has(entry.status) || ids.has(entry.registrationId)) {
      return res.status(400).json({ message: 'La asistencia contiene estudiantes o marcas inválidas' })
    }
    ids.add(entry.registrationId)
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const session = await getSession(connection, sessionId, true)
    if (!session) { await connection.rollback(); return res.status(404).json({ message: 'Sesión no encontrada' }) }
    const isAssignedTeacher = Number(session.teacher_id) === Number(req.admin.id)
    const canManage = await hasPermission(connection, req.admin.id, 'attendance.manage')
    if (!isAssignedTeacher && !canManage) {
      await connection.rollback()
      return res.status(403).json({ message: 'Solo el docente asignado o un administrador autorizado puede guardar la asistencia de esta sesión' })
    }
    const roster = await getRoster(connection, session.id, session.course_id, true)
    if (roster.length !== entries.length || roster.some(student => !ids.has(Number(student.registration_id)))) {
      await connection.rollback()
      return res.status(409).json({ message: 'La lista de estudiantes cambió. Actualízala antes de guardar' })
    }
    await connection.query(
      `INSERT INTO registration_attendances (session_id, registration_id, status)
       VALUES ? ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [entries.map(entry => [session.id, entry.registrationId, entry.status])],
    )
    await clearAttendanceConformityForSession(connection, session.id)
    await connection.commit()
    res.json({ message: 'Asistencia guardada correctamente' })
  } catch (error) {
    await connection.rollback()
    next(error)
  } finally { connection.release() }
}

const dateLabel = value => String(value).slice(0, 10).split('-').reverse().join('/')
const timeLabel = value => String(value).slice(11, 16)
const lastNamesFirst = (names, lastNames) => [lastNames, names].filter(Boolean).join(' ').trim()
const statusLabel = status => status === 'present' ? 'Presente' : 'Ausente'
const moduleTeacherLabel = teachers => {
  const names = [...teachers]
  if (!names.length) return 'Sin asignar'
  return names.length === 1 ? names[0] : 'Varios docentes'
}
function fitText(doc, text, width, maxHeight, initialSize = 7.5, minimumSize = 6) {
  let size = initialSize
  doc.fontSize(size)
  while (size > minimumSize && doc.heightOfString(text, { width, lineGap: 0 }) > maxHeight) {
    size -= 0.25
    doc.fontSize(size)
  }
  if (doc.heightOfString(text, { width, lineGap: 0 }) <= maxHeight) return { text, size }
  let shortened = text
  while (shortened.length > 3 && doc.heightOfString(`${shortened}...`, { width, lineGap: 0 }) > maxHeight) {
    shortened = shortened.slice(0, -1)
  }
  return { text: `${shortened.trimEnd()}...`, size }
}

export async function buildRegistrationAttendancePdf(session, students, { conformityAt = null } = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: 'Registro de Asistencia' } })
  const chunks = []
  const completed = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', resolve)
    doc.on('error', reject)
  })
  drawRegistrationAttendancePages(doc, session, students, conformityAt)
  doc.end()
  await completed
  return Buffer.concat(chunks)
}

function drawRegistrationAttendancePages(doc, session, students, conformityAt) {
  const pageWidth = doc.page.width
  const left = 42
  const contentWidth = pageWidth - (left * 2)
  const columns = [
    { key: 'number', x: left, width: 25, title: 'N.' },
    { key: 'dni', x: left + 25, width: 58, title: 'DNI' },
    { key: 'email', x: left + 83, width: 107, title: 'EMAIL' },
    { key: 'phone', x: left + 190, width: 62, title: 'CELULAR' },
    { key: 'name', x: left + 252, width: 177, title: 'APELLIDOS Y NOMBRES' },
    { key: 'attendance', x: left + 429, width: contentWidth - 429, title: 'FIRMA DE ASISTENCIA' },
  ]
  const rowHeight = 18
  const headerHeight = 19

  const drawPageHeader = (continued = false) => {
    const detailY = drawInstitutionalAttendanceHeader(doc, { left, contentWidth, continued })
    drawPdfLabeledValue(doc, 'Carrera Profesional', 'INGENIERÍA DE SISTEMAS', left, detailY, 86, 220)
    drawPdfLabeledValue(doc, 'Horario', `${timeLabel(session.scheduled_start)} - ${timeLabel(session.scheduled_end)}`, 393, detailY, 39, 79)
    const courseName = uppercase(session.course_name || 'Taller de Investigación Aplicada').replace(/^CURSO\s+/, '')
    drawPdfLabeledValue(doc, 'Curso', courseName, left, detailY + 15, 86, 220)
    drawPdfLabeledValue(doc, 'Fecha', dateLabel(session.scheduled_start), 393, detailY + 15, 39, 79)
    drawPdfLabeledValue(doc, 'Docente', uppercase(lastNamesFirst(session.teacher_name, session.teacher_last_names) || 'Sin asignar'), left, detailY + 30, 86, contentWidth - 86)

    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(7.5).text('Tema:', left, detailY + 45, { width: 30, lineBreak: false })
    doc.font('Helvetica')
    const topic = fitText(doc, uppercase(session.topic || 'Sin tema'), contentWidth - 32, 20, 7.5, 6)
    doc.fontSize(topic.size).text(topic.text, left + 30, detailY + 45, { width: contentWidth - 30, height: 20, lineGap: 0 })

    return detailY + 70
  }

  const drawTableHeader = y => {
    doc.lineWidth(0.7).fillColor('#ffffff').rect(left, y, contentWidth, headerHeight).fillAndStroke('#ffffff', '#000000')
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(7)
    columns.forEach(column => {
      doc.rect(column.x, y, column.width, headerHeight).stroke('#000000')
      doc.text(column.title, column.x + 2, y + 5, { width: column.width - 4, align: column.key === 'attendance' ? 'center' : 'left', lineBreak: false, ellipsis: true })
    })
  }

  const drawStudentRow = (student, index, y) => {
    const values = {
      number: index + 1,
      dni: student.dni || '',
      email: student.email || '',
      phone: student.phone || '',
      name: uppercase(lastNamesFirst(student.first_names, student.last_names)),
      attendance: student.attendance_status === 'present' ? 'A' : 'F',
    }
    doc.fillColor('#000000').font('Helvetica').fontSize(6.8)
    columns.forEach(column => {
      doc.rect(column.x, y, column.width, rowHeight).stroke('#000000')
      doc.text(String(values[column.key]), column.x + 2, y + 5, {
        width: column.width - 4,
        align: ['number', 'attendance'].includes(column.key) ? 'center' : 'left',
        lineBreak: false,
        ellipsis: true,
      })
    })
  }

  let tableY = drawPageHeader(false)
  drawTableHeader(tableY)
  tableY += headerHeight
  students.forEach((student, index) => {
    const bottomReserve = conformityAt ? attendanceConformityFooterHeight : 35
    if (tableY + rowHeight > doc.page.height - bottomReserve) {
      doc.addPage()
      tableY = drawPageHeader(true)
      drawTableHeader(tableY)
      tableY += headerHeight
    }
    drawStudentRow(student, index, tableY)
    tableY += rowHeight
  })
  drawAttendanceConformity(doc, conformityAt, { left, contentWidth })
}

async function getSavedAttendance(sessionId) {
  const session = await getSession(pool, sessionId)
  if (!session) return { status: 404, message: 'Sesión no encontrada' }
  const students = await getRoster(pool, session.id, session.course_id)
  if (!students.length || students.some(student => !attendanceStatuses.has(student.attendance_status))) {
    return { status: 409, message: 'Guarda la asistencia completa de esta sesión antes de exportarla' }
  }
  return { session, students }
}

async function getRegistrationAttendanceSessionRows() {
  const [rows] = await pool.query(
    `SELECT s.id AS session_id, s.session_number, s.scheduled_start,
              m.module_number, m.name AS module_name, c.name AS course_name,
              teacher.name AS teacher_name, teacher.last_names AS teacher_last_names,
              (SELECT COUNT(*) FROM registration_attendances ra
               WHERE ra.session_id = s.id) AS saved_count,
              (SELECT COUNT(*) FROM registrations r
               WHERE r.course_id = m.course_id AND (r.status = 'approved'
                 OR EXISTS (SELECT 1 FROM registration_attendances saved
                            WHERE saved.session_id = s.id AND saved.registration_id = r.id))) AS student_count
       FROM module_sessions s
       JOIN course_modules m ON m.id = s.module_id
       JOIN courses c ON c.id = m.course_id
       LEFT JOIN administrators teacher ON teacher.id = s.teacher_id
       ORDER BY m.module_number, s.session_number`,
  )
  return rows
}

async function getAllRegistrationAttendances() {
  const sessions = await getRegistrationAttendanceSessionRows()
  return Promise.all(sessions.map(async summary => {
    const session = await getSession(pool, summary.session_id)
    const students = await getRoster(pool, session.id, session.course_id)
    return { session, students }
  }))
}

function buildRegistrationAttendanceMatrix(records) {
  const sessions = records.map(record => record.session)
  const studentsById = new Map()
  records.forEach(({ session, students }) => {
    students.forEach(student => {
      const key = String(student.registration_id)
      if (!studentsById.has(key)) {
        studentsById.set(key, {
          registrationId: student.registration_id,
          dni: student.dni || '', email: student.email || '', phone: student.phone || '',
          firstNames: student.first_names || '', lastNames: student.last_names || '', statuses: new Map(),
        })
      }
      studentsById.get(key).statuses.set(Number(session.id), student.attendance_status)
    })
  })
  const students = [...studentsById.values()].sort((left, right) =>
    `${left.lastNames} ${left.firstNames}`.localeCompare(`${right.lastNames} ${right.firstNames}`, 'es'))
  return { sessions, students }
}

function excelColumnName(columnNumber) {
  let value = columnNumber
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

export async function listRegistrationAttendanceSessions(_req, res, next) {
  try {
    const rows = await getRegistrationAttendanceSessionRows()
    res.json({ data: rows })
  } catch (error) { next(error) }
}

export async function exportRegistrationAttendanceExcel(req, res, next) {
  const sessionId = sessionIdFrom(req)
  if (!sessionId) return res.status(400).json({ message: 'Sesión inválida' })
  try {
    const result = await getSavedAttendance(sessionId)
    if (result.status) return res.status(result.status).json({ message: result.message })
    const { session, students } = result
    const buffer = await buildRegistrationAttendanceExcel(session, students)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-estudiantes-modulo-${session.module_number}-sesion-${session.session_number}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
}

export async function buildRegistrationAttendanceExcel(session, students) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Asistencia de estudiantes')
  sheet.columns = [
    { key: 'number', width: 7 }, { key: 'dni', width: 15 }, { key: 'email', width: 34 },
    { key: 'phone', width: 16 }, { key: 'name', width: 42 }, { key: 'attendance', width: 17 },
  ]
  setupAttendanceSheet(workbook, sheet, {
    title: 'Registro de asistencia de estudiantes', lastColumn: 'F', columnCount: 6, layout: 'portrait',
  })
  const courseName = (session.course_name || 'Taller de Investigación Aplicada').replace(/^Curso\s+/i, '')
  addInformationField(sheet, { row: 6, labelColumn: 'A', valueEnd: 'C', label: 'Carrera profesional', value: 'Ingeniería de Sistemas' })
  addInformationField(sheet, { row: 6, labelColumn: 'D', valueEnd: 'F', label: 'Horario', value: `${timeLabel(session.scheduled_start)} - ${timeLabel(session.scheduled_end)}` })
  addInformationField(sheet, { row: 7, labelColumn: 'A', valueEnd: 'C', label: 'Curso', value: courseName })
  addInformationField(sheet, { row: 7, labelColumn: 'D', valueEnd: 'F', label: 'Fecha', value: dateLabel(session.scheduled_start) })
  addInformationField(sheet, { row: 8, labelColumn: 'A', valueEnd: 'F', label: 'Docente', value: lastNamesFirst(session.teacher_name, session.teacher_last_names) || 'Sin asignar' })
  addInformationField(sheet, { row: 9, labelColumn: 'A', valueEnd: 'C', label: 'Módulo', value: `${session.module_number}. ${session.module_name}` })
  addInformationField(sheet, { row: 9, labelColumn: 'D', valueEnd: 'F', label: 'Sesión', value: session.session_number })
  addInformationField(sheet, { row: 10, labelColumn: 'A', valueEnd: 'F', label: 'Tema', value: session.topic || 'Sin tema' })
  sheet.getRow(10).height = 34

  const headerRowNumber = 12
  const header = sheet.getRow(headerRowNumber)
  header.values = ['N.º', 'DNI', 'Correo electrónico', 'Celular', 'Apellidos y nombres', 'Asistencia']
  styleAttendanceTableHeader(header)
  students.forEach((student, index) => {
    const row = sheet.addRow([
      index + 1,
      student.dni || '',
      student.email || '',
      student.phone || '',
      lastNamesFirst(student.first_names, student.last_names),
      statusLabel(student.attendance_status),
    ])
    styleAttendanceDataRow(row, index, [1, 2, 4, 6])
    styleStatusCell(row.getCell(6), student.attendance_status)
  })
  const lastDataRow = headerRowNumber + students.length
  const summaryStart = lastDataRow + 2
  sheet.mergeCells(`A${summaryStart}:B${summaryStart}`)
  sheet.getCell(`A${summaryStart}`).value = 'Resumen'
  sheet.getCell(`A${summaryStart}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: excelColors.white } }
  sheet.getCell(`A${summaryStart}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.blue } }
  sheet.getCell(`A${summaryStart}`).alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getCell(`A${summaryStart + 1}`).value = 'Presentes'
  sheet.getCell(`B${summaryStart + 1}`).value = {
    formula: `COUNTIF(F${headerRowNumber + 1}:F${lastDataRow},"Presente")`,
    result: students.filter(student => student.attendance_status === 'present').length,
  }
  sheet.getCell(`A${summaryStart + 2}`).value = 'Ausentes'
  sheet.getCell(`B${summaryStart + 2}`).value = {
    formula: `COUNTIF(F${headerRowNumber + 1}:F${lastDataRow},"Ausente")`,
    result: students.filter(student => student.attendance_status === 'absent').length,
  }
  for (let rowNumber = summaryStart + 1; rowNumber <= summaryStart + 2; rowNumber += 1) {
    sheet.getCell(`A${rowNumber}`).font = { name: 'Arial', size: 9, bold: true, color: { argb: excelColors.muted } }
    sheet.getCell(`B${rowNumber}`).font = { name: 'Arial', size: 10, bold: true, color: { argb: excelColors.text } }
    sheet.getCell(`B${rowNumber}`).alignment = { horizontal: 'center' }
  }
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `F${lastDataRow}` }
  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }]
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`
  sheet.pageSetup.printArea = `A1:F${summaryStart + 2}`
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildAllRegistrationAttendanceExcel(records) {
  const { sessions, students } = buildRegistrationAttendanceMatrix(records)
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Asistencias')
  sheet.columns = [
    { key: 'number', width: 7 }, { key: 'dni', width: 15 }, { key: 'email', width: 31 },
    { key: 'phone', width: 16 }, { key: 'lastNames', width: 27 }, { key: 'firstNames', width: 27 },
    ...sessions.map(session => ({ key: `session_${session.id}`, width: 11 })),
  ]
  const columnCount = 6 + sessions.length
  const lastColumn = excelColumnName(columnCount)
  setupAttendanceSheet(workbook, sheet, {
    title: 'Registro general de asistencia de estudiantes', lastColumn, columnCount, layout: 'landscape',
  })
  sheet.getCell('B1').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF000000' } }
  sheet.getCell('A4').font = { name: 'Arial', size: 11, color: { argb: 'FF000000' } }
  sheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
  sheet.getCell('A4').border = {
    top: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } },
    left: { style: 'thin', color: { argb: 'FF000000' } },
    right: { style: 'thin', color: { argb: 'FF000000' } },
  }
  const courseName = (records[0]?.session.course_name || 'Taller de Investigación Aplicada').replace(/^Curso\s+/i, '')
  addInformationField(sheet, { row: 6, labelColumn: 'A', valueEnd: 'I', label: 'Carrera profesional', value: 'Ingeniería de Sistemas' })
  addInformationField(sheet, { row: 6, labelColumn: 'J', valueEnd: lastColumn, label: 'Sesiones', value: sessions.length })
  addInformationField(sheet, { row: 7, labelColumn: 'A', valueEnd: 'I', label: 'Curso', value: courseName })
  addInformationField(sheet, { row: 7, labelColumn: 'J', valueEnd: lastColumn, label: 'Estudiantes', value: students.length })

  const groupRowNumber = 9
  const headerRowNumber = 10
  sheet.mergeCells(`A${groupRowNumber}:F${groupRowNumber}`)
  sheet.getCell(`A${groupRowNumber}`).value = 'Datos del estudiante'
  const modules = []
  sessions.forEach((session, index) => {
    const teacher = lastNamesFirst(session.teacher_name, session.teacher_last_names)
    const previous = modules.at(-1)
    if (previous && Number(previous.moduleNumber) === Number(session.module_number)) {
      previous.end = 7 + index
      if (teacher) previous.teachers.add(teacher)
    } else {
      modules.push({
        moduleNumber: session.module_number,
        name: session.module_name,
        start: 7 + index,
        end: 7 + index,
        teachers: new Set(teacher ? [teacher] : []),
      })
    }
  })
  modules.forEach(module => {
    const start = excelColumnName(module.start)
    const end = excelColumnName(module.end)
    if (start !== end) sheet.mergeCells(`${start}${groupRowNumber}:${end}${groupRowNumber}`)
    sheet.getCell(`${start}${groupRowNumber}`).value = `Módulo ${module.moduleNumber} · ${module.name}\nDocente: ${moduleTeacherLabel(module.teachers)}`
  })
  const groupRow = sheet.getRow(groupRowNumber)
  groupRow.height = 38
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = groupRow.getCell(column)
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    }
  }
  const header = sheet.getRow(headerRowNumber)
  header.values = [
    'N.º', 'DNI', 'Correo electrónico', 'Celular', 'Apellidos', 'Nombres',
    ...sessions.map(session => `S${session.session_number}\n${dateLabel(session.scheduled_start)}`),
  ]
  header.height = 28
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = header.getCell(column)
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    }
  }
  students.forEach((student, index) => {
    const statuses = sessions.map(session => {
      const status = student.statuses.get(Number(session.id))
      return status === 'present' ? 'A' : status === 'absent' ? 'F' : ''
    })
    const row = sheet.addRow([
      index + 1, student.dni, student.email, student.phone, student.lastNames, student.firstNames, ...statuses,
    ])
    const centeredColumns = [1, 2, 4, ...sessions.map((_session, sessionIndex) => 7 + sessionIndex)]
    row.height = 24
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column)
      cell.font = { name: 'Arial', size: 9, color: { argb: 'FF000000' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      cell.alignment = {
        horizontal: centeredColumns.includes(column) ? 'center' : 'left', vertical: 'middle',
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } },
      }
    }
  })
  const lastDataRow = headerRowNumber + students.length
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `${lastColumn}${lastDataRow}` }
  sheet.views = [{ state: 'frozen', xSplit: 6, ySplit: headerRowNumber, showGridLines: false }]
  sheet.pageSetup.printTitlesRow = `${groupRowNumber}:${headerRowNumber}`
  sheet.pageSetup.printArea = `A1:${lastColumn}${Math.max(lastDataRow, headerRowNumber + 1)}`
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildAllRegistrationAttendancePdf(records, { conformityAt = null } = {}) {
  const { sessions, students } = buildRegistrationAttendanceMatrix(records)
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: 'Registro General de Asistencia de Estudiantes' } })
  const chunks = []
  const completed = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', resolve)
    doc.on('error', reject)
  })
  const left = 20
  const contentWidth = doc.page.width - (left * 2)
  const courseName = uppercase(records[0]?.session.course_name || 'Taller de Investigación Aplicada').replace(/^CURSO\s+/, '')
  const identityColumns = [
    { key: 'number', title: 'N.', width: 22 }, { key: 'dni', title: 'DNI', width: 48 },
    { key: 'email', title: 'EMAIL', width: 108 }, { key: 'phone', title: 'CELULAR', width: 58 },
    { key: 'lastNames', title: 'APELLIDOS', width: 108 }, { key: 'firstNames', title: 'NOMBRES', width: 96 },
  ]
  const identityWidth = identityColumns.reduce((total, column) => total + column.width, 0)
  const attendanceWidth = (contentWidth - identityWidth) / Math.max(sessions.length, 1)
  const attendanceColumns = sessions.map(session => ({
    key: `session_${session.id}`, title: `S${session.session_number}`, width: attendanceWidth, session,
  }))
  const columns = [...identityColumns, ...attendanceColumns]
  let columnX = left
  columns.forEach(column => { column.x = columnX; columnX += column.width })
  const modules = []
  attendanceColumns.forEach(column => {
    const teacher = lastNamesFirst(column.session.teacher_name, column.session.teacher_last_names)
    const previous = modules.at(-1)
    if (previous && Number(previous.moduleNumber) === Number(column.session.module_number)) {
      previous.width += column.width
      if (teacher) previous.teachers.add(teacher)
    } else {
      modules.push({
        moduleNumber: column.session.module_number, name: column.session.module_name,
        x: column.x, width: column.width, teachers: new Set(teacher ? [teacher] : []),
      })
    }
  })
  const groupHeight = 25
  const headerHeight = 19
  const rowHeight = 13

  const drawPageHeader = continued => {
    const detailY = drawInstitutionalAttendanceHeader(doc, {
      left, contentWidth, title: 'REGISTRO GENERAL DE ASISTENCIA DE ESTUDIANTES', continued,
    })
    drawPdfLabeledValue(doc, 'Carrera Profesional', 'INGENIERÍA DE SISTEMAS', left, detailY, 86, 230)
    drawPdfLabeledValue(doc, 'Curso', courseName, left, detailY + 15, 86, 300)
    doc.fillColor('#111111').font('Helvetica').fontSize(6.5)
      .text('A = Asistió   F = Faltó   En blanco = Sin registrar', left + 430, detailY + 15, { width: contentWidth - 430, align: 'right' })
    return detailY + 36
  }

  const drawTableHeader = y => {
    doc.rect(left, y, identityWidth, groupHeight).fillAndStroke('#ffffff', '#000000')
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
      .text('DATOS DEL ESTUDIANTE', left, y + 9, { width: identityWidth, align: 'center' })
    modules.forEach(module => {
      doc.rect(module.x, y, module.width, groupHeight).fillAndStroke('#ffffff', '#000000')
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(6.5)
        .text(`MÓDULO ${module.moduleNumber}`, module.x, y + 4, { width: module.width, align: 'center', lineBreak: false })
      doc.font('Helvetica').fontSize(5.4)
        .text(`DOCENTE: ${uppercase(moduleTeacherLabel(module.teachers))}`, module.x + 2, y + 14, {
          width: module.width - 4, align: 'center', lineBreak: false, ellipsis: true,
        })
    })
    const secondY = y + groupHeight
    columns.forEach(column => {
      doc.rect(column.x, secondY, column.width, headerHeight).fillAndStroke('#ffffff', '#000000')
      doc.fillColor('#000000').font('Helvetica-Bold').fontSize(5.8)
        .text(column.title, column.x + 1, secondY + 6, { width: column.width - 2, align: 'center', lineBreak: false, ellipsis: true })
    })
  }

  const drawStudentRow = (student, index, y) => {
    const values = {
      number: index + 1, dni: student.dni, email: student.email, phone: student.phone,
      lastNames: uppercase(student.lastNames), firstNames: uppercase(student.firstNames),
    }
    sessions.forEach(session => {
      const status = student.statuses.get(Number(session.id))
      values[`session_${session.id}`] = status === 'present' ? 'A' : status === 'absent' ? 'F' : ''
    })
    doc.fillColor('#000000').font('Helvetica').fontSize(5.6)
    columns.forEach(column => {
      doc.rect(column.x, y, column.width, rowHeight).stroke('#000000')
      doc.text(String(values[column.key] ?? ''), column.x + 1, y + 4, {
        width: column.width - 2,
        align: ['number', ...attendanceColumns.map(item => item.key)].includes(column.key) ? 'center' : 'left',
        lineBreak: false, ellipsis: true,
      })
    })
  }

  let y = drawPageHeader(false)
  drawTableHeader(y)
  y += groupHeight + headerHeight
  students.forEach((student, index) => {
    const bottomReserve = conformityAt ? attendanceConformityFooterHeight : 18
    if (y + rowHeight > doc.page.height - bottomReserve) {
      doc.addPage()
      y = drawPageHeader(true)
      drawTableHeader(y)
      y += groupHeight + headerHeight
    }
    drawStudentRow(student, index, y)
    y += rowHeight
  })
  drawAttendanceConformity(doc, conformityAt, { left, contentWidth })
  doc.end()
  await completed
  return Buffer.concat(chunks)
}

export async function exportAllRegistrationAttendanceExcel(_req, res, next) {
  try {
    const records = await getAllRegistrationAttendances()
    if (!records.length || !records.some(record => record.students.length)) return res.status(409).json({ message: 'No hay estudiantes para exportar' })
    const buffer = await buildAllRegistrationAttendanceExcel(records)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="asistencia-estudiantes-todos-los-modulos.xlsx"')
    res.send(buffer)
  } catch (error) { next(error) }
}

export async function exportAllRegistrationAttendancePdf(_req, res, next) {
  try {
    const records = await getAllRegistrationAttendances()
    if (!records.length || !records.some(record => record.students.length)) return res.status(409).json({ message: 'No hay estudiantes para exportar' })
    const buffer = await buildAllRegistrationAttendancePdf(records, {
      conformityAt: records[0]?.session.attendance_conformity_at || null,
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="asistencia-estudiantes-todos-los-modulos.pdf"')
    res.send(buffer)
  } catch (error) { next(error) }
}

export async function exportRegistrationAttendancePdf(req, res, next) {
  const sessionId = sessionIdFrom(req)
  if (!sessionId) return res.status(400).json({ message: 'Sesión inválida' })
  try {
    const result = await getSavedAttendance(sessionId)
    if (result.status) return res.status(result.status).json({ message: result.message })
    const { session, students } = result
    const buffer = await buildRegistrationAttendancePdf(session, students, {
      conformityAt: session.attendance_conformity_at || null,
    })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="asistencia-estudiantes-modulo-${session.module_number}-sesion-${session.session_number}.pdf"`)
    res.send(buffer)
  } catch (error) { next(error) }
}
