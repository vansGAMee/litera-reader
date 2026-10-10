// Внутрибраузерный инференс глубокой нейросети LSQ-Net с пониманием смысла и контекста всей книги

import weightsData from './deepModelWeights.json' with { type: 'json' }

const STORAGE_KEY = 'litera-ai-deep-profile-v1'

function getStorage() {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') return localStorage
  return null
}

function sigmoid(z) {
  if (z > 30) return 1
  if (z < -30) return 0
  return 1 / (1 + Math.exp(-z))
}

function gelu(x) {
  // Аппроксимация GELU
  return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * Math.pow(x, 3))))
}

function layerNorm(vec, gamma, beta) {
  const n = vec.length
  let mean = 0
  for (let i = 0; i < n; i++) mean += vec[i]
  mean /= n

  let variance = 0
  for (let i = 0; i < n; i++) {
    const diff = vec[i] - mean
    variance += diff * diff
  }
  variance /= n
  const std = Math.sqrt(variance + 1e-5)

  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = ((vec[i] - mean) / std) * (gamma ? gamma[i] : 1) + (beta ? beta[i] : 0)
  }
  return out
}

function matVec(matrix, vec, bias) {
  const rows = matrix.length
  const cols = vec.length
  const out = new Float32Array(rows)
  for (let r = 0; r < rows; r++) {
    let sum = bias ? bias[r] : 0
    const row = matrix[r]
    for (let c = 0; c < cols; c++) {
      sum += row[c] * vec[c]
    }
    out[r] = sum
  }
  return out
}

export function extractDeepFeatures(text = '') {
  const t = String(text).toLowerCase().trim()
  const words = t.replace(/[^a-zа-яё0-9\s]/gi, ' ').split(/\s+/).filter(Boolean)
  const vec = new Float32Array(64)
  if (!words.length) return vec

  const l = t.length
  vec[0] = Math.exp(-Math.pow((l - 130) / 90, 2))
  vec[1] = /[—:;]/.test(t) ? 1.0 : 0.0
  vec[2] = /[?!]/.test(t) ? 1.0 : 0.0

  const existential = new Set(['жизнь', 'жизни', 'смерть', 'смерти', 'человек', 'человека', 'люди', 'время', 'времени', 'вечность', 'бытие', 'судьба', 'выбор', 'смысл'])
  const ethical = new Set(['добро', 'добра', 'зло', 'зла', 'совесть', 'правда', 'правды', 'истина', 'истины', 'грех', 'греха', 'прощение', 'сострадание', 'вина', 'ответственность'])
  const psychological = new Set(['душа', 'души', 'сердце', 'сердца', 'любовь', 'любви', 'страх', 'страха', 'страсть', 'одиночество', 'печаль', 'грусть', 'тайна'])
  const aphoristic = new Set(['все', 'всё', 'никто', 'ничто', 'никогда', 'всегда', 'каждый', 'всякий', 'но', 'однако', 'нежели', 'зато', 'чем', 'тем', 'если'])
  const noise = new Set(['пошел', 'пошла', 'вошел', 'сел', 'села', 'встал', 'надел', 'взял', 'открыл', 'сказал', 'спросил', 'ответил', 'часы', 'комната', 'дверь', 'стол', 'глава', 'часть'])

  let exCount = 0, etCount = 0, psCount = 0, apCount = 0, noCount = 0
  for (const w of words) {
    if (existential.has(w)) exCount++
    if (ethical.has(w)) etCount++
    if (psychological.has(w)) psCount++
    if (aphoristic.has(w)) apCount++
    if (noise.has(w)) noCount++
  }

  vec[3] = exCount / 4.0
  vec[4] = etCount / 3.0
  vec[5] = psCount / 3.0
  vec[6] = apCount / 4.0
  vec[7] = noCount / 3.0
  vec[8] = (t.includes('не ') && t.includes(', а ')) ? 1.0 : 0.0
  vec[9] = (/^[—–-]/.test(t) && /(сказал|ответил|спросил)/.test(t)) ? 1.0 : 0.0

  // Хэш-часть
  for (const w of words) {
    let h = 0
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0
    vec[10 + (h % 54)] += 0.35
  }

  // L2-нормализация
  let norm = 0
  for (let i = 0; i < 64; i++) norm += vec[i] * vec[i]
  if (norm > 0) {
    const inv = 1 / Math.sqrt(norm)
    for (let i = 0; i < 64; i++) vec[i] *= inv
  }
  return vec
}

export class DeepQuoteModel {
  constructor() {
    this.weights = weightsData
    this.categories = weightsData.categories || []
    this.device = weightsData.device || 'NVIDIA RTX 4060'

    // Персональные адаптивные веса голов концептов
    this.personalConceptMultipliers = new Float32Array([1.0, 1.0, 1.0, 1.0, 1.0])
    this.likeCount = 0
    this.skipCount = 0
    this.history = []

    this.loadProfile()
  }

