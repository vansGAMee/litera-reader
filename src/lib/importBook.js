import { unzipSync, strFromU8 } from 'fflate'
import { normalizeText } from './reader.js'

const findText = (xml, selector) => {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  return doc.querySelector(selector)?.textContent?.trim() || ''
}

const baseMeta = (file) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  title: file.name.replace(/\.[^.]+$/, ''), author: 'Неизвестный автор', genre: 'Моя книга', year: 'Без даты',
  palette: [['#943528','#d1ad47','#121212'], ['#294e59','#d27c43','#121212'], ['#40563e','#c8b84f','#121212']][Date.now() % 3],
  progress: 0, favorite: false,
})

export async function importBook(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  const meta = baseMeta(file)
  if (ext === 'pdf') return { ...meta, kind: 'pdf', blob: file, text: '' }
  if (ext === 'txt') return { ...meta, kind: 'text', text: normalizeText(await file.text()) }
  if (ext === 'fb2') {
    const xml = await file.text()
    const first = findText(xml, 'first-name'); const last = findText(xml, 'last-name')
    return { ...meta, kind: 'text', title: findText(xml, 'book-title') || meta.title, author: [first, last].filter(Boolean).join(' ') || meta.author, text: normalizeText(xml.match(/<body[\s\S]*?<\/body>/i)?.[0] || xml) }
  }
  if (ext === 'epub') {
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()))
    const container = strFromU8(archive['META-INF/container.xml'])
    const rootPath = findText(container.replace(/full-path=/, '>').replace(/"[^>]*\/?>([\s\S]*)/, '$1'), 'x')
      || container.match(/full-path=["']([^"']+)/)?.[1]
    const opfPath = rootPath || Object.keys(archive).find((key) => key.endsWith('.opf'))
    const opf = strFromU8(archive[opfPath]); const folder = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''
    const doc = new DOMParser().parseFromString(opf, 'text/xml')
    const items = [...doc.querySelectorAll('manifest item')].filter((node) => /xhtml|html/.test(node.getAttribute('media-type') || ''))
    const chapters = items.map((node) => archive[folder + node.getAttribute('href')]).filter(Boolean).map(strFromU8)
    return { ...meta, kind: 'text', title: findText(opf, 'title') || meta.title, author: findText(opf, 'creator') || meta.author, text: normalizeText(chapters.join('\n\n')) }
  }
  throw new Error('Поддерживаются EPUB, FB2, TXT и PDF')
}
