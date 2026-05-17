import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { extractSpreadsheetTextWithMeta } from './spreadsheet-extractor'

describe('spreadsheet extractor', () => {
  it('extracts CSV metadata and preview rows', async () => {
    const file = new File(['Nome;Valor\nTaxa;10\nMulta;20'], 'custos.csv', { type: 'text/csv' })

    const result = await extractSpreadsheetTextWithMeta(file)

    expect(result.sheetCount).toBe(1)
    expect(result.rowCount).toBe(3)
    expect(result.columnCount).toBe(2)
    expect(result.sheets[0].previewRows[0]).toEqual(['Nome', 'Valor'])
    expect(result.text).toContain('Aba: CSV')
    expect(result.text).toContain('Taxa | 10')
  })

  it('extracts XLSX shared strings and worksheet rows', async () => {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
      '<sheets><sheet name="Dados" sheetId="1" r:id="rId1"/></sheets>',
      '</workbook>',
    ].join(''))
    zip.file('xl/_rels/workbook.xml.rels', [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Relationships>',
      '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>',
      '</Relationships>',
    ].join(''))
    zip.file('xl/sharedStrings.xml', [
      '<sst>',
      '<si><t>Nome</t></si>',
      '<si><t>Valor</t></si>',
      '<si><t>Custas</t></si>',
      '</sst>',
    ].join(''))
    zip.file('xl/worksheets/sheet1.xml', [
      '<worksheet><sheetData>',
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>123</v></c></row>',
      '</sheetData></worksheet>',
    ].join(''))
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const file = new File([blob], 'dados.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    const result = await extractSpreadsheetTextWithMeta(file)

    expect(result.sheetCount).toBe(1)
    expect(result.sheets[0]).toMatchObject({ name: 'Dados', rowCount: 2, columnCount: 2 })
    expect(result.sheets[0].previewRows[1]).toEqual(['Custas', '123'])
    expect(result.text).toContain('Custas | 123')
  })
})
