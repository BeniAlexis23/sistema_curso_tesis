import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { pool } from '../config/database.js'
import { createPaymentSchedule } from '../services/paymentSchedule.js'
import {
  addInformationField, excelColors, setupAttendanceSheet, styleAttendanceDataRow,
  styleAttendanceTableHeader, toExcelDate,
} from '../utils/attendanceExcelLayout.js'

async function ensureSchedules() {
  const [registrations] = await pool.query(
    `SELECT r.id, r.payment_mode FROM registrations r
     LEFT JOIN registration_payments p ON p.registration_id = r.id
     GROUP BY r.id HAVING COUNT(p.id) = 0`,
  )
  for (const registration of registrations) await createPaymentSchedule(pool, registration.id, registration.payment_mode)
}

async function getReportRows() {
  await ensureSchedules()
  const [rows] = await pool.query(
    `SELECT r.id, CONCAT(r.first_names, ' ', r.last_names) AS participant, r.dni, r.email,
            r.phone, r.payment_mode, r.status AS registration_status,
            COUNT(p.id) AS installment_count,
            SUM(CASE WHEN p.status = 'paid' THEN 1 ELSE 0 END) AS paid_installments,
            COALESCE(SUM(p.amount), 0) AS total_amount,
            COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) AS paid_amount,
            COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END), 0) AS pending_amount
     FROM registrations r
     LEFT JOIN registration_payments p ON p.registration_id = r.id
     GROUP BY r.id ORDER BY r.last_names, r.first_names`,
  )
  return rows
}

async function getPaymentReportRows() {
  await ensureSchedules()
  const [rows] = await pool.query(
    `SELECT r.id AS registration_id,
            CONCAT(r.first_names, ' ', r.last_names) AS participant,
            r.dni, r.email, r.phone, r.payment_mode,
            p.installment_order, p.concept, p.amount, p.status AS payment_status, p.paid_at
     FROM registrations r
     JOIN registration_payments p ON p.registration_id = r.id
     ORDER BY r.last_names, r.first_names, p.installment_order`,
  )
  return rows
}

function paymentStage(row) {
  const installmentOrder = Number(row.installment_order)
  if (row.payment_mode === 'option1') {
    return installmentOrder === 1 ? ['registration', 'module1']
      : installmentOrder === 2 ? ['module2'] : ['module3']
  }
  return installmentOrder === 1 ? ['registration']
    : installmentOrder === 2 ? ['module1']
      : installmentOrder === 3 ? ['module2'] : ['module3']
}

