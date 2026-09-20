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

export function pageFromProgress(progress, total) {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(total - 1, Math.ceil((Math.max(0, Math.min(100, progress)) / 100) * total) - 1))
}

export function getInitials(author = '') {
  return author.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

export function paginate(text, size = 1850) {
  const pages = []
  let page = ''
  const pushChunk = (chunk, separator = '') => {
    if (page && page.length + separator.length + chunk.length > size) {
      pages.push(page)
      page = ''
    }
    page += `${page ? separator : ''}${chunk}`
  }
  for (const paragraph of String(text).split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    if (paragraph.length <= size) {
      pushChunk(paragraph, '\n\n')
      continue
    }
    for (const word of paragraph.split(/\s+/)) pushChunk(word, ' ')
  }
  if (page) pages.push(page)
  return pages.length ? pages : ['']
}
