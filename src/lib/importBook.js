import { normalizeText } from './reader.js'
import { extractComicPages, validateZipArchive } from './archive.js'

const EBOOK = new Set(['epub', 'mobi', 'azw', 'azw3', 'fb2', 'fbz'])
const DOCUMENT = new Set(['txt', 'md', 'markdown', 'html', 'htm', 'docx', 'rtf'])
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

const extensionOf = (name = '') => name.toLowerCase().endsWith('.fb2.zip')
  ? 'fb2.zip' : name.toLowerCase().split('.').pop()

export function classifyFormat(name = '') {
  const ext = extensionOf(name)
  if (EBOOK.has(ext) || ext === 'fb2.zip') return 'ebook'
  if (ext === 'cbz') return 'comic'
  if (ext === 'pdf') return 'pdf'
  if (DOCUMENT.has(ext)) return 'document'
  if (IMAGE.has(ext)) return 'image'
  return null
}

const valueOf = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(valueOf).filter(Boolean).join(', ')
  if (value.name) return valueOf(value.name)
  const first = Object.values(value)[0]
  return typeof first === 'string' ? first : ''
}

const baseMeta = (file) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: file.name.replace(/\.(fb2\.zip|[^.]+)$/i, ''), author: 'Неизвестный автор', genre: 'Моя книга', year: 'Без даты',
  palette: [['#943528','#d1ad47','#121212'], ['#294e59','#d27c43','#121212'], ['#40563e','#c8b84f','#121212']][Date.now() % 3],
  progress: 0, favorite: false, sourceFormat: extensionOf(file.name).toUpperCase(),
})

const structuredText = (doc) => {
  const root = doc.body || doc.documentElement
  const blocks = [...root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre')]
    .map((node) => node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
  return normalizeText(blocks.length ? blocks.join('\n\n') : root.textContent)
}

const decodeText = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const bad = (utf8.match(/�/g) || []).length
  return bad > Math.max(2, utf8.length / 500) ? new TextDecoder('windows-1251').decode(bytes) : utf8
}

const RTF_DESTINATIONS = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'generator', 'pict', 'shppict', 'nonshppict', 'object', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'fldinst', 'xmlnstbl', 'listtable', 'listoverridetable', 'datastore', 'themedata', 'filetbl', 'revtbl', 'rsidtbl', 'latentstyles', 'pgptbl', 'colorschememapping'])
const RTF_CODE_PAGES = { 65001: 'utf-8', 874: 'windows-874', 932: 'shift_jis', 936: 'gbk', 949: 'euc-kr', 950: 'big5', 1250: 'windows-1250', 1251: 'windows-1251', 1252: 'windows-1252', 1253: 'windows-1253', 1254: 'windows-1254', 1255: 'windows-1255', 1256: 'windows-1256', 1257: 'windows-1257', 1258: 'windows-1258' }

export function parseRtfText(rtf) {
  const codePage = /\\ansicpg(\d+)/i.exec(rtf)?.[1]
  const decoder = new TextDecoder(RTF_CODE_PAGES[codePage] || 'windows-1252')
  const stack = []
  let state = { skip: false, uc: 1, fallback: 0, groupStart: true }
  let output = ''
  const emit = (value) => {
    if (state.skip) return
    if (state.fallback > 0) { state.fallback--; return }
    output += value
  }

  for (let i = 0; i < rtf.length;) {
    const char = rtf[i]
    if (char === '{') {
      stack.push(state)
      state = { ...state, fallback: 0, groupStart: true }
      i++
      continue
    }
    if (char === '}') {
      state = stack.pop() || state
      i++
      continue
    }
    if (char !== '\\') {
      if (char !== '\r' && char !== '\n') emit(char)
      if (!/\s/.test(char)) state.groupStart = false
      i++
      continue
    }

    const symbol = rtf[i + 1]
    if (symbol === '\\' || symbol === '{' || symbol === '}') {
      emit(symbol); state.groupStart = false; i += 2; continue
    }
    if (symbol === "'") {
      const byte = parseInt(rtf.slice(i + 2, i + 4), 16)
      if (Number.isFinite(byte)) emit(decoder.decode(Uint8Array.of(byte)))
      state.groupStart = false; i += 4; continue
    }
    if (symbol === '*') {
      if (state.groupStart) state.skip = true
      i += 2; continue
    }

    const match = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i))
    if (!match) { i += 2; continue }
    const word = match[1].toLowerCase()
    const number = match[2] == null ? null : Number(match[2])
    if (word === 'bin' && number > 0) {
      state.groupStart = false
      i += match[0].length + number
      continue
    }
    if (state.groupStart && RTF_DESTINATIONS.has(word)) state.skip = true
    if (!state.skip) {
      if (word === 'uc' && number != null) state.uc = Math.max(0, number)
      else if (word === 'u' && number != null) {
        output += String.fromCharCode(number < 0 ? number + 65536 : number)
        state.fallback = state.uc
      } else if (word === 'par' || word === 'line') output += '\n\n'
      else if (word === 'tab') output += '\t'
    }
    state.groupStart = false
    i += match[0].length
  }
  return normalizeText(output.replace(/[ \t]{2,}/g, ' '))
}

