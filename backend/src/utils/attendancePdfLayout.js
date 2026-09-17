import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const undcLogoPath = fileURLToPath(new URL('../../assets/branding/logo-undc.png', import.meta.url))
const facultyLogoPath = fileURLToPath(new URL('../../assets/branding/logo-facultad-ingenieria.png', import.meta.url))
export const attendanceConformityFooterHeight = 82

const deanName = 'ALMIDON ORTIZ CARLOS ALCIDES'
const deanDni = '20066294'

export function uppercase(value) {
  return String(value || '').trim().toLocaleUpperCase('es-PE')
}

export function drawPdfLabeledValue(doc, label, value, x, y, labelWidth, valueWidth, options = {}) {
  doc.fillColor('#111111').font('Helvetica-Bold').fontSize(options.fontSize || 7.5)
    .text(`${label}:`, x, y, { width: labelWidth, lineBreak: false })
  doc.font('Helvetica').fontSize(options.fontSize || 7.5)
    .text(value, x + labelWidth, y, { width: valueWidth, lineBreak: false, ellipsis: true })
}

export function drawInstitutionalAttendanceHeader(doc, {
  left, contentWidth, title = 'REGISTRO DE ASISTENCIA', continued = false,
}) {
  const pageWidth = doc.page.width
  if (existsSync(undcLogoPath)) doc.image(undcLogoPath, left, 22, { fit: [54, 54], align: 'center', valign: 'center' })
  if (existsSync(facultyLogoPath)) doc.image(facultyLogoPath, pageWidth - left - 54, 22, { fit: [54, 54], align: 'center', valign: 'center' })
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(14)
    .text('UNIVERSIDAD NACIONAL DE CAÑETE', left + 70, 36, { width: contentWidth - 140, align: 'center' })
  if (continued) doc.font('Helvetica').fontSize(7)
    .text('CONTINUACIÓN', left + 70, 54, { width: contentWidth - 140, align: 'center' })

  const barY = 84
  doc.lineWidth(0.7).rect(left, barY, contentWidth, 14).stroke('#000000')
  doc.font('Helvetica').fontSize(8).text(title, left, barY + 3, { width: contentWidth, align: 'center' })
  return 103
}

export function drawAttendanceConformity(doc, conformityAt, { left, contentWidth }) {
  if (!conformityAt) return
  const raw = String(conformityAt)
  const date = `${raw.slice(8, 10)}/${raw.slice(5, 7)}/${raw.slice(0, 4)}`
  const time = raw.slice(11, 16)
  const center = left + (contentWidth / 2)
  const signatureWidth = Math.min(330, contentWidth * 0.55)
  const x = center - (signatureWidth / 2)
  const y = doc.page.height - 70

  doc.fillColor('#111111').font('Helvetica').fontSize(7.5)
    .text(`Fecha de registro: ${date}${time ? ` ${time}` : ''}`, x, y, {
      width: signatureWidth, align: 'center', lineBreak: false,
    })
  doc.lineWidth(0.7).moveTo(x, y + 16).lineTo(x + signatureWidth, y + 16).stroke('#000000')
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9)
    .text(deanName, x, y + 23, { width: signatureWidth, align: 'center', lineBreak: false })
  doc.font('Helvetica').fontSize(8)
    .text(`DNI: ${deanDni}`, x, y + 36, { width: signatureWidth, align: 'center', lineBreak: false })
}
