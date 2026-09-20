const asPdfFile = (blob, title) => blob instanceof File
  ? blob
  : new File([blob], `${title}.pdf`, { type: 'application/pdf' })

export async function migrateStoredBooks(saved, importer, makeFile = asPdfFile, inspectPdf = async () => 0) {
  let failures = 0
  const books = await Promise.all(saved.map(async (book) => {
    if (book.kind !== 'pdf' || !book.blob) return book
    const { blob, ...preserved } = book
    let file = blob
    try {
      file = makeFile(blob, book.title)
      const fresh = await importer(file)
      return { ...preserved, ...fresh, id: book.id, progress: book.progress, notes: book.notes }
    } catch {
      failures++
      const detectedPages = await inspectPdf(file).catch(() => 0)
      return { ...preserved, kind: 'visual', sourceFormat: 'PDF', pages: [blob], pageCount: detectedPages || book.pageCount || 1, migrationError: true }
    }
  }))
  return { books, failures }
}
