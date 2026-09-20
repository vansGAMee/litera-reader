import { describe, expect, it, vi } from 'vitest'
import { migrateStoredBooks } from './migrateLibrary.js'

describe('legacy library migration', () => {
  it('isolates a failed PDF and preserves its original bytes', async () => {
    const blob = new Blob(['broken pdf'])
    const saved = [{ id: 'old', title: 'Старая книга', kind: 'pdf', blob, progress: 37, notes: ['note'] }, { id: 'text', kind: 'text' }]
    const result = await migrateStoredBooks(saved, vi.fn().mockRejectedValue(new Error('bad pdf')), (value) => value, vi.fn().mockResolvedValue(42))

    expect(result.failures).toBe(1)
    expect(result.books).toHaveLength(2)
    expect(result.books[0]).toMatchObject({ id: 'old', kind: 'visual', sourceFormat: 'PDF', progress: 37, pageCount: 42, migrationError: true })
    expect(result.books[0].pages[0]).toBe(blob)
    expect(result.books[1]).toBe(saved[1])
  })
})