function addPaymentSheet(workbook, name, title, rows, { description }) {
  const sheet = workbook.addWorksheet(name)
  sheet.columns = [
    { key: 'participant', width: 36 }, { key: 'dni', width: 13 },
    { key: 'email', width: 34 }, { key: 'phone', width: 15 },
    { key: 'paymentMode', width: 14 }, { key: 'concept', width: 38 },
    { key: 'amount', width: 14 }, { key: 'paidAt', width: 17 }, { key: 'status', width: 15 },
  ]
  setupAttendanceSheet(workbook, sheet, {
    title, lastColumn: 'I', columnCount: 9, layout: 'landscape', footerLabel: 'Reporte de pagos',
  })
  addInformationField(sheet, {
    row: 6, labelColumn: 'A', valueEnd: 'F', label: 'Curso',
    value: 'Taller de Investigación Aplicada',
  })
  addInformationField(sheet, {
    row: 6, labelColumn: 'G', valueEnd: 'I', label: 'Registros', value: rows.length,
  })
  addInformationField(sheet, {
    row: 7, labelColumn: 'A', valueEnd: 'I', label: 'Contenido', value: description,
  })

  const headerRowNumber = 9
  const header = sheet.getRow(headerRowNumber)
  header.values = ['Participante', 'DNI', 'Correo', 'Celular', 'Modalidad', 'Concepto', 'Monto', 'Fecha de pago', 'Estado']
  styleAttendanceTableHeader(header)

  rows.forEach((item, index) => {
    const row = sheet.addRow([
      item.participant,
      item.dni,
      item.email,
      item.phone,
      item.payment_mode === 'option2' ? 'Opción 2' : 'Opción 1',
      item.concept,
      Number(item.amount),
      item.paid_at ? toExcelDate(item.paid_at) : null,
      item.payment_status === 'paid' ? 'Pagado' : 'Pendiente',
    ])
    styleAttendanceDataRow(row, index, [2, 4, 5, 7, 8, 9])
    row.getCell(7).numFmt = '"S/" #,##0.00'
    row.getCell(8).numFmt = 'dd/mm/yyyy'
    const statusCell = row.getCell(9)
    const paid = item.payment_status === 'paid'
    statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: paid ? excelColors.green : excelColors.amber } }
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: paid ? excelColors.paleGreen : excelColors.paleAmber } }
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  const lastRow = headerRowNumber + rows.length
  sheet.autoFilter = { from: `A${headerRowNumber}`, to: `I${Math.max(headerRowNumber, lastRow)}` }
  sheet.views = [{ showGridLines: false }]
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`
  sheet.pageSetup.printArea = `A1:I${Math.max(headerRowNumber, lastRow)}`
  return sheet
}

export async function buildPaymentReportExcel(rows) {
  const workbook = new ExcelJS.Workbook()
  addPaymentSheet(workbook, 'Todos los pagos', 'Registro general de pagos', rows, {
    description: 'Una fila por cuota. La fecha de pago queda vacía mientras la cuota esté pendiente.',
  })
  const stageSheets = [
    ['Inscripción', 'registration'],
    ['Módulo 1', 'module1'],
    ['Módulo 2', 'module2'],
    ['Módulo 3', 'module3'],
  ]
  stageSheets.forEach(([name, stage]) => {
    addPaymentSheet(workbook, name, `Pagos de ${name.toLocaleLowerCase('es-PE')}`, rows.filter(row => paymentStage(row).includes(stage)), {
      description: `Cuotas correspondientes a ${name.toLocaleLowerCase('es-PE')}.`,
    })
  })
  return workbook.xlsx.writeBuffer()
}

export async function listReport(_req, res, next) {
  try { res.json({ data: await getReportRows() }) }
  catch (error) { next(error) }
}

export async function exportReportExcel(_req, res, next) {
  try {
    const buffer = await buildPaymentReportExcel(await getPaymentReportRows())
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="registro-pagos-${new Date().toISOString().slice(0, 10)}.xlsx"`)
    res.send(Buffer.from(buffer))
  } catch (error) { next(error) }
}

export async function exportReportPdf(_req, res, next) {
  try {
    const rows = await getReportRows()
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="reporte-inscripciones-${new Date().toISOString().slice(0, 10)}.pdf"`)
    doc.pipe(res)
    const columns = [{ x: 28, w: 150, title: 'Participante' }, { x: 178, w: 58, title: 'DNI' }, { x: 236, w: 150, title: 'Correo' }, { x: 386, w: 65, title: 'Modalidad' }, { x: 451, w: 60, title: 'Cuotas' }, { x: 511, w: 82, title: 'Total' }, { x: 593, w: 82, title: 'Pagado' }, { x: 675, w: 82, title: 'Pendiente' }]
    const money = value => `S/ ${Number(value).toFixed(2)}`
    const drawHeader = () => { doc.fillColor('#0b4d96').rect(28, 76, 729, 24).fill(); doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8); columns.forEach(c => doc.text(c.title, c.x + 4, 84, { width: c.w - 8 })) }
    doc.fillColor('#071a35').font('Helvetica-Bold').fontSize(18).text('Reporte de inscripciones y pagos', 28, 28)
    doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(`Facultad de Ingeniería · Generado el ${new Date().toLocaleDateString('es-PE')}`, 28, 53)
    drawHeader()
    let y = 100
    rows.forEach((row, index) => {
      if (y > 535) { doc.addPage(); drawHeader(); y = 100 }
      if (index % 2 === 0) doc.fillColor('#f3f6f9').rect(28, y, 729, 28).fill()
      const values = [row.participant, row.dni, row.email, row.payment_mode === 'option2' ? 'Opción 2' : 'Opción 1', `${row.paid_installments}/${row.installment_count}`, money(row.total_amount), money(row.paid_amount), money(row.pending_amount)]
      doc.fillColor('#243b53').font('Helvetica').fontSize(7.5)
      values.forEach((value, columnIndex) => doc.text(String(value), columns[columnIndex].x + 4, y + 9, { width: columns[columnIndex].w - 8, ellipsis: true, lineBreak: false }))
      y += 28
    })
    doc.end()
  } catch (error) { next(error) }
}
