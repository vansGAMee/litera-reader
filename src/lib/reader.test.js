import { describe, expect, it } from 'vitest'
import { estimateMinutes, getInitials, normalizeText, pageFromProgress, paginate, readingProgress, repairMojibake } from './reader.js'

describe('reader utilities', () => {
  it('normalizes FB2-like text into readable paragraphs', () => {
    expect(normalizeText('<p>Первая &amp; важная.</p><p>Вторая.</p>'))
      .toBe('Первая & важная.\n\nВторая.')
  })

  it('estimates reading time in whole minutes', () => {
    expect(estimateMinutes('слово '.repeat(430), 215)).toBe(2)
  })

  it('calculates safe progress', () => {
    expect(readingProgress(50, 200)).toBe(25)
    expect(readingProgress(0, 0)).toBe(0)
  })

  it('builds a two-letter monogram from an author', () => {
    expect(getInitials('Михаил Булгаков')).toBe('МБ')
    expect(getInitials('Гомер')).toBe('Г')
  })

  it('preserves paragraph boundaries while paginating', () => {
    expect(paginate('Глава первая\n\nПервый абзац.\n\nВторой абзац.', 30))
      .toEqual(['Глава первая\n\nПервый абзац.', 'Второй абзац.'])
  })

  it('restores the page from saved percentage and actual page count', () => {
    expect(pageFromProgress(50, 20)).toBe(9)
    expect(pageFromProgress(100, 20)).toBe(19)
    expect(pageFromProgress(30, 0)).toBe(0)
  })

  it('repairs UTF-8 text decoded as Windows-1252', () => {
    expect(repairMojibake('Nietzscheâ€™s â€œgoodâ€ book')).toBe('Nietzsche’s “good” book')
    expect(repairMojibake('Нормальный русский текст')).toBe('Нормальный русский текст')
  })
})
