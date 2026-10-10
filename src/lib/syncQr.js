/**
 * Serverless Library Progress Sync via QR Code.
 * Compact encoding, validation and smart merging for books progress.
 */

export function normalizeKey(title = '', author = '') {
  return `${title}::${author}`
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function encodeSyncPayload(books = []) {
  const syncItems = books
    .map((book) => {
      const p = Math.max(0, Math.min(100, Math.round(Number(book.progress) || 0)))
      const c = typeof book.currentPage === 'number' && Number.isFinite(book.currentPage) ? Math.max(0, book.currentPage) : undefined
      const fav = book.favorite ? 1 : 0
      return {
        id: String(book.id || ''),
        t: String(book.title || '').slice(0, 100),
        a: String(book.author || '').slice(0, 80),
        p,
        ...(c !== undefined ? { c } : {}),
        ...(fav ? { f: 1 } : {}),
      }
    })
    .filter((b) => b.id && (b.p > 0 || b.f || (b.c !== undefined && b.c > 0)))

  const payload = {
    app: 'litera',
    v: 1,
    ts: Date.now(),
    b: syncItems,
  }

  return JSON.stringify(payload)
}

export function decodeSyncPayload(rawString = '') {
  if (typeof rawString !== 'string') return null
  const trimmed = rawString.trim()
  if (!trimmed) return null

  let data
  try {
    data = JSON.parse(trimmed)
  } catch {
    // Check if wrapped in prefix or URI encoding
    try {
      const clean = decodeURIComponent(trimmed.replace(/^litera[:_]/i, ''))
      data = JSON.parse(clean)
    } catch {
      return null
    }
  }

  if (!data || (data.app !== 'litera' && !Array.isArray(data.b))) return null
  if (!Array.isArray(data.b)) return null

  const items = data.b
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const id = String(item.id || '')
      const p = Math.max(0, Math.min(100, Math.round(Number(item.p) || 0)))
      const c = typeof item.c === 'number' && Number.isFinite(item.c) ? Math.max(0, Math.round(item.c)) : undefined
      const f = Boolean(item.f)
      const t = String(item.t || '')
      const a = String(item.a || '')
      if (!id && !t) return null
      return { id, p, c, f, t, a }
    })
    .filter(Boolean)

  return {
    version: data.v || 1,
    timestamp: data.ts || Date.now(),
    items,
  }
}

export function mergeLibraryProgress(currentBooks = [], syncPayload) {
  if (!syncPayload || !Array.isArray(syncPayload.items)) {
    return { updatedBooks: currentBooks, changedCount: 0, updatedTitles: [] }
  }

  const syncMapById = new Map()
  const syncMapByTitleAuthor = new Map()

  for (const item of syncPayload.items) {
    if (item.id) syncMapById.set(item.id, item)
    if (item.t) {
      const key = normalizeKey(item.t, item.a)
      syncMapByTitleAuthor.set(key, item)
    }
  }

  let changedCount = 0
  const updatedTitles = []

  const updatedBooks = currentBooks.map((book) => {
    const key = normalizeKey(book.title, book.author)
    const match = syncMapById.get(book.id) || syncMapByTitleAuthor.get(key)
    if (!match) return book

    let changed = false
    const patch = {}

    // Only update progress or page if incoming data provides valid changes
    if (typeof match.p === 'number' && match.p !== book.progress) {
      patch.progress = match.p
      changed = true
    }

    if (match.c !== undefined && match.c !== book.currentPage) {
      patch.currentPage = match.c
      changed = true
    }

    if (match.f && !book.favorite) {
      patch.favorite = true
      changed = true
    }

    if (changed) {
      changedCount++
      updatedTitles.push(book.title || 'Книга')
      return { ...book, ...patch }
    }

    return book
  })

  return {
    updatedBooks,
    changedCount,
    updatedTitles,
  }
}
