// Интеллектуальный экстрактор цитат с глубоким семантическим анализом и контекстом всей книги

import { globalDeepModel, extractDeepFeatures } from './deepModel.js'

const TECHNICAL_HEADERS = /^(?:глава|часть|книга|том|действие|явление|акт|эпилог|пролог|от автора|примечани|введение|оглавлени|предислови|послеслови|chapter|part|book|volume|act|scene)(?:[\s.:\d]|$)/i
const TECHNICAL_METADATA = /(?:isbn|удк|ббк|типографи|издательств|переводчик|редактор|все права|отпечатано|тираж|художник|формат|подписано в печать)/i

// Очистка цитаты от диалоговых тегов (например, "— сказал он", "— тихо ответил арестант")
export function cleanCandidateText(raw = '') {
  let text = String(raw)
    .replace(/^[\s—–\-*•·«"]+/g, '')
    .replace(/[\s—–\-»"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Удаляем вводные слова диалога в начале, если они не несут смысла
  text = text.replace(/^(?:—\s*)?(?:но,\s*позвольте вас спросить|позвольте спросить|скажи мне|послушай|понимаешь ли ты|знаешь ли|видите ли),\s*/i, '')
  // Удаляем авторские ремарки в середине или конце цитаты ("— говорил Иван с нервным жаром", "— наставлял Воланд")
  text = text.replace(/\s*[—–-]\s*(?:говорил|ответил|сказал|наставлял|рассуждал|воскликнул|отозвался|заметил|подумал|вскричал)\s+[а-яёa-z\s]+?(?:,\s*—|\.|$)/gi, ' ')
  // Удаляем финальные висячие тире
  text = text.replace(/[\s—–\-]+$/g, '').trim()

  // Если первая буква стала строчной, делаем заглавной
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1)
  }
  return text
}

export function isGarbageCandidate(text) {
  if (!text || text.length < 32 || text.length > 380) return true
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 5) return true

  // Отсекаем заголовки глав и технические пометки
  if (TECHNICAL_HEADERS.test(text)) return true
  if (TECHNICAL_METADATA.test(text)) return true

  // Отсекаем строки, где мало букв (например формулы, оглавления из точек)
  const letters = text.replace(/[^a-zа-яё]/gi, '')
  if (letters.length < text.length * 0.55) return true
  if (/\.{4,}/.test(text)) return true

  return false
}

// Построение среднего семантического фона книги (Global Book Context)
export function computeBookContextVector(candidates = []) {
  const sampleSize = Math.min(60, candidates.length)
  const centroid = new Float32Array(64)
  if (sampleSize === 0) return centroid

  const step = Math.max(1, Math.floor(candidates.length / sampleSize))
  let count = 0
  for (let i = 0; i < candidates.length && count < sampleSize; i += step) {
    const feat = extractDeepFeatures(candidates[i].text)
    for (let d = 0; d < 64; d++) centroid[d] += feat[d]
    count++
  }

  if (count > 0) {
    for (let d = 0; d < 64; d++) centroid[d] /= count
  }
  return centroid
}

// Косинусное сходство между векторами
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Разбиение текста книги на смысловые фрагменты
export function segmentBookText(fullText = '') {
  const paragraphs = fullText.split(/\n{2,}/)
  const candidates = []
  let globalOffset = 0

  for (const para of paragraphs) {
    const pTrim = para.trim()
    const pOffset = fullText.indexOf(pTrim, globalOffset)
    if (pOffset !== -1) globalOffset = pOffset + pTrim.length

    if (!pTrim || pTrim.length < 30) continue

    // Разбиение параграфа на предложения
    const rawSentences = pTrim.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [pTrim]
    const sentences = rawSentences.map(s => s.trim()).filter(Boolean)

    for (let i = 0; i < sentences.length; i++) {
      const s1 = cleanCandidateText(sentences[i])
      if (!isGarbageCandidate(s1)) {
        candidates.push({ text: s1, offset: pOffset })
      }

      // Кандидат из двух связных предложений (тезис + развитие мысли)
      if (i < sentences.length - 1) {
        const s2 = cleanCandidateText(`${sentences[i]} ${sentences[i + 1]}`)
        if (!isGarbageCandidate(s2) && s2.length <= 320) {
          candidates.push({ text: s2, offset: pOffset })
        }
      }
    }
  }

  // Дедупликация
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
 * Асинхронное извлечение и глубокое ранжирование цитат
 * с анализом всего контекста книги (Global Book Context)
 */
export async function extractQuotesFromBook(book, model = globalDeepModel, options = {}) {
  const text = book?.text || ''
  if (!text || text.trim().length < 50) return []

  const {
    minScore = 0.45,
    limit = 60,
    onProgress = null
  } = options

  const candidates = segmentBookText(text)
  const total = candidates.length
  if (total === 0) return []

  // 1. «Видит всю книгу»: вычисляем глобальный контекстный фон книги
  const bookContext = computeBookContextVector(candidates)

  const scored = []
  const batchSize = 120

  for (let i = 0; i < total; i++) {
    const item = candidates[i]
    // Прямой проход глубокой нейросети
    const result = model.forward(item.text)

    // Контраст со средним фоном книги (смысловой пик)
    const backgroundSim = cosineSimilarity(result.features, bookContext)
    // Чем сильнее мысль контрастирует с бытовым фоном (0..1), тем ярче смысловой пик
    const peakContrast = Math.max(0, 1.0 - backgroundSim * 0.8)

    // Итоговый семантический балл
    const combinedScore = (result.quoteProb * 0.65) + (peakContrast * 0.20) + (result.depthScore * 0.15)
    const percentMatch = Math.round(Math.min(99, Math.max(1, combinedScore * 100)))

    // Приблизительная страница в книге
    const totalPages = book.pages?.length || Math.max(1, Math.ceil(text.length / 1550))
    const ratio = text.length > 0 ? (item.offset / text.length) : 0
    const estimatedPage = Math.max(1, Math.min(totalPages, Math.round(ratio * totalPages) + 1))

    if (combinedScore >= minScore) {
      scored.push({
        id: `q-${i}-${Date.now().toString(36)}`,
        text: item.text,
        page: estimatedPage,
        offset: item.offset,
        combinedScore,
        percentMatch,
        meaningCategory: result.meaningCategory,
        depthScore: Math.round(result.depthScore * 100),
        bookTitle: book.title || 'Книга',
        bookAuthor: book.author || 'Автор'
      })
    }

    if (i % batchSize === 0) {
      if (onProgress) onProgress(Math.round((i / total) * 100))
      await new Promise(r => setTimeout(r, 0))
    }
  }

  if (onProgress) onProgress(100)

  // Сортировка по итоговой оценке глубокой модели
  scored.sort((a, b) => b.combinedScore - a.combinedScore)
  return scored.slice(0, limit)
}
