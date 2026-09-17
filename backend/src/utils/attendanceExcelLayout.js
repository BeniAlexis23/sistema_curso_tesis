import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const undcLogoPath = fileURLToPath(new URL('../../assets/branding/logo-undc.png', import.meta.url))
const facultyLogoPath = fileURLToPath(new URL('../../assets/branding/logo-facultad-ingenieria.png', import.meta.url))

export const excelColors = {
  navy: 'FF071A35',
  blue: 'FF0B4D96',
  cyan: 'FF00A7C4',
  text: 'FF14243A',
  muted: 'FF58708F',
  line: 'FFD7E0EA',
  stripe: 'FFF4F7FA',
  paleBlue: 'FFEAF3FB',
  green: 'FF087F5B',
  paleGreen: 'FFDDF3E8',
  red: 'FFC92A2A',
  paleRed: 'FFFFE3E3',
  amber: 'FF9C6500',
  paleAmber: 'FFFFF1CC',
  white: 'FFFFFFFF',
}

const thinBorder = {
  bottom: { style: 'thin', color: { argb: excelColors.line } },
}

function addLogo(workbook, sheet, path, column, width = 54, height = 54) {
  if (!existsSync(path)) return
  const imageId = workbook.addImage({ filename: path, extension: 'png' })
  sheet.addImage(imageId, {
    tl: { col: column + 0.12, row: 0.12 },
    ext: { width, height },
    editAs: 'oneCell',
  })
}

export function setupAttendanceSheet(workbook, sheet, {
  title,
  lastColumn,
  columnCount,
  layout = 'portrait',
}) {
  workbook.creator = 'Universidad Nacional de Cañete'
  workbook.company = 'Universidad Nacional de Cañete'
  workbook.subject = title
  workbook.title = title
  workbook.created = new Date()
  workbook.modified = new Date()

  sheet.properties.defaultRowHeight = 20
  sheet.properties.tabColor = { argb: excelColors.blue }
  sheet.views = [{ showGridLines: false }]
  sheet.pageSetup = {
    paperSize: 9,
    orientation: layout,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
  }
  sheet.headerFooter.oddFooter = '&LUniversidad Nacional de Cañete&C&P de &N&RReporte de asistencia'

  sheet.getRow(1).height = 31
  sheet.getRow(2).height = 30
  sheet.mergeCells(`B1:${String.fromCharCode(64 + columnCount - 1)}2`)
  const institutionCell = sheet.getCell('B1')
  institutionCell.value = 'UNIVERSIDAD NACIONAL DE CAÑETE'
  institutionCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: excelColors.navy } }
  institutionCell.alignment = { horizontal: 'center', vertical: 'middle' }

  addLogo(workbook, sheet, undcLogoPath, 0)
  addLogo(workbook, sheet, facultyLogoPath, columnCount - 1)

  sheet.getRow(3).height = 8
  sheet.mergeCells(`A4:${lastColumn}4`)
  const titleCell = sheet.getCell('A4')
  titleCell.value = title.toLocaleUpperCase('es-PE')
  titleCell.font = { name: 'Arial', size: 11, bold: true, color: { argb: excelColors.white } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.blue } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(4).height = 24
}

export function addInformationField(sheet, {
  row,
  labelColumn,
  valueEnd,
  label,
  value,
}) {
  if (labelColumn !== valueEnd) sheet.mergeCells(`${labelColumn}${row}:${valueEnd}${row}`)
  const fieldCell = sheet.getCell(`${labelColumn}${row}`)
  fieldCell.value = {
    richText: [
      { font: { name: 'Arial', size: 9, bold: true, color: { argb: excelColors.muted } }, text: `${label}: ` },
      { font: { name: 'Arial', size: 9, color: { argb: excelColors.text } }, text: String(value ?? '') },
    ],
  }
  fieldCell.alignment = { vertical: 'middle', wrapText: true }
  sheet.getRow(row).height = Math.max(sheet.getRow(row).height || 20, 22)
}

export function styleAttendanceTableHeader(row) {
  row.height = 28
  row.eachCell(cell => {
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: excelColors.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.navy } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      left: { style: 'thin', color: { argb: excelColors.white } },
      right: { style: 'thin', color: { argb: excelColors.white } },
    }
  })
}

export function styleAttendanceDataRow(row, index, centeredColumns = []) {
  row.height = 24
  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    cell.font = { name: 'Arial', size: 9, color: { argb: excelColors.text } }
    if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelColors.stripe } }
    cell.alignment = {
      horizontal: centeredColumns.includes(columnNumber) ? 'center' : 'left',
      vertical: 'middle',
      wrapText: false,
    }
    cell.border = thinBorder
  })
}

export function styleStatusCell(cell, status) {
  const isPresent = status === 'present'
  cell.font = {
    name: 'Arial', size: 9, bold: true,
    color: { argb: isPresent ? excelColors.green : excelColors.red },
  }
  cell.fill = {
    type: 'pattern', pattern: 'solid',
    fgColor: { argb: isPresent ? excelColors.paleGreen : excelColors.paleRed },
  }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

export function toExcelDate(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}
