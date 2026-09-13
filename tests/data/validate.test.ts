import { describe, expect, it } from 'vitest'
import { validateAllData, type FileReport } from '../../tools/validate-data'

// Runs the exact same per-file Ajv validation as `npm run validate:data` (see src/data/README.md
// for the directory convention), inside vitest. Passes trivially while src/data has no data files.
describe('data files validate against their schemas', () => {
  const reports: FileReport[] = validateAllData()

  it('passes trivially when there is no data yet', () => {
    if (reports.length === 0) expect(reports).toEqual([])
  })

  it.each(reports.map((r): [string, FileReport] => [r.file, r]))('%s', (_file, report) => {
    expect(report.errors).toEqual([])
    expect(report.ok).toBe(true)
  })
})
