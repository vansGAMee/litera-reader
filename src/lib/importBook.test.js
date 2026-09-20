import { describe, expect, it } from 'vitest'
import { resolveArchivePath } from './importBook.js'

describe('EPUB paths', () => {
  it('resolves parent segments relative to the OPF folder', () => {
    expect(resolveArchivePath('OPS/package/', '../Text/chapter.xhtml#start')).toBe('OPS/Text/chapter.xhtml')
  })
})