export function parseRtfBytes(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return parseRtfText(new TextDecoder('utf-16le').decode(bytes))
  const probe = new TextDecoder('windows-1252').decode(bytes)
  const codePage = /\\ansicpg(\d+)/i.exec(probe)?.[1]
  return parseRtfText(new TextDecoder(RTF_CODE_PAGES[codePage] || 'windows-1252').decode(bytes))
}

const extractDocument = async (file, ext) => {
  if (ext === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser.js')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return normalizeText(value)
  }
  if (ext === 'rtf') return parseRtfBytes(new Uint8Array(await file.arrayBuffer()))
  const raw = await decodeText(file)
  if (ext === 'md' || ext === 'markdown') {
    const { marked } = await import('marked')
    const doc = new DOMParser().parseFromString(await marked.parse(raw), 'text/html')
    return structuredText(doc)
  }
  if (ext === 'html' || ext === 'htm') return structuredText(new DOMParser().parseFromString(raw, 'text/html'))
  return normalizeText(raw)
}

const extractEbook = async (file) => {
  const { makeBook } = await import('foliate-js/view.js')
  const engine = await makeBook(file)
  const chunks = []
  for (const section of engine.sections) {
    if (section.linear === 'no' || !section.createDocument) continue
    const doc = await section.createDocument()
    const text = structuredText(doc)
    if (text) chunks.push(text)
    section.unload?.()
  }
  return {
    text: normalizeText(chunks.join('\n\n')),
    title: valueOf(engine.metadata?.title), author: valueOf(engine.metadata?.author),
    language: valueOf(engine.metadata?.language),
  }
}

export async function importBook(file) {
  const family = classifyFormat(file.name)
  if (!family) throw new Error('Формат не поддерживается или защищён DRM')
  if (file.size > 250 * 1024 * 1024) throw new Error('Файл больше 250 МБ — браузер не сможет надёжно сохранить его локально')
  const meta = baseMeta(file)
  const ext = extensionOf(file.name)

  if (['epub', 'fbz', 'fb2.zip'].includes(ext)) await validateZipArchive(file)

  if (family === 'pdf') {
    const { extractPdf } = await import('./pdf.js')
    const parsed = await extractPdf(file)
    return { ...meta, ...parsed, title: parsed.title || meta.title, author: parsed.author || meta.author, kind: parsed.text ? 'text' : 'visual', pages: parsed.text ? undefined : [file] }
  }
  if (family === 'ebook') {
    const parsed = await extractEbook(file)
    if (!parsed.text) throw new Error('В книге не найден текст: возможно, файл повреждён или защищён DRM')
    return { ...meta, ...parsed, title: parsed.title || meta.title, author: parsed.author || meta.author, kind: 'text' }
  }
  if (family === 'comic') return { ...meta, kind: 'visual', pages: await extractComicPages(file) }
  if (family === 'image') return { ...meta, kind: 'visual', pages: [file] }
  const text = await extractDocument(file, ext)
  if (!text) throw new Error('В документе не найден читаемый текст')
  return { ...meta, kind: 'text', text }
}

export function resolveArchivePath(base, href) {
  const parts = `${base}${decodeURIComponent(href).split('#')[0]}`.split('/')
  const resolved = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') resolved.pop()
    else resolved.push(part)
  }
  return resolved.join('/')
}
