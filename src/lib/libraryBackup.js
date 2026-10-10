const memoryStore = new Map()

export function getStorageItem(key) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      return localStorage.getItem(key)
    }
  } catch {
    /* fallback */
  }
  return memoryStore.get(key) ?? null
}

export function setStorageItem(key, val) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem(key, val)
      return
    }
  } catch {
    /* fallback */
  }
  memoryStore.set(key, String(val))
}

export function clearBackupStorage() {
  memoryStore.clear()
  try {
    if (typeof localStorage !== 'undefined' && localStorage.clear) {
      localStorage.clear()
    }
  } catch {
    /* ignore */
  }
}

export async function blobToDataUrl(blob) {
  if (!blob) return null
  if (typeof blob === 'string') return blob
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function dataUrlToBlob(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl
  try {
    const [header, base64] = dataUrl.split(',')
    const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream'
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: mime })
  } catch (err) {
    console.warn('Failed to convert dataUrl to Blob:', err)
    return dataUrl
  }
}

/**
 * Checks if a parsed object or string represents a Litera Library Backup bundle.
 */
export function isLibraryBackupContent(content) {
  if (!content) return false
  const obj = typeof content === 'string' ? safeJsonParse(content) : content
  if (!obj || typeof obj !== 'object') return false
  if (obj.type === 'litera-library-backup' && Array.isArray(obj.books)) return true
  if (Array.isArray(obj.books) && obj.books.length > 0 && obj.books[0]?.title && obj.books[0]?.author) return true
  return false
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/**
 * Checks if a file name or file object matches a Litera library backup file.
 */
export function isLibraryBackupFileName(fileName = '') {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.litera') || lower.endsWith('.litera.json') || (lower.endsWith('.json') && lower.includes('litera'))
}

/**
 * Export full library bundle with all books, progress, notes and reading preferences.
 */
export async function exportLibraryBundle(books = [], extraData = {}) {
  const serializedBooks = await Promise.all(
    books.map(async (book) => {
      const copy = { ...book }
      if (Array.isArray(copy.pages) && copy.pages.length > 0 && typeof copy.pages[0] === 'object') {
        copy.pages = await Promise.all(copy.pages.map((p) => blobToDataUrl(p)))
        copy._hasVisualBlobs = true
      }
      return copy
    })
  )

  const readingProfile = extraData.readingProfile || safeGetStoredJson('litera-reading-profile-v1')
  const settings = {
    font: getStorageItem('litera-font') || '19',
    theme: getStorageItem('litera-theme') || 'paper',
    pageSeconds: getStorageItem('litera-page-seconds') || '60',
    ...(extraData.settings || {}),
  }

  const bundle = {
    type: 'litera-library-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    device: typeof navigator !== 'undefined' ? (navigator.userAgent?.includes('Mobile') ? 'mobile' : 'desktop') : 'unknown',
    bookCount: books.length,
    books: serializedBooks,
    readingProfile,
    settings,
  }

  return JSON.stringify(bundle, null, 2)
}

function safeGetStoredJson(key) {
  try {
    const val = getStorageItem(key)
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

/**
 * Imports and merges or replaces library bundle into current library.
 * mode: 'merge' (default) | 'replace'
 */
export async function importLibraryBundle(bundleData, currentBooks = [], mode = 'merge') {
  const parsed = typeof bundleData === 'string' ? safeJsonParse(bundleData) : bundleData
  if (!parsed || !Array.isArray(parsed.books)) {
    throw new Error('Файл не содержит корректных данных библиотеки Литеры')
  }

  // Restore any visual Blobs
  const incomingBooks = parsed.books.map((b) => {
    const book = { ...b }
    if (book._hasVisualBlobs && Array.isArray(book.pages)) {
      book.pages = book.pages.map((p) => (typeof p === 'string' && p.startsWith('data:') ? dataUrlToBlob(p) : p))
      delete book._hasVisualBlobs
    }
    return book
  })

  // Restore reading profile and preferences if present
  if (parsed.readingProfile) {
    try {
      setStorageItem('litera-reading-profile-v1', JSON.stringify(parsed.readingProfile))
    } catch {
      /* ignore storage quota */
    }
  }
  if (parsed.settings) {
    if (parsed.settings.font) setStorageItem('litera-font', parsed.settings.font)
    if (parsed.settings.theme) setStorageItem('litera-theme', parsed.settings.theme)
    if (parsed.settings.pageSeconds) setStorageItem('litera-page-seconds', parsed.settings.pageSeconds)
  }

  if (mode === 'replace') {
    return {
      books: incomingBooks,
      addedCount: incomingBooks.length,
      updatedCount: 0,
      totalCount: incomingBooks.length,
    }
  }

  // Merge mode
  let addedCount = 0
  let updatedCount = 0

  const keyFor = (b) => (b.id ? `id:${b.id}` : `title:${(b.title || '').trim().toLowerCase()}|${(b.author || '').trim().toLowerCase()}`)

  const currentMap = new Map()
  currentBooks.forEach((b) => {
    currentMap.set(keyFor(b), b)
    if (b.title && b.author) {
      currentMap.set(`ta:${b.title.trim().toLowerCase()}|${b.author.trim().toLowerCase()}`, b)
    }
  })

  const mergedList = [...currentBooks]

  for (const incoming of incomingBooks) {
    const match = currentMap.get(keyFor(incoming)) ||
      (incoming.title && incoming.author ? currentMap.get(`ta:${incoming.title.trim().toLowerCase()}|${incoming.author.trim().toLowerCase()}`) : null)

    if (match) {
      let changed = false
      const idx = mergedList.indexOf(match)
      const existing = mergedList[idx]

      // Merge progress
      const targetProgress = Math.max(existing.progress || 0, incoming.progress || 0)
      const targetPage = Math.max(existing.currentPage || 0, incoming.currentPage || 0)
      if (targetProgress !== (existing.progress || 0) || targetPage !== (existing.currentPage || 0)) {
        changed = true
      }

      // Merge notes
      const existingNotes = existing.notes || []
      const incomingNotes = incoming.notes || []
      const existingNoteTexts = new Set(existingNotes.map((n) => (n.text || n.content || '').trim()))
      const notesToAdd = incomingNotes.filter((n) => !existingNoteTexts.has((n.text || n.content || '').trim()))

      if (notesToAdd.length > 0) {
        changed = true
      }

      // Merge favorite
      const favorite = Boolean(existing.favorite || incoming.favorite)
      if (favorite !== Boolean(existing.favorite)) changed = true

      // Custom cover
      const coverImage = existing.coverImage || incoming.coverImage
      if (coverImage !== existing.coverImage) changed = true

      if (changed) {
        mergedList[idx] = {
          ...existing,
          progress: targetProgress,
          currentPage: targetPage,
          favorite,
          coverImage,
          notes: [...existingNotes, ...notesToAdd],
        }
        updatedCount++
      }
    } else {
      // New book from backup
      mergedList.unshift(incoming)
      addedCount++
    }
  }

  return {
    books: mergedList,
    addedCount,
    updatedCount,
    totalCount: mergedList.length,
  }
}
