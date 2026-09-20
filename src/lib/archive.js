import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js'

const MAX_ENTRIES = 2000
const MAX_ENTRY_SIZE = 100 * 1024 * 1024
const MAX_TOTAL_SIZE = 500 * 1024 * 1024
const MAX_EXPANSION_RATIO = 200

export function validateArchiveEntries(entries, compressedSize = 0) {
  if (entries.length > MAX_ENTRIES) throw new Error('В архиве слишком много файлов')
  let total = 0
  for (const entry of entries) {
    const size = Number(entry.uncompressedSize) || 0
    if (size > MAX_ENTRY_SIZE) throw new Error(`Файл «${entry.filename}» внутри архива слишком большой`)
    total += size
    if (total > MAX_TOTAL_SIZE) throw new Error('Распакованная книга слишком большая')
  }
  if (compressedSize > 0 && total / compressedSize > MAX_EXPANSION_RATIO) throw new Error('Архив имеет небезопасную степень сжатия')
  return entries
}

async function withEntries(file, callback) {
  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = validateArchiveEntries(await reader.getEntries(), file.size)
    return await callback(entries)
  } finally {
    await reader.close().catch(() => {})
  }
}

export async function validateZipArchive(file) {
  await withEntries(file, async () => undefined)
}

export async function extractComicPages(file) {
  return withEntries(file, async (entries) => {
    const images = entries.filter((entry) => !entry.directory && /\.(jpe?g|png|webp|gif|avif)$/i.test(entry.filename))
      .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }))
    if (!images.length) throw new Error('В CBZ не найдено изображений')
    const pages = []
    for (const entry of images) {
      const extension = entry.filename.split('.').pop().toLowerCase().replace('jpg', 'jpeg')
      pages.push(await entry.getData(new BlobWriter(`image/${extension}`)))
    }
    return pages
  })
}
