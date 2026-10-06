import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { pool } from '../config/database.js'
import { drawInstitutionalAttendanceHeader, uppercase } from '../utils/attendancePdfLayout.js'
import { addInformationField, setupAttendanceSheet } from '../utils/attendanceExcelLayout.js'

const datePart = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : ''
const timePart = value => value ? String(value).slice(11, 16) : ''
const fullName = row => [row.last_names, row.name].filter(Boolean).join(', ')
const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

const actualMark = value => value ? `${datePart(value)} ${timePart(value)}` : '—'

function toExcelDateTime(value) {
  const match = String(value || '').match(localDateTimePattern)
  if (!match) return '—'
  const [, year, month, day, hour, minute, second = '00'] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
}

function excelColumnName(number) {
  let result = ''
  let current = number
  while (current > 0) {
    current -= 1
    result = String.fromCharCode(65 + (current % 26)) + result
    current = Math.floor(current / 26)
  }
  return result
}

function groupStaffAttendance(rows) {
  const roleOrder = new Map([
    ['coordinador general', 1],
    ['coordinador académico', 2],
    ['asistente administrativo', 3],
    ['soporte informático', 4],
  ])
  const modules = new Map()
  rows.forEach(item => {
    const moduleKey = String(item.module_number)
    if (!modules.has(moduleKey)) {
      modules.set(moduleKey, {
        moduleNumber: Number(item.module_number),
        moduleName: item.module_name,
        sessions: new Map(),
        personnel: new Map(),
      })
    }
    const module = modules.get(moduleKey)
    if (!module.sessions.has(item.session_id)) {
      module.sessions.set(item.session_id, {
        id: item.session_id,
        number: Number(item.session_number),
        scheduledStart: item.scheduled_start,
        scheduledEnd: item.scheduled_end,
        modality: item.modality,
      })
    }
    if (!module.personnel.has(item.administrator_id)) {
      module.personnel.set(item.administrator_id, {
        id: item.administrator_id,
        roleName: item.role_name,
        name: fullName(item),
        email: item.email,
        marks: new Map(),
      })
    }
    module.personnel.get(item.administrator_id).marks.set(item.session_id, {
      checkInAt: item.check_in_at,
      checkOutAt: item.check_out_at,
    })
  })
  return [...modules.values()]
    .sort((a, b) => a.moduleNumber - b.moduleNumber)
    .map(module => ({
      ...module,
      sessions: [...module.sessions.values()].sort((a, b) => a.number - b.number),
      personnel: [...module.personnel.values()].sort((a, b) => {
        const roleDifference = (roleOrder.get(String(a.roleName).toLocaleLowerCase('es-PE')) || 99)
          - (roleOrder.get(String(b.roleName).toLocaleLowerCase('es-PE')) || 99)
        return roleDifference || a.name.localeCompare(b.name, 'es')
      }),
    }))
}

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
      'SELECT id FROM module_sessions WHERE id = ? FOR UPDATE',
      [req.params.id],
    )
    if (!sessions.length) { await connection.rollback(); return res.status(404).json({ message: 'Sesión no encontrada' }) }
    const session = sessions[0]
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
      `SELECT id, check_out_at FROM staff_attendances
       WHERE session_id = ? AND administrator_id = ? FOR UPDATE`,
      [req.params.id, req.admin.id],
    )
    if (!rows.length) { await connection.rollback(); return res.status(409).json({ message: 'Primero debes registrar tu entrada' }) }
    const row = rows[0]
    if (row.check_out_at) { await connection.rollback(); return res.status(409).json({ message: 'Tu salida de esta sesión ya fue registrada' }) }
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
  const modules = groupStaffAttendance(rows)
  const sessionCount = Math.max(1, ...modules.map(module => module.sessions.length))
  const columnCount = 3 + (sessionCount * 2)
  const lastColumn = excelColumnName(columnCount)
  sheet.columns = [
    { width: 6 }, { width: 25 }, { width: 34 },
    ...Array.from({ length: sessionCount * 2 }, () => ({ width: 17 })),
  ]
  setupAttendanceSheet(workbook, sheet, {
    title: 'Registro de asistencia del personal', lastColumn, columnCount, layout: 'landscape',
    footerLabel: 'Asistencia del personal',
  })
  const titleCell = sheet.getCell('A4')
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF111111' } }
  titleCell.border = {
    top: { style: 'thin', color: { argb: 'FF222222' } },
    bottom: { style: 'thin', color: { argb: 'FF222222' } },
    left: { style: 'thin', color: { argb: 'FF222222' } },
    right: { style: 'thin', color: { argb: 'FF222222' } },
  }
  addInformationField(sheet, { row: 6, labelColumn: 'A', valueEnd: excelColumnName(Math.ceil(columnCount / 2)), label: 'Carrera profesional', value: 'Ingeniería de Sistemas' })
  addInformationField(sheet, { row: 6, labelColumn: excelColumnName(Math.ceil(columnCount / 2) + 1), valueEnd: lastColumn, label: 'Curso', value: 'Taller de Investigación Aplicada' })

  const border = { style: 'thin', color: { argb: 'FF8A8A8A' } }
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }
  const subheaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F3F3' } }
  let currentRow = 8

  modules.forEach(module => {
    sheet.mergeCells(`A${currentRow}:${lastColumn}${currentRow}`)
    const moduleCell = sheet.getCell(`A${currentRow}`)
    moduleCell.value = `MÓDULO ${module.moduleNumber}: ${String(module.moduleName || '').toLocaleUpperCase('es-PE')}`
    moduleCell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF111111' } }
    moduleCell.fill = headerFill
    moduleCell.alignment = { horizontal: 'left', vertical: 'middle' }
    moduleCell.border = { top: border, bottom: border, left: border, right: border }
    sheet.getRow(currentRow).height = 24

    const groupRow = currentRow + 1
    const detailRow = currentRow + 2
    ;[
      ['A', 'N.º'], ['B', 'Cargo'], ['C', 'Apellidos y nombres'],
    ].forEach(([column, label]) => {
      sheet.mergeCells(`${column}${groupRow}:${column}${detailRow}`)
      const cell = sheet.getCell(`${column}${groupRow}`)
      cell.value = label
      cell.fill = headerFill
      cell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF111111' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = { top: border, bottom: border, left: border, right: border }
    })

    module.sessions.forEach((session, sessionIndex) => {
      const startColumn = 4 + (sessionIndex * 2)
      const endColumn = startColumn + 1
      const startName = excelColumnName(startColumn)
      const endName = excelColumnName(endColumn)
      sheet.mergeCells(`${startName}${groupRow}:${endName}${groupRow}`)
      const sessionCell = sheet.getCell(`${startName}${groupRow}`)
      sessionCell.value = `SESIÓN ${session.number} · ${datePart(session.scheduledStart)}`
      sessionCell.fill = headerFill
      sessionCell.font = { name: 'Arial', size: 8.5, bold: true, color: { argb: 'FF111111' } }
      sessionCell.alignment = { horizontal: 'center', vertical: 'middle' }
      sessionCell.border = { top: border, bottom: border, left: border, right: border }
      ;['Entrada', 'Salida'].forEach((label, offset) => {
        const cell = sheet.getCell(detailRow, startColumn + offset)
        cell.value = label
        cell.fill = subheaderFill
        cell.font = { name: 'Arial', size: 8, bold: true, color: { argb: 'FF111111' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = { top: border, bottom: border, left: border, right: border }
      })
    })
    for (let sessionIndex = module.sessions.length; sessionIndex < sessionCount; sessionIndex += 1) {
      const startColumn = 4 + (sessionIndex * 2)
      const endColumn = startColumn + 1
      sheet.mergeCells(`${excelColumnName(startColumn)}${groupRow}:${excelColumnName(endColumn)}${groupRow}`)
      ;[startColumn, endColumn].forEach(column => {
        const cell = sheet.getCell(detailRow, column)
        cell.fill = subheaderFill
        cell.border = { top: border, bottom: border, left: border, right: border }
      })
    }
    sheet.getRow(groupRow).height = 24
    sheet.getRow(detailRow).height = 21

    module.personnel.forEach((person, personIndex) => {
      const values = [personIndex + 1, person.roleName, person.name]
      module.sessions.forEach(session => {
        const marks = person.marks.get(session.id) || {}
        values.push(toExcelDateTime(marks.checkInAt), toExcelDateTime(marks.checkOutAt))
      })
      while (values.length < columnCount) values.push('')
      const row = sheet.addRow(values)
      row.height = 26
      row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        cell.font = { name: 'Arial', size: 8.5, color: { argb: 'FF111111' } }
        if (personIndex % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } }
        cell.alignment = {
          horizontal: columnNumber === 2 || columnNumber === 3 ? 'left' : 'center',
          vertical: 'middle', wrapText: false,
        }
        if (columnNumber >= 4 && cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy hh:mm'
        cell.border = { bottom: border, left: border, right: border }
      })
    })
    currentRow = detailRow + module.personnel.length + 2
  })

  if (!modules.length) {
    sheet.mergeCells(`A8:${lastColumn}9`)
    sheet.getCell('A8').value = 'No hay registros de asistencia del personal.'
    sheet.getCell('A8').alignment = { horizontal: 'center', vertical: 'middle' }
  }
  sheet.views = [{ showGridLines: false }]
  sheet.pageSetup.printTitlesRow = '1:6'
  sheet.pageSetup.printArea = `A1:${lastColumn}${Math.max(currentRow - 1, 9)}`
  return workbook.xlsx.writeBuffer()
}

