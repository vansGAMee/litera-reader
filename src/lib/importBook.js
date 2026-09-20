import { unzipSync } from 'fflate'
import { normalizeText } from './reader.js'

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

const rtfToText = (rtf) => normalizeText(rtf
  .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
  .replace(/\\'[\da-f]{2}/gi, (hex) => new TextDecoder('windows-1251').decode(Uint8Array.of(parseInt(hex.slice(2), 16))))
  .replace(/\\par[d]?\b/g, '\n\n')
  .replace(/\\[a-z]+-?\d* ?/gi, '')
  .replace(/[{}]/g, ''))

const extractDocument = async (file, ext) => {
  if (ext === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser.js')
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return normalizeText(value)
  }
  const raw = await decodeText(file)
  if (ext === 'rtf') return rtfToText(raw)
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

const extractComic = async (file) => {
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
  const names = Object.keys(archive).filter((name) => /\.(jpe?g|png|webp|gif|avif)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!names.length) throw new Error('В CBZ не найдено изображений')
  return names.map((name) => new Blob([archive[name]], { type: `image/${name.split('.').pop().replace('jpg', 'jpeg')}` }))
}

export async function importBook(file) {
  const family = classifyFormat(file.name)
  if (!family) throw new Error('Формат не поддерживается или защищён DRM')
  if (file.size > 250 * 1024 * 1024) throw new Error('Файл больше 250 МБ — браузер не сможет надёжно сохранить его локально')
  const meta = baseMeta(file)
  const ext = extensionOf(file.name)

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
  if (family === 'comic') return { ...meta, kind: 'visual', pages: await extractComic(file) }
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
