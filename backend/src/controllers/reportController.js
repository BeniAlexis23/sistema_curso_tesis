import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { pool } from '../config/database.js'
import { createPaymentSchedule } from '../services/paymentSchedule.js'

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

export async function listReport(_req, res, next) {
  try { res.json({ data: await getReportRows() }) }
  catch (error) { next(error) }
}

export async function exportReportExcel(_req, res, next) {
  try {
    const rows = await getReportRows()
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Reporte de pagos', { views: [{ state: 'frozen', ySplit: 1 }] })
    sheet.columns = [
      { header: 'Participante', key: 'participant', width: 34 }, { header: 'DNI', key: 'dni', width: 13 },
      { header: 'Correo', key: 'email', width: 32 }, { header: 'Celular', key: 'phone', width: 16 },
      { header: 'Modalidad', key: 'paymentMode', width: 16 }, { header: 'Estado inscripción', key: 'status', width: 19 },
      { header: 'Cuotas pagadas', key: 'progress', width: 17 }, { header: 'Total', key: 'total', width: 14 },
      { header: 'Pagado', key: 'paid', width: 14 }, { header: 'Pendiente', key: 'pending', width: 14 },
    ]
    const statusLabels = { pending: 'Pendiente', approved: 'Aprobado', observed: 'Observado', rejected: 'Rechazado' }
    rows.forEach(row => sheet.addRow({ participant: row.participant, dni: row.dni, email: row.email, phone: row.phone, paymentMode: row.payment_mode === 'option2' ? 'Opción 2' : 'Opción 1', status: statusLabels[row.registration_status], progress: `${row.paid_installments}/${row.installment_count}`, total: Number(row.total_amount), paid: Number(row.paid_amount), pending: Number(row.pending_amount) }))
    sheet.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B4D96' } }; cell.alignment = { vertical: 'middle' } })
    sheet.getRow(1).height = 25
    ;['H', 'I', 'J'].forEach(column => { sheet.getColumn(column).numFmt = '"S/" #,##0.00' })
    sheet.autoFilter = { from: 'A1', to: 'J1' }
    sheet.eachRow((row, index) => { if (index > 1 && index % 2 === 0) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F6F9' } } }) })
    const buffer = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="reporte-inscripciones-${new Date().toISOString().slice(0, 10)}.xlsx"`)
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
