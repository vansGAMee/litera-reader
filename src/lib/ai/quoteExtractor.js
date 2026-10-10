// Модуль вычленения, очистки и ранжирования цитат из текста книг любого формата

import { globalQuoteModel } from './model.js'

const TECHNICAL_HEADERS = /^(?:глава|часть|книга|том|действие|явление|акт|эпилог|пролог|от автора|примечани|введение|оглавлени|предислови|послеслови|chapter|part|book|volume|act|scene)(?:[\s.:\d]|$)/i
const TECHNICAL_METADATA = /(?:isbn|удк|ббк|типографи|издательств|переводчик|редактор|все права|отпечатано|тираж|художник|формат|подписано в печать)/i

export function cleanCandidateText(raw = '') {
  return String(raw)
    .replace(/^[\s—–\-*•·]+/g, '')
    .replace(/[\s—–\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isGarbageCandidate(text) {
  if (!text || text.length < 32 || text.length > 380) return true
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 5) return true

  // Отсекаем заголовки глав и технические пометки
  if (TECHNICAL_HEADERS.test(text)) return true
  if (TECHNICAL_METADATA.test(text)) return true

  // Отсекаем чисто численные/символьные строки
  const letters = text.replace(/[^a-zа-яё]/gi, '')
  if (letters.length < text.length * 0.6) return true

  // Отсекаем чистое оглавление со строками точек
  if (/\.{4,}/.test(text)) return true

  return false
}

// Умное разбиение текста на предложения и связные микрофрагменты (1-2 предложения)
export function segmentBookText(fullText = '') {
  const paragraphs = fullText.split(/\n{2,}/)
  const candidates = []
  let globalOffset = 0

  for (const para of paragraphs) {
    const pTrim = para.trim()
    const pOffset = fullText.indexOf(pTrim, globalOffset)
    if (pOffset !== -1) globalOffset = pOffset + pTrim.length

    if (!pTrim || pTrim.length < 30) continue

    // Разбиение параграфа на предложения с сохранением знаков препинания
    const rawSentences = pTrim.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [pTrim]
    const sentences = rawSentences.map(s => s.trim()).filter(Boolean)

    for (let i = 0; i < sentences.length; i++) {
      const s1 = cleanCandidateText(sentences[i])
      if (!isGarbageCandidate(s1)) {
        candidates.push({
          text: s1,
          offset: pOffset
        })
      }

      // Кандидат из двух связных предложений (тезис + раскрытие мысли)
      if (i < sentences.length - 1) {
        const s2 = cleanCandidateText(`${sentences[i]} ${sentences[i + 1]}`)
        if (!isGarbageCandidate(s2) && s2.length <= 320) {
          candidates.push({
            text: s2,
            offset: pOffset
          })
        }
      }
    }
  }

  // Дедупликация идентичных фрагментов
  const seen = new Set()
  const unique = []
  for (const item of candidates) {
    const key = item.text.toLowerCase().replace(/[^a-zа-яё]/g, '')
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }

  return unique
}

/**
 * Асинхронное извлечение и ранжирование цитат из книги с поддержкой UI chunking
 */
export async function extractQuotesFromBook(book, model = globalQuoteModel, options = {}) {
  const text = book?.text || ''
  if (!text || text.trim().length < 50) {
    return []
  }

  const {
    minScore = 0.35,
    limit = 60,
    onProgress = null
  } = options

  const candidates = segmentBookText(text)
  const total = candidates.length
  if (total === 0) return []

  const scored = []
  const batchSize = 150

  for (let i = 0; i < total; i++) {
    const item = candidates[i]
    const prediction = model.score(item.text)

    // Приблизительная оценка страницы в книге
    const totalPages = book.pages?.length || Math.max(1, Math.ceil(text.length / 1550))
    const ratio = text.length > 0 ? (item.offset / text.length) : 0
    const estimatedPage = Math.max(1, Math.min(totalPages, Math.round(ratio * totalPages) + 1))

    if (prediction.combinedScore >= minScore) {
      scored.push({
        id: `q-${i}-${Date.now().toString(36)}`,
        text: item.text,
        page: estimatedPage,
        offset: item.offset,
        baseScore: prediction.baseScore,
        personalScore: prediction.personalScore,
        combinedScore: prediction.combinedScore,
        percentMatch: prediction.percentMatch,
        bookTitle: book.title || 'Книга',
        bookAuthor: book.author || 'Автор'
      })
    }

    // Даем браузеру отрисовать кадр каждые 150 кандидатов
    if (i % batchSize === 0) {
      if (onProgress) onProgress(Math.round((i / total) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
  }

  if (onProgress) onProgress(100)

  // Сортировка по итоговой оценке ИИ от лучшей к меньшей
  scored.sort((a, b) => b.combinedScore - a.combinedScore)

  return scored.slice(0, limit)
}
