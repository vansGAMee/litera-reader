import { describe, expect, it, vi } from 'vitest'
import { formatReadingTime, gestureDirection, pdfBookTitle } from './readingExtras.js'
import { usePageGestures } from './usePageGestures.js'

vi.mock('react', () => ({
  useRef: (init) => ({ current: init }),
}))

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
describe('usePageGestures', () => {
  it('triggers onTurn on horizontal swipe', () => {
    const onTurn = vi.fn()
    const handlers = usePageGestures(onTurn, false)
    const target = { getBoundingClientRect: () => ({ left: 0, width: 400 }), scrollTop: 0 }
    handlers.onTouchStart({ touches: [{ clientX: 300, clientY: 400 }], target, currentTarget: target })
    handlers.onTouchMove({ touches: [{ clientX: 100, clientY: 400 }] })
    handlers.onTouchEnd({ currentTarget: target })
    expect(onTurn).toHaveBeenCalledWith(1)
  })
  it('does NOT trigger onTurn if vertical scroll occurred during touch', () => {
    const onTurn = vi.fn()
    const handlers = usePageGestures(onTurn, false)
    const target = { getBoundingClientRect: () => ({ left: 0, width: 400 }), scrollTop: 0 }
    handlers.onTouchStart({ touches: [{ clientX: 350, clientY: 500 }], target, currentTarget: target })
    target.scrollTop = 80 // Scrolled vertically
    handlers.onTouchEnd({ currentTarget: target })
    expect(onTurn).not.toHaveBeenCalled()
  })
})

