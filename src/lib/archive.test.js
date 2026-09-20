import { describe, expect, it } from 'vitest'
import { validateArchiveEntries } from './archive.js'

describe('archive safety', () => {
  it('accepts a modest archive', () => {
    expect(() => validateArchiveEntries([{ filename: '1.jpg', uncompressedSize: 1000 }], 500)).not.toThrow()
  })

  it('rejects oversized entries and excessive entry counts', () => {
    expect(() => validateArchiveEntries([{ filename: 'huge.bin', uncompressedSize: 101 * 1024 * 1024 }], 1000)).toThrow(/слишком большой/i)
    expect(() => validateArchiveEntries(Array.from({ length: 2001 }, (_, i) => ({ filename: `${i}`, uncompressedSize: 1 })), 1000)).toThrow(/слишком много/i)
  })
})
