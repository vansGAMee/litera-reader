const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function normalizeText(input = '') {
  return String(input)
    .replace(/<\/?(p|div|section|title|subtitle|empty-line|br)[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (_, code) => {
      if (code[0] === '#') {
        const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10
        return String.fromCodePoint(parseInt(code.replace(/^#x?/i, ''), radix))
      }
      return entities[code.toLowerCase()] ?? `&${code};`
    })
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function estimateMinutes(text = '', wordsPerMinute = 215) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length
  return words ? Math.max(1, Math.ceil(words / wordsPerMinute)) : 0
}

export function readingProgress(current, total) {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)))
}

export function getInitials(author = '') {
  return author.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

export function paginate(text, size = 1850) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const pages = []
  let page = ''
  for (const word of words) {
    if (page.length && page.length + word.length + 1 > size) {
      pages.push(page)
      page = word
    } else page += `${page ? ' ' : ''}${word}`
  }
  if (page) pages.push(page)
  return pages.length ? pages : ['']
}
