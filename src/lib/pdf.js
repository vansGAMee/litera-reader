import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { pdfBookTitle } from './readingExtras.js'
import { needsVisualPdf } from './reader.js'

GlobalWorkerOptions.workerSrc = workerUrl

const pageText = async (page) => {
  const { items } = await page.getTextContent()
  let text = ''
  for (const item of items) {
    if (!item.str) continue
    text += `${item.str}${item.hasEOL ? '\n\n' : ' '}`
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim()
}

export async function extractPdf(file) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
  const pdf = await task.promise
  const metadata = await pdf.getMetadata().catch(() => ({ info: {} }))
  const pages = []
  for (let number = 1; number <= pdf.numPages; number++) pages.push(await pageText(await pdf.getPage(number)))
  const text = pages.join('\n\n').trim()
  return {
    text: !needsVisualPdf(pages) && text.length > 40 ? text : '',
    title: pdfBookTitle(metadata.info?.Title, file.name), author: metadata.info?.Author || '', pageCount: pdf.numPages,
  }
  } finally { await task.destroy() }
}

export async function openPdf(file) {
  return getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}
