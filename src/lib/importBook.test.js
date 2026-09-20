import { describe, expect, it } from 'vitest'
import { classifyFormat, resolveArchivePath } from './importBook.js'

describe('EPUB paths', () => {
  it('resolves parent segments relative to the OPF folder', () => {
    expect(resolveArchivePath('OPS/package/', '../Text/chapter.xhtml#start')).toBe('OPS/Text/chapter.xhtml')
  })
})

describe('format classification', () => {
  it.each([
    ['book.epub', 'ebook'], ['book.mobi', 'ebook'], ['book.azw3', 'ebook'],
    ['book.fb2', 'ebook'], ['book.fb2.zip', 'ebook'], ['comic.cbz', 'comic'],
    ['book.pdf', 'pdf'], ['book.docx', 'document'], ['book.md', 'document'],
    ['book.html', 'document'], ['book.rtf', 'document'], ['book.txt', 'document'],
    ['cover.webp', 'image'],
  ])('classifies %s as %s', (name, kind) => {
    expect(classifyFormat(name)).toBe(kind)
  })

  it('rejects executable and DRM container formats', () => {
    expect(classifyFormat('installer.exe')).toBe(null)
    expect(classifyFormat('locked.acsm')).toBe(null)
  })
})
