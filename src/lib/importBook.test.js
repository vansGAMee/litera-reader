import { describe, expect, it } from 'vitest'
import { classifyFormat, parseRtfBytes, parseRtfText, resolveArchivePath, structuredText } from './importBook.js'

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

describe('structured document normalization', () => {
  const text = (nodeValue) => ({ nodeType: 3, nodeValue })
  const element = (tagName, ...childNodes) => ({ nodeType: 1, tagName, childNodes })

  it('keeps loose text once while dropping executable and style content', () => {
    const body = element('BODY',
      element('DIV', text('Loose text')),
      element('LI', element('P', text('Nested item'))),
      element('SCRIPT', text('alert("leak")')),
      element('STYLE', text('.leak{}')),
    )
    expect(structuredText({ body })).toBe('Loose text\n\nNested item')
  })
})

describe('real document imports', () => {
  it('decodes UTF-16BE text', async () => {
    const { importBook } = await import('./importBook.js')
    const text = 'Привет, читатель!'
    const bytes = [0xfe, 0xff, ...Array.from(text).flatMap(c => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 255])]
    expect((await importBook(new File([new Uint8Array(bytes)], 'book.txt'))).text).toBe(text)
  })
  it('decodes even short Windows-1251 text', async () => {
    const { importBook } = await import('./importBook.js')
    expect((await importBook(new File([new Uint8Array([0xdf])], 'book.txt'))).text).toBe('Я')
  })
  it('rejects an empty book with a useful message', async () => {
    const { importBook } = await import('./importBook.js')
    await expect(importBook(new File([], 'empty.epub'))).rejects.toThrow('Файл пуст')
  })
  it('preserves XHTML paragraphs and excludes scripts', () => {
    const t = nodeValue => ({ nodeType: 3, nodeValue })
    const el = (tagName, ...childNodes) => ({ nodeType: 1, tagName, childNodes })
    expect(structuredText({ documentElement: el('html', el('body', el('p', t('Первый')), el('p', t('Второй')), el('script', t('bad')))) })).toBe('Первый\n\nВторой')
  })
})
