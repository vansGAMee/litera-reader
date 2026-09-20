const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const win1252 = new Map([[0x20ac,0x80],[0x201a,0x82],[0x0192,0x83],[0x201e,0x84],[0x2026,0x85],[0x2020,0x86],[0x2021,0x87],[0x02c6,0x88],[0x2030,0x89],[0x0160,0x8a],[0x2039,0x8b],[0x0152,0x8c],[0x017d,0x8e],[0x2018,0x91],[0x2019,0x92],[0x201c,0x93],[0x201d,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],[0x02dc,0x98],[0x2122,0x99],[0x0161,0x9a],[0x203a,0x9b],[0x0153,0x9c],[0x017e,0x9e],[0x0178,0x9f]])

export function repairMojibake(text = '') {
  if (!/[ÃÂâïð]/.test(text)) return text
  const repair = (chunk) => {
    if (!/[ÃÂâïð]/.test(chunk)) return chunk
    const bytes = []
    for (const char of chunk) {
      const code = char.codePointAt(0)
      const byte = code <= 0xff ? code : win1252.get(code)
      if (byte == null) return chunk
      bytes.push(byte)
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(bytes))
    return (decoded.match(/�/g) || []).length <= (chunk.match(/�/g) || []).length ? decoded : chunk
  }
  let result = text
  for (let pass = 0; pass < 2; pass++) result = result.replace(/[\u0000-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u203a\u20ac\u2122]+/gi, repair)
  return result.replace(/^\uFEFF/, '')
}

export function normalizeText(input = '') {
  return repairMojibake(String(input))
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
