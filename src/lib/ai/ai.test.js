import { describe, it, expect, beforeEach } from 'vitest'
import { extractFeatures, TOTAL_DIMS } from './features.js'
import { QuoteModel } from './model.js'
import { DeepQuoteModel, extractDeepFeatures } from './deepModel.js'
import { segmentBookText, isGarbageCandidate, cleanCandidateText, extractQuotesFromBook, computeBookContextVector } from './quoteExtractor.js'

describe('AI Features & Deep Features', () => {
  it('extracts exactly 136-dimensional feature vector for base model', () => {
    const vec = extractFeatures('Красота спасет мир.')
    expect(vec.length).toBe(TOTAL_DIMS)
  })

  it('extracts exactly 64-dimensional feature vector for deep model LSQ-Net', () => {
    const vec = extractDeepFeatures('Человек есть тайна. Ее надо разгадать.')
    expect(vec.length).toBe(64)
  })

  it('assigns high wisdom density to philosophical text and low to mechanical actions', () => {
    const quoteVec = extractFeatures('Человек есть тайна, и смысл жизни в познании истины и любви.')
    const actionVec = extractFeatures('Он надел пальто, застегнул пуговицы, взял ключ и открыл дверь.')
    expect(quoteVec[2]).toBeGreaterThan(actionVec[2])
    expect(actionVec[6]).toBeGreaterThan(quoteVec[6])
  })
})

describe('Deep Neural Model (LSQ-Net / RTX 4060)', () => {
  let deepModel

  beforeEach(() => {
    deepModel = new DeepQuoteModel()
    deepModel.resetPersonalization()
  })

  it('correctly scores profound quote significantly higher than mundane plot action', () => {
    const quoteRes = deepModel.forward('Человек есть тайна. Ее надо разгадать, и ежели будешь ее разгадывать всю жизнь, то не говори, что потерял время.')
    const mundaneRes = deepModel.forward('Он надел пальто, застегнул пуговицы, взял ключ и вышел на улицу.')

    expect(quoteRes.quoteProb).toBeGreaterThan(mundaneRes.quoteProb)
    expect(quoteRes.depthScore).toBeGreaterThan(mundaneRes.depthScore)
  })

  it('identifies semantic meaning category for ethical and existential quotes', () => {
    const ethical = deepModel.forward('Ведь вся познанная истина не стоит тогда слезинки одного этого замученного ребенка.')
    expect(ethical.meaningCategory).toContain('Этика')

    const existential = deepModel.forward('Да, человек смертен, но это было бы еще полбеды. Плохо то, что он иногда внезапно смертен!')
    expect(existential.meaningCategory).toContain('Экзистенциальн')
  })

  it('adapts personal concept multipliers on user feedback', () => {
    const sample = 'Красота — это страшная и ужасная вещь! Тут дьявол с богом борется, а поле битвы — сердца людей.'
    const prevMult = deepModel.personalConceptMultipliers[4]

    deepModel.learn(sample, true)
    expect(deepModel.likeCount).toBe(1)
    expect(deepModel.personalConceptMultipliers[4]).toBeGreaterThan(prevMult)
  })
})

describe('Book Quote Extractor with Global Book Context', () => {
  it('correctly filters garbage headers and TOC lines', () => {
    expect(isGarbageCandidate('Глава третья. В которой все начинается.')).toBe(true)
    expect(isGarbageCandidate('Оглавление ............... 12')).toBe(true)
    expect(isGarbageCandidate('Коротко')).toBe(true)
    expect(isGarbageCandidate('Красота спасет мир, если мир захочет спастись.')).toBe(false)
  })

  it('cleans quotes from dialogue speaker tags and leading dashes', () => {
    const raw = '— Я не бога не принимаю, — говорил Иван с нервным жаром, — я мира божьего не принимаю.'
    const cleaned = cleanCandidateText(raw)
    expect(cleaned).not.toContain('говорил Иван')
    expect(cleaned.startsWith('—')).toBe(false)
  })

  it('computes book context vector across candidate passages', () => {
    const candidates = [
      { text: 'Он пошел в сад и сел на скамью.' },
      { text: 'Погода была сырая и холодная.' },
      { text: 'Красота спасет мир.' }
    ]
    const ctx = computeBookContextVector(candidates)
    expect(ctx.length).toBe(64)
  })

  it('extracts top quotes with semantic meaning and page locations from book', async () => {
    const book = {
      title: 'Мастер и Маргарита',
      author: 'Михаил Булгаков',
      text: `Глава первая. Никогда не разговаривайте с неизвестными
      
      Однажды весною, в час необыкновенно жаркого заката, в Москве появились два гражданина.
      Они выпили теплой абрикосовой воды, давшей обильную желтую пену.
      
      — Да, человек смертен, но это было бы еще полбеды. Плохо то, что он иногда внезапно смертен, вот в чем фокус!
      
      — Злых людей нет на свете, есть только люди несчастливые.
      
      — Никогда и ничего не просите! Никогда и ничего, и в особенности у тех, кто сильнее вас. Сами предложат и сами всё дадут!`
    }

    const deepModel = new DeepQuoteModel()
    const quotes = await extractQuotesFromBook(book, deepModel, { minScore: 0.35 })

    expect(quotes.length).toBeGreaterThan(0)
    // Каждая цитата должна иметь категорию смысла
    expect(quotes[0].meaningCategory).toBeDefined()
    expect(typeof quotes[0].meaningCategory).toBe('string')
    // Текст должен содержать глубокую мысль
    const combined = quotes.map(q => q.text).join(' ')
    expect(combined.includes('смертен') || combined.includes('Злых людей') || combined.includes('Никогда и ничего')).toBe(true)
  })
})
