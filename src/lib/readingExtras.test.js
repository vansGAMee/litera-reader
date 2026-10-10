import { describe, expect, it } from 'vitest'
import { formatReadingTime, gestureDirection, pdfBookTitle } from './readingExtras.js'

describe('reading time', () => {
  it('shows days, hours and minutes without zero units', () => {
    expect(formatReadingTime(0)).toBe('меньше минуты')
    expect(formatReadingTime(65)).toBe('1 ч 5 мин')
    expect(formatReadingTime(1445)).toBe('1 д 5 мин')
  })
})
describe('PDF titles', () => {
  it.each(['Microsoft Word - document.docx', 'C:\\Users\\user\\book.pdf', '\u0000\ufffdBad', '<xml>junk</xml>', 'a'.repeat(240)])('rejects technical metadata: %s', metadata => {
    expect(pdfBookTitle(metadata, 'Моя_книга.pdf')).toBe('Моя книга')
  })
  it('keeps meaningful metadata', () => expect(pdfBookTitle('Мастер и Маргарита', 'download.pdf')).toBe('Мастер и Маргарита'))
})
describe('page gestures', () => {
  const base = { dx: 0, dy: 0, duration: 120, ratio: 0.9 }
  it('accepts quick edge taps and horizontal swipes', () => {
    expect(gestureDirection(base)).toBe(1)
    expect(gestureDirection({ ...base, ratio: 0.1 })).toBe(-1)
    expect(gestureDirection({ ...base, dx: -90, dy: 15, ratio: 0.5 })).toBe(1)
  })
  it('leaves scrolling, long presses, text selections and center taps alone', () => {
    for (const patch of [{ dy: 90 }, { duration: 800 }, { selected: true }, { ratio: 0.5 }, { dx: 90, dy: 85 }]) expect(gestureDirection({ ...base, ...patch })).toBe(0)
  })
})
