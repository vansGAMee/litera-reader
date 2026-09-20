import { describe, expect, it } from 'vitest'
import { classifyFormat, parseRtfBytes, parseRtfText, resolveArchivePath } from './importBook.js'

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

describe('RTF normalization', () => {
  it('drops metadata tables and consumes unicode fallback characters', () => {
    const rtf = String.raw`{\rtf1\ansi{\fonttbl{\f0 Times New Roman;}}{\colortbl;\red1\green2\blue3;}{\*\generator Word;}\f0 Hello \u8217?world\par Next}`
    expect(parseRtfText(rtf)).toBe("Hello ’world\n\nNext")
  })

  it('decodes hex escapes using the declared Windows code page', () => {
    expect(parseRtfText(String.raw`{\rtf1\ansi\ansicpg1251 \'cf\'f0\'e8\'e2\'e5\'f2}`)).toBe('Привет')
  })

  it('does not leak embedded binary payloads', () => {
    expect(parseRtfText(String.raw`{\rtf1 Before \bin6 ABCDEF After}`)).toBe('Before After')
  })

  it('honors the code page for literal ANSI bytes', () => {
    const prefix = new TextEncoder().encode(String.raw`{\rtf1\ansi\ansicpg1252 caf`)
    const bytes = Uint8Array.from([...prefix, 0xe9, 0x7d])
    expect(parseRtfBytes(bytes)).toBe('café')
  })
})
