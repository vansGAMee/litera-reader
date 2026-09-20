import { describe, expect, it } from 'vitest'
import { estimateMinutes, getInitials, normalizeText, readingProgress } from './reader.js'

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
})
