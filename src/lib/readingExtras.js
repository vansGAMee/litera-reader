import { repairMojibake } from './reader.js'

export function formatReadingTime(minutes) {
  const total = Math.max(0, Math.ceil(Number(minutes) || 0))
  if (!total) return 'меньше минуты'
  return [[Math.floor(total / 1440), 'д'], [Math.floor(total % 1440 / 60), 'ч'], [total % 60, 'мин']]
    .filter(([value]) => value).map(([value, unit]) => `${value} ${unit}`).join(' ')
}

export function pdfBookTitle(metadata, filename = '') {
  const clean = value => repairMojibake(String(value)).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, '').replace(/\s+/g, ' ').trim()
  const raw = typeof metadata === 'string' ? metadata : ''
  const title = clean(raw)
  const technical = /[<>]|(?:[a-z]:\\|file:\/\/|https?:\/\/)|(?:microsoft\s+(?:word|powerpoint)|acrobat|untitled|document\d*|scanner|scan\d*|adobe|pdfcreator)|\.(?:docx?|pdf|indd|pptx?)$/i
  if (title && title.length <= 160 && !technical.test(raw) && !/[\u0000-\u001f]/.test(raw) && /\p{L}/u.test(title)) return title
  let name = filename.replace(/\.pdf$/i, '')
  try { name = decodeURIComponent(name) } catch { /* Keep malformed percent escapes readable. */ }
  return clean(name.replace(/[_]+/g, ' ').replace(/[<>]/g, '')).slice(0, 200) || 'Книга PDF'
}

export function gestureDirection({ dx, dy, duration, ratio, selected = false }) {
  if (selected || duration > 750) return 0
  if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.35) return dx < 0 ? 1 : -1
  if (Math.abs(dx) > 14 || Math.abs(dy) > 14 || duration > 380) return 0
  return ratio < 0.22 ? -1 : ratio > 0.78 ? 1 : 0
}
