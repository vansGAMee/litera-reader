import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

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
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const metadata = await pdf.getMetadata().catch(() => ({ info: {} }))
  const pages = []
  for (let number = 1; number <= pdf.numPages; number++) pages.push(await pageText(await pdf.getPage(number)))
  const text = pages.join('\n\n').trim()
  return {
    text: text.length > 40 ? text : '',
    title: metadata.info?.Title || '', author: metadata.info?.Author || '', pageCount: pdf.numPages,
  }
}

export async function openPdf(file) {
  return getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
}
