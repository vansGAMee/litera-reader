import { describe, expect, it } from 'vitest'
import {
  decodeSyncPayload,
  encodeSyncPayload,
  extractSyncPayloadFromUrl,
  generateSyncUrl,
  mergeLibraryProgress,
  normalizeKey,
} from './syncQr.js'

describe('syncQr utilities', () => {
  const books = [
    { id: 'dostoevsky', title: 'Братья Карамазовы', author: 'Фёдор Достоевский', progress: 45, currentPage: 12, favorite: true },
    { id: 'bulgakov', title: 'Мастер и Маргарита', author: 'Михаил Булгаков', progress: 0, currentPage: 0, favorite: false },
    { id: 'chekhov', title: 'Палата №6', author: 'Антон Чехов', progress: 80, currentPage: 25, favorite: false },
  ]

  it('normalizes title and author keys', () => {
    expect(normalizeKey('Братья Карамазовы', 'Фёдор Достоевский'))
      .toBe('братья карамазовы федор достоевский')
  })

  it('encodes and decodes valid sync payload', () => {
    const raw = encodeSyncPayload(books)
    expect(typeof raw).toBe('string')

    const decoded = decodeSyncPayload(raw)
    expect(decoded).not.toBeNull()
    expect(decoded.version).toBe(1)
    expect(decoded.items.length).toBe(2) // bulgakov has 0 progress and not favorite

    const dostoevsky = decoded.items.find((x) => x.id === 'dostoevsky')
    expect(dostoevsky.p).toBe(45)
    expect(dostoevsky.c).toBe(12)
    expect(dostoevsky.f).toBe(true)
  })

  it('handles invalid or malformed QR strings gracefully', () => {
    expect(decodeSyncPayload('')).toBeNull()
    expect(decodeSyncPayload('not json')).toBeNull()
    expect(decodeSyncPayload('{"invalid":123}')).toBeNull()
    expect(decodeSyncPayload(null)).toBeNull()
  })

  it('merges library progress by id and title/author', () => {
    const currentBooks = [
      { id: 'dostoevsky', title: 'Братья Карамазовы', author: 'Фёдор Достоевский', progress: 10, currentPage: 2 },
      { id: 'chekhov-custom-id', title: 'Палата №6', author: 'Антон Чехов', progress: 20, currentPage: 5 },
      { id: 'tolstoy', title: 'Война и мир', author: 'Лев Толстой', progress: 50, currentPage: 100 },
    ]

    const incomingPayload = {
      version: 1,
      timestamp: Date.now(),
      items: [
        { id: 'dostoevsky', p: 55, c: 15, t: 'Братья Карамазовы', a: 'Фёдор Достоевский' },
        { id: 'chekhov', p: 80, c: 25, t: 'Палата №6', a: 'Антон Чехов' }, // matched by title/author
      ],
    }

    const { updatedBooks, changedCount, updatedTitles } = mergeLibraryProgress(currentBooks, incomingPayload)

    expect(changedCount).toBe(2)
    expect(updatedTitles).toContain('Братья Карамазовы')
    expect(updatedTitles).toContain('Палата №6')

    const updatedDostoevsky = updatedBooks.find((b) => b.id === 'dostoevsky')
    expect(updatedDostoevsky.progress).toBe(55)
    expect(updatedDostoevsky.currentPage).toBe(15)

    const updatedChekhov = updatedBooks.find((b) => b.id === 'chekhov-custom-id')
    expect(updatedChekhov.progress).toBe(80)
    expect(updatedChekhov.currentPage).toBe(25)

    const tolstoy = updatedBooks.find((b) => b.id === 'tolstoy')
    expect(tolstoy.progress).toBe(50)
  })

  it('generates and parses sync URL correctly', () => {
    const url = generateSyncUrl(books, 'https://litera.app/')
    expect(url).toContain('https://litera.app/#sync=')

    const extracted = extractSyncPayloadFromUrl(url)
    expect(extracted).not.toBeNull()
    expect(extracted.items.length).toBe(2)
    expect(extracted.items.find((x) => x.id === 'dostoevsky')?.p).toBe(45)

    // Also handles direct hash string
    const hash = url.split('https://litera.app/')[1]
    const fromHash = extractSyncPayloadFromUrl(hash)
    expect(fromHash).not.toBeNull()
    expect(fromHash.items.length).toBe(2)

    // Also handles URL passed into decodeSyncPayload
    const fromDecode = decodeSyncPayload(url)
    expect(fromDecode).not.toBeNull()
    expect(fromDecode.items.length).toBe(2)
  })
})
