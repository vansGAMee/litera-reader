import { describe, it, expect, beforeEach } from 'vitest'
import {
  exportLibraryBundle,
  importLibraryBundle,
  isLibraryBackupContent,
  isLibraryBackupFileName,
  getStorageItem,
  setStorageItem,
  clearBackupStorage,
} from './libraryBackup.js'

describe('libraryBackup', () => {
  beforeEach(() => {
    clearBackupStorage()
  })

  it('detects library backup file names correctly', () => {
    expect(isLibraryBackupFileName('litera-backup.litera')).toBe(true)
    expect(isLibraryBackupFileName('my-library.litera.json')).toBe(true)
    expect(isLibraryBackupFileName('litera_export.json')).toBe(true)
    expect(isLibraryBackupFileName('random_book.epub')).toBe(false)
  })

  it('detects library backup content correctly', () => {
    expect(isLibraryBackupContent({ type: 'litera-library-backup', books: [] })).toBe(true)
    expect(isLibraryBackupContent({ books: [{ title: 'Война и мир', author: 'Толстой' }] })).toBe(true)
    expect(isLibraryBackupContent('{"type":"litera-library-backup","books":[]}')).toBe(true)
    expect(isLibraryBackupContent(null)).toBe(false)
    expect(isLibraryBackupContent('{}')).toBe(false)
  })

  it('exports and imports library bundle with books and settings', async () => {
    setStorageItem('litera-font', '22')
    setStorageItem('litera-theme', 'sepia')

    const books = [
      {
        id: 'book-1',
        title: 'Братья Карамазовы',
        author: 'Фёдор Достоевский',
        progress: 45,
        currentPage: 120,
        text: 'Текст первой книги',
        notes: [{ id: 'n1', text: 'Красота спасёт мир' }],
        favorite: true,
      },
      {
        id: 'book-2',
        title: 'Мастер и Маргарита',
        author: 'Михаил Булгаков',
        progress: 10,
        currentPage: 25,
        text: 'Текст второй книги',
        favorite: false,
      },
    ]

    const exportedJson = await exportLibraryBundle(books, {
      readingProfile: { wpm: 260, samplesCount: 15 },
    })
    expect(typeof exportedJson).toBe('string')

    const parsed = JSON.parse(exportedJson)
    expect(parsed.type).toBe('litera-library-backup')
    expect(parsed.bookCount).toBe(2)
    expect(parsed.books.length).toBe(2)
    expect(parsed.settings.font).toBe('22')
    expect(parsed.settings.theme).toBe('sepia')
    expect(parsed.readingProfile.wpm).toBe(260)

    // Clear settings to verify restore
    clearBackupStorage()

    // Import into empty library
    const result = await importLibraryBundle(exportedJson, [], 'merge')
    expect(result.books.length).toBe(2)
    expect(result.addedCount).toBe(2)
    expect(result.updatedCount).toBe(0)
    expect(getStorageItem('litera-font')).toBe('22')
    expect(getStorageItem('litera-theme')).toBe('sepia')
    expect(JSON.parse(getStorageItem('litera-reading-profile-v1')).wpm).toBe(260)
  })

  it('merges new books and updates progress/notes of existing books', async () => {
    const existing = [
      {
        id: 'book-1',
        title: 'Братья Карамазовы',
        author: 'Фёдор Достоевский',
        progress: 20,
        currentPage: 40,
        text: 'Существующий текст',
        notes: [{ id: 'n1', text: 'Первая цитата' }],
      },
    ]

    const incomingBundle = {
      type: 'litera-library-backup',
      books: [
        {
          id: 'book-1',
          title: 'Братья Карамазовы',
          author: 'Фёдор Достоевский',
          progress: 55, // higher progress from phone
          currentPage: 110,
          text: 'Существующий текст',
          notes: [
            { id: 'n1', text: 'Первая цитата' },
            { id: 'n2', text: 'Новая цитата с телефона' },
          ],
        },
        {
          id: 'book-new-from-phone',
          title: 'Новая книга с телефона',
          author: 'Автор с телефона',
          progress: 15,
          currentPage: 30,
          text: 'Текст новой книги',
        },
      ],
    }

    const { books, addedCount, updatedCount } = await importLibraryBundle(incomingBundle, existing, 'merge')
    expect(books.length).toBe(2)
    expect(addedCount).toBe(1)
    expect(updatedCount).toBe(1)

    const updatedBook1 = books.find((b) => b.id === 'book-1')
    expect(updatedBook1.progress).toBe(55)
    expect(updatedBook1.currentPage).toBe(110)
    expect(updatedBook1.notes.length).toBe(2)
    expect(updatedBook1.notes[1].text).toBe('Новая цитата с телефона')

    const newBook = books.find((b) => b.id === 'book-new-from-phone')
    expect(newBook).toBeDefined()
    expect(newBook.title).toBe('Новая книга с телефона')
  })

  it('supports replace mode', async () => {
    const existing = [{ id: 'old-1', title: 'Старая' }]
    const incomingBundle = {
      type: 'litera-library-backup',
      books: [{ id: 'new-1', title: 'Новая книга' }],
    }
    const result = await importLibraryBundle(incomingBundle, existing, 'replace')
    expect(result.books.length).toBe(1)
    expect(result.books[0].id).toBe('new-1')
  })
})