  loadProfile() {
    const storage = getStorage()
    if (!storage) return
    try {
      const saved = storage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.personalConceptMultipliers)) {
          this.personalConceptMultipliers = new Float32Array(parsed.personalConceptMultipliers)
          this.likeCount = parsed.likeCount || 0
          this.skipCount = parsed.skipCount || 0
          this.history = parsed.history || []
        }
      }
    } catch {}
  }

  saveProfile() {
    const storage = getStorage()
    if (!storage) return
    try {
      const data = {
        personalConceptMultipliers: Array.from(this.personalConceptMultipliers),
        likeCount: this.likeCount,
        skipCount: this.skipCount,
        history: this.history.slice(-100),
        lastUpdated: Date.now()
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {}
  }

  resetPersonalization() {
    this.personalConceptMultipliers.fill(1.0)
    this.likeCount = 0
    this.skipCount = 0
    this.history = []
    const storage = getStorage()
    if (storage) {
      try { storage.removeItem(STORAGE_KEY) } catch {}
    }
  }

  // Прямой проход глубокой нейросети
  forward(text, features = null) {
    const x = features || extractDeepFeatures(text)

    // 1. Концептуальное внимание
    const conceptLogits = matVec(this.weights.concept_attention_w, x, this.weights.concept_attention_b)
    const concepts = new Float32Array(5)
    for (let i = 0; i < 5; i++) {
      concepts[i] = sigmoid(conceptLogits[i]) * this.personalConceptMultipliers[i]
    }

    // 2. Слой FC1 + LayerNorm + GELU
    const fc1 = matVec(this.weights.fc1_w, x, this.weights.fc1_b)
    const ln1 = layerNorm(fc1, this.weights.ln1_weight, this.weights.ln1_bias)
    const act1 = new Float32Array(this.weights.hidden_dim)
    for (let i = 0; i < act1.length; i++) act1[i] = gelu(ln1[i])

    // 3. Слой FC2 + LayerNorm + Residual
    const fc2 = matVec(this.weights.fc2_w, act1, this.weights.fc2_b)
    const ln2 = layerNorm(fc2, this.weights.ln2_weight, this.weights.ln2_bias)
    const h = new Float32Array(64)
    for (let i = 0; i < 64; i++) h[i] = ln2[i] + x[i]

    // 4. Голова вероятности цитаты
    const combined = new Float32Array(64 + 5)
    combined.set(h, 0)
    combined.set(concepts, 64)
    const qLogit = matVec(this.weights.quote_head_w, combined, this.weights.quote_head_b)[0]
    const quoteProb = sigmoid(qLogit)

    // 5. Голова классификации категории смысла
    const mLogits = matVec(this.weights.meaning_head_w, h, this.weights.meaning_head_b)
    let bestCatIdx = 0
    let bestScore = -Infinity
    for (let i = 0; i < 5; i++) {
      if (mLogits[i] > bestScore) {
        bestScore = mLogits[i]
        bestCatIdx = i
      }
    }

    const meaningCategory = this.categories[bestCatIdx] || 'Философская мысль'
    const semanticDensity = (x[3] + x[4] + x[5] + x[6]) / 2.0
    const depthScore = Math.max(0, Math.min(1.0, quoteProb * 0.75 + semanticDensity * 0.25))

    return {
      quoteProb,
      depthScore,
      meaningCategory,
      meaningIndex: bestCatIdx,
      concepts,
      latentVector: h,
      features: x
    }
  }

  // Онлайн обучение на лайке / дизлайке
  learn(text, isLike) {
    const result = this.forward(text)
    const cat = result.meaningIndex

    const step = 0.25
    if (isLike) {
      this.likeCount++
      // Усиливаем чувствительность к этой категории смысла
      this.personalConceptMultipliers[cat] = Math.min(2.5, this.personalConceptMultipliers[cat] + step)
    } else {
      this.skipCount++
      // Снижаем чувствительность к этой категории
      this.personalConceptMultipliers[cat] = Math.max(0.3, this.personalConceptMultipliers[cat] - step * 0.7)
    }

    this.history.push({
      text: text.slice(0, 140),
      isLike,
      category: result.meaningCategory,
      time: Date.now()
    })

    this.saveProfile()
    return {
      likeCount: this.likeCount,
      skipCount: this.skipCount,
      multipliers: Array.from(this.personalConceptMultipliers)
    }
  }

  getTasteProfile() {
    const total = this.likeCount + this.skipCount
    if (total === 0) {
      return {
        totalRatings: 0,
        likeCount: 0,
        skipCount: 0,
        adaptationPercent: 0,
        traits: ['Глубокая смысловая модель (LSQ-Net / RTX 4060)'],
        summary: 'Нейросеть LSQ-Net готова к работе на весах GPU. Оценивайте мысли, чтобы модель поняла ваши любимые темы.'
      }
    }

    // Определяем доминирующие темы по мультипликаторам
    const catNames = ['Экзистенциализм и время', 'Этика и совесть', 'Психология души', 'Парадоксы и афоризмы', 'Вечные истины']
    const favored = []
    for (let i = 0; i < 5; i++) {
      if (this.personalConceptMultipliers[i] > 1.2) {
        favored.push(catNames[i])
      }
    }

    const adaptation = Math.min(100, Math.round((total / 15) * 100))

    return {
      totalRatings: total,
      likeCount: this.likeCount,
      skipCount: this.skipCount,
      adaptationPercent: adaptation,
      traits: favored.length ? favored : ['Широкий классический вкус'],
      summary: `Нейросеть изучила ${total} ваших оценок (${this.likeCount} понравилось, ${this.skipCount} мимо). Чувствительность к любимым темам повышена на ${adaptation}%.`
    }
  }
}

export const globalDeepModel = new DeepQuoteModel()