export async function buildStaffAttendancePdf(rows) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true })
  const chunks = []
  doc.on('data', chunk => chunks.push(chunk))
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject) })
  const modules = groupStaffAttendance(rows)
  const left = 28
  const contentWidth = doc.page.width - (left * 2)
  const drawModulePage = (module, moduleIndex) => {
    if (moduleIndex > 0) doc.addPage()
    let y = drawInstitutionalAttendanceHeader(doc, {
      left, contentWidth, title: 'REGISTRO DE ASISTENCIA DEL PERSONAL',
    })
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(7.3)
      .text('Carrera profesional:', left, y + 1, { lineBreak: false })
    doc.font('Helvetica').text('INGENIERÍA DE SISTEMAS', left + 80, y + 1, { lineBreak: false })
    doc.font('Helvetica-Bold').text('Curso:', left + 390, y + 1, { lineBreak: false })
    doc.font('Helvetica').text('TALLER DE INVESTIGACIÓN APLICADA', left + 422, y + 1, { lineBreak: false })
    y += 19
    doc.rect(left, y, contentWidth, 22).fillAndStroke('#e9e9e9', '#333333')
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9)
      .text(`MÓDULO ${module.moduleNumber}: ${uppercase(module.moduleName)}`, left + 7, y + 7, {
        width: contentWidth - 14, lineBreak: false, ellipsis: true,
      })
    y += 22

    const identityWidths = [28, 112, 180]
    const identityLabels = ['N.º', 'CARGO', 'APELLIDOS Y NOMBRES']
    const markWidth = (contentWidth - identityWidths.reduce((sum, value) => sum + value, 0)) / Math.max(1, module.sessions.length * 2)
    const groupHeight = 25
    const subheaderHeight = 19
    let x = left
    identityLabels.forEach((label, index) => {
      doc.rect(x, y, identityWidths[index], groupHeight + subheaderHeight).fillAndStroke('#f0f0f0', '#333333')
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(6.8)
        .text(label, x + 2, y + 17, { width: identityWidths[index] - 4, align: 'center', lineBreak: false })
      x += identityWidths[index]
    })
    module.sessions.forEach(session => {
      doc.rect(x, y, markWidth * 2, groupHeight).fillAndStroke('#e2e2e2', '#333333')
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(6.8)
        .text(`SESIÓN ${session.number} · ${datePart(session.scheduledStart)}`, x + 2, y + 5, {
          width: (markWidth * 2) - 4, align: 'center', lineBreak: false,
        })
      ;['ENTRADA', 'SALIDA'].forEach((label, offset) => {
        const cellX = x + (offset * markWidth)
        doc.rect(cellX, y + groupHeight, markWidth, subheaderHeight).fillAndStroke('#f5f5f5', '#333333')
        doc.fillColor('#111111').font('Helvetica-Bold').fontSize(6.3)
          .text(label, cellX + 2, y + groupHeight + 6, { width: markWidth - 4, align: 'center', lineBreak: false })
      })
      x += markWidth * 2
    })
    y += groupHeight + subheaderHeight

    const rowHeight = 34
    module.personnel.forEach((person, personIndex) => {
      x = left
      const identityValues = [personIndex + 1, person.roleName, uppercase(person.name)]
      identityValues.forEach((value, index) => {
        doc.rect(x, y, identityWidths[index], rowHeight)
          .fillAndStroke(personIndex % 2 === 1 ? '#fafafa' : '#ffffff', '#777777')
        doc.fillColor('#111111').font('Helvetica').fontSize(index === 2 ? 6.7 : 7)
          .text(String(value || ''), x + 3, y + 12, {
            width: identityWidths[index] - 6, align: index === 0 ? 'center' : 'left',
            lineBreak: false, ellipsis: true,
          })
        x += identityWidths[index]
      })
      module.sessions.forEach(session => {
        const marks = person.marks.get(session.id) || {}
        ;[actualMark(marks.checkInAt), actualMark(marks.checkOutAt)].forEach(mark => {
          doc.rect(x, y, markWidth, rowHeight)
            .fillAndStroke(personIndex % 2 === 1 ? '#fafafa' : '#ffffff', '#777777')
          const [markDate = '—', markTime = ''] = mark === '—' ? ['—', ''] : mark.split(' ')
          doc.fillColor('#111111').font('Helvetica').fontSize(6.7)
            .text(markDate, x + 2, y + (markTime ? 8 : 13), { width: markWidth - 4, align: 'center', lineBreak: false })
          if (markTime) doc.font('Helvetica-Bold').fontSize(7.2)
            .text(markTime, x + 2, y + 18, { width: markWidth - 4, align: 'center', lineBreak: false })
          x += markWidth
        })
      })
      y += rowHeight
    })
    doc.fillColor('#555555').font('Helvetica-Oblique').fontSize(6.5)
      .text('Las marcas muestran la fecha y hora reales de registro. El guion indica que no existe una marcación.', left, y + 8, {
        width: contentWidth, align: 'left', lineBreak: false,
      })
  }

  if (modules.length) modules.forEach(drawModulePage)
  else {
    const y = drawInstitutionalAttendanceHeader(doc, { left, contentWidth, title: 'REGISTRO DE ASISTENCIA DEL PERSONAL' })
    doc.font('Helvetica').fontSize(9).text('No hay registros de asistencia del personal.', left, y + 25, {
      width: contentWidth, align: 'center',
    })
  }
  const pageRange = doc.bufferedPageRange()
  for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
    doc.switchToPage(pageIndex)
    doc.fillColor('#555555').font('Helvetica').fontSize(6.5)
      .text(`Página ${pageIndex - pageRange.start + 1} de ${pageRange.count}`, doc.page.width - left - 90, doc.page.height - 19, {
        width: 90, align: 'right', lineBreak: false,
      })
  }
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
