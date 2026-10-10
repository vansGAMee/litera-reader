import { describe, it, expect, beforeEach } from 'vitest'
import { extractFeatures, TOTAL_DIMS } from './features.js'
import { QuoteModel } from './model.js'
import { segmentBookText, isGarbageCandidate, cleanCandidateText, extractQuotesFromBook } from './quoteExtractor.js'

describe('AI Features Module', () => {
  it('extracts exactly 136-dimensional feature vector', () => {
    const vec = extractFeatures('Красота спасет мир.')
    expect(vec.length).toBe(TOTAL_DIMS)
    expect(TOTAL_DIMS).toBe(136)
  })

  it('assigns high wisdom density to philosophical text and low to mechanical actions', () => {
    const quoteVec = extractFeatures('Человек есть тайна, и смысл жизни в познании истины и любви.')
    const actionVec = extractFeatures('Он надел пальто, застегнул пуговицы, взял ключ и открыл дверь.')

    // Индекс 2: wisdomDensity
    expect(quoteVec[2]).toBeGreaterThan(actionVec[2])
    // Индекс 6: actionVerbPenalty
    expect(actionVec[6]).toBeGreaterThan(quoteVec[6])
  })

  it('penalizes direct dialogue replies', () => {
    const dialogueVec = extractFeatures('— Да, конечно, — ответил он и пожал плечами.')
    // Индекс 5: dialoguePenalty
    expect(dialogueVec[5]).toBeGreaterThan(0.5)
  })
})

describe('In-Browser Quote Model', () => {
  let model

  beforeEach(() => {
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.clear === 'function') {
      localStorage.clear()
    }
    model = new QuoteModel()
    model.resetPersonalization()
  })

  it('loads base weights trained on GPU and gives higher score to genuine quotes', () => {
    const quoteScore = model.score('Красота спасет мир и подарит человеку надежду на будущее.')
    const mundaneScore = model.score('Он встал со стула, подошел к буфету и достал тарелку с хлебом.')

    expect(quoteScore.baseScore).toBeGreaterThan(mundaneScore.baseScore)
    expect(quoteScore.percentMatch).toBeGreaterThan(mundaneScore.percentMatch)
  })

  it('adapts and personalizes weights via Online SGD on user feedback', () => {
    const candidate = 'Свобода состоит в умении выбирать свою собственную судьбу.'
    const initialScore = model.score(candidate).percentMatch

    // Пользователь нажимает Лайк
    const result1 = model.learn(candidate, true)
    expect(result1.likeCount).toBe(1)
    expect(model.getAlpha()).toBeGreaterThan(0)

    // После лайка персональный скоринг возрастает
    const updatedScore = model.score(candidate).percentMatch
    expect(updatedScore).toBeGreaterThanOrEqual(initialScore)

    // Тестируем реакцию на "Мимо"
    const badSample = 'Просто обычный фрагмент текста без глубокого смысла.'
    model.learn(badSample, false)
    expect(model.skipCount).toBe(1)
  })

  it('resets personalized profile back to factory baseline', () => {
    model.learn('Великие мысли приходят сами.', true)
    model.learn('Пустые разговоры утомляют.', false)
    expect(model.likeCount + model.skipCount).toBe(2)

    model.resetPersonalization()
    expect(model.likeCount).toBe(0)
    expect(model.skipCount).toBe(0)
    expect(model.getAlpha()).toBe(0)
  })
})

describe('Book Quote Extractor', () => {
  it('correctly filters garbage headers and TOC lines', () => {
    expect(isGarbageCandidate('Глава третья. В которой все начинается.')).toBe(true)
    expect(isGarbageCandidate('Оглавление ............... 12')).toBe(true)
    expect(isGarbageCandidate('Коротко')).toBe(true)
    expect(isGarbageCandidate('Красота спасет мир, если мир захочет спастись.')).toBe(false)
  })

  it('cleans quotes from dashes and excess whitespaces', () => {
    expect(cleanCandidateText('—   Красота спасет мир.  ')).toBe('Красота спасет мир.')
  })

  it('extracts top quotes from multi-paragraph book text', async () => {
    const book = {
      title: 'Братья Карамазовы',
      author: 'Ф. М. Достоевский',
      text: `Глава первая. Введение.
      
      Он надел шляпу и вышел на улицу. Погода была сырая и холодная. Шел мелкий осенний дождь.
      
      Человек есть тайна. Ее надо разгадать, и ежели будешь ее разгадывать всю жизнь, то не говори, что потерял время.
      
      — Да, конечно, — сказал Петр и повернулся к окну.
      
      Сострадание есть главнейший и, может быть, единственный закон бытия всего человечества.`
    }

    const model = new QuoteModel()
    const quotes = await extractQuotesFromBook(book, model, { minScore: 0.3 })

    expect(quotes.length).toBeGreaterThan(0)
    // Верхняя цитата должна содержать глубокую мысль
    const topText = quotes[0].text
    expect(topText.includes('тайна') || topText.includes('Сострадание')).toBe(true)
  })
})
