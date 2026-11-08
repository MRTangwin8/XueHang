import type ExcelJS from 'exceljs'

/** 以这些字符开头的文本会被 Excel / WPS 当作公式执行（CSV/公式注入） */
const DANGEROUS = /^[=+\-@\t\r]/

/**
 * 导出前调用：把所有「看起来像公式」的文本单元格前加 ' 变为纯文本。
 * 例如学员姓名填成 =HYPERLINK("http://evil",...) 时，打开导出表格不会执行。
 * 数字、日期等非字符串单元格不受影响。
 */
export function neutralizeFormulas(wb: ExcelJS.Workbook): ExcelJS.Workbook {
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string' && DANGEROUS.test(cell.value)) cell.value = `'${cell.value}`
      })
    })
  })
  return wb
}

/** 统一的 xlsx 写出：先中和公式，再输出 Buffer */
export async function workbookBuffer(wb: ExcelJS.Workbook) {
  return neutralizeFormulas(wb).xlsx.writeBuffer()
}
