// Внутрибраузерный движок инференса и онлайн-дообучения (Online SGD)

import baseData from './baseModelWeights.json'
import { extractFeatures, TOTAL_DIMS } from './features.js'

const STORAGE_KEY = 'litera-ai-personal-profile-v1'

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

export class QuoteModel {
  constructor() {
    this.dims = baseData.dims || TOTAL_DIMS
    this.baseWeights = new Float32Array(baseData.weights)
    this.baseBias = baseData.bias || 0
    this.deviceTrainedOn = baseData.device_trained_on || 'NVIDIA RTX 4060'

    // Персональные веса пользователя (дельта от базовых)
    this.userWeights = new Float32Array(this.dims)
    this.likeCount = 0
    this.skipCount = 0
    this.history = []
    this.positiveCentroid = new Float32Array(this.dims)
    this.negativeCentroid = new Float32Array(this.dims)

    this.loadProfile()
  }

  loadProfile() {
    const storage = getStorage()
    if (!storage) return
    try {
      const saved = storage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.userWeights) && parsed.userWeights.length === this.dims) {
          this.userWeights = new Float32Array(parsed.userWeights)
          this.likeCount = parsed.likeCount || 0
          this.skipCount = parsed.skipCount || 0
          this.history = parsed.history || []
          if (Array.isArray(parsed.positiveCentroid)) {
            this.positiveCentroid = new Float32Array(parsed.positiveCentroid)
          }
          if (Array.isArray(parsed.negativeCentroid)) {
            this.negativeCentroid = new Float32Array(parsed.negativeCentroid)
          }
        }
      }
    } catch {
      // Игнорируем ошибки чтения хранилища
    }
  }

  saveProfile() {
    const storage = getStorage()
    if (!storage) return
    try {
      const data = {
        userWeights: Array.from(this.userWeights),
        likeCount: this.likeCount,
        skipCount: this.skipCount,
        history: this.history.slice(-100),
        positiveCentroid: Array.from(this.positiveCentroid),
        negativeCentroid: Array.from(this.negativeCentroid),
        lastUpdated: Date.now()
      }
      storage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // В случае переполнения хранилища
    }
  }

  resetPersonalization() {
    this.userWeights.fill(0)
    this.likeCount = 0
    this.skipCount = 0
    this.history = []
    this.positiveCentroid.fill(0)
    this.negativeCentroid.fill(0)
    const storage = getStorage()
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY)
      } catch {}
    }
  }

  // Расчет персонального коэффициента влияния (alpha)
  getAlpha() {
    const total = this.likeCount + this.skipCount
    if (total <= 0) return 0.0
    // Плавно растет с 0 до 0.70 при накоплении 20 оценок
    return Math.min(0.70, (total / 20) * 0.70)
  }

  // Скоринг текста цитаты
  score(text, features = null) {
    const feat = features || extractFeatures(text)
    let baseLogit = this.baseBias
    let userLogit = 0

    for (let i = 0; i < this.dims; i++) {
      baseLogit += this.baseWeights[i] * feat[i]
      userLogit += this.userWeights[i] * feat[i]
    }

    const baseProb = sigmoid(baseLogit)
    const personalProb = sigmoid(baseLogit + userLogit)
    const alpha = this.getAlpha()

    const combinedScore = (1 - alpha) * baseProb + alpha * personalProb
    const percentMatch = Math.round(Math.min(99, Math.max(1, combinedScore * 100)))

    return {
      baseScore: baseProb,
      personalScore: personalProb,
      combinedScore,
      percentMatch,
      features: feat
    }
  }

  // Онлайн-дообучение на действии пользователя (Лайк / Мимо)
  learn(text, isLike) {
    const feat = extractFeatures(text)
    const current = this.score(text, feat)
    const target = isLike ? 1.0 : 0.0
    const error = target - current.personalScore

    // Скорость адаптации (learning rate)
    const lr = 0.40

    // Онлайн шаг градиентного спуска (Online SGD)
    for (let i = 0; i < this.dims; i++) {
      // Градиентный шаг + небольшое L2-затухание весов
      this.userWeights[i] = (this.userWeights[i] * 0.995) + (lr * error * feat[i])
    }

    // Обновление центроидов вкуса
    const centroid = isLike ? this.positiveCentroid : this.negativeCentroid
    const count = isLike ? this.likeCount : this.skipCount
    const momentum = count > 0 ? 0.85 : 0.0

    for (let i = 0; i < this.dims; i++) {
      centroid[i] = centroid[i] * momentum + feat[i] * (1 - momentum)
    }

    if (isLike) {
      this.likeCount++
    } else {
      this.skipCount++
    }

    this.history.push({
      text: text.slice(0, 150),
      isLike,
      scoreBefore: Math.round(current.combinedScore * 100),
      time: Date.now()
    })

    this.saveProfile()

    return {
      likeCount: this.likeCount,
      skipCount: this.skipCount,
      alpha: this.getAlpha(),
      newScore: this.score(text, feat).percentMatch
    }
  }

  // Анализ профиля вкуса читателя
  getTasteProfile() {
    const total = this.likeCount + this.skipCount
    if (total === 0) {
      return {
        status: 'fresh',
        totalRatings: 0,
        likeCount: 0,
        skipCount: 0,
        summary: 'ИИ работает на базовой предобученной модели (CUDA RTX 4060). Оценивайте цитаты, чтобы сформировать персональный вкус.'
      }
    }

    // Анализируем веса пользователя
    const prefLength = this.userWeights[0] > 0.3 ? 'Лаконичные фразы' : this.userWeights[0] < -0.3 ? 'Развернутые размышления' : 'Сбалансированная длина'
    const prefWisdom = this.userWeights[2] > 0.2 ? 'Философия и экзистенциализм' : 'Художественная образность'
    const prefAntithesis = this.userWeights[4] > 0.2 ? 'Парадоксы и контрасты' : 'Прямые утверждения'

    const traits = [prefLength, prefWisdom, prefAntithesis]

    return {
      status: 'learning',
      totalRatings: total,
      likeCount: this.likeCount,
      skipCount: this.skipCount,
      adaptationPercent: Math.round(this.getAlpha() / 0.70 * 100),
      traits,
      summary: `Изучено ${total} оценок (${this.likeCount} понравилось, ${this.skipCount} мимо). Модель адаптирована на ${Math.round(this.getAlpha() / 0.70 * 100)}% к вашему вкусу.`
    }
  }
}

// Синглтон для читалки
export const globalQuoteModel = new QuoteModel()
