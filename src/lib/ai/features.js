// Модуль извлечения стилометрических, семантических и синтаксических признаков цитаты

const WISDOM_KEYWORDS = new Set([
  'жизнь', 'жизни', 'жизнью', 'смерть', 'смерти', 'человек', 'человека', 'человеку', 'человеком', 'люди', 'людей',
  'душа', 'души', 'душе', 'душу', 'время', 'времени', 'временем', 'свобода', 'свободы', 'свободе', 'свободу',
  'истина', 'истины', 'истине', 'правда', 'правды', 'ложь', 'лжи', 'красота', 'красоты', 'красоте',
  'любовь', 'любви', 'любовью', 'сердце', 'сердца', 'сердцем', 'судьба', 'судьбы', 'судьбе',
  'счастье', 'счастья', 'горе', 'горя', 'мысль', 'мысли', 'мыслью', 'разум', 'разума',
  'память', 'памяти', 'вечность', 'вечности', 'страх', 'страха', 'зло', 'зла', 'добро', 'добра',
  'выбор', 'выбора', 'смысл', 'смысла', 'мир', 'мира', 'мечта', 'мечты', 'надежда', 'надежды',
  'боль', 'боли', 'вера', 'веры', 'совесть', 'совести', 'тайна', 'тайны', 'мудрость', 'мудрости',
  'одиночество', 'одиночества', 'тишина', 'тишины', 'слово', 'слова', 'прощение', 'прощения',
  'сила', 'силы', 'слабость', 'слабости', 'бог', 'бога', 'природа', 'природы', 'искушение',
  'страсть', 'страсти', 'характер', 'характера', 'совершенство', 'совершенства',
  'life', 'death', 'love', 'truth', 'time', 'soul', 'beauty', 'heart', 'mind', 'freedom', 'wisdom'
])

const GENERALIZATION_KEYWORDS = new Set([
  'все', 'всё', 'всех', 'всем', 'всеми', 'каждый', 'каждого', 'каждому', 'всякий', 'всякого',
  'никто', 'никого', 'никому', 'ничто', 'ничего', 'никогда', 'всегда', 'всюду', 'везде',
  'all', 'every', 'everyone', 'everything', 'none', 'nothing', 'never', 'always'
])

const ANTITHESIS_KEYWORDS = new Set([
  'но', 'однако', 'зато', 'лишь', 'только', 'хотя', 'нежели', 'вместо',
  'but', 'yet', 'however', 'though', 'rather', 'instead', 'only'
])

const ACTION_VERBS = new Set([
  'пошел', 'пошла', 'пошли', 'вошел', 'вошла', 'вошли', 'вышел', 'вышла', 'вышли',
  'сел', 'села', 'сели', 'встал', 'встала', 'встали', 'надел', 'надела', 'надели',
  'снял', 'сняла', 'сняли', 'взял', 'взяла', 'взяли', 'открыл', 'открыла', 'открыли',
  'закрыл', 'закрыла', 'закрыли', 'повернулся', 'повернулась', 'повернулись',
  'посмотрел', 'посмотрела', 'посмотрели', 'взглянул', 'взглянула', 'взглянули',
  'достал', 'достала', 'достали', 'положил', 'положила', 'положили',
  'подошел', 'подошла', 'подошли', 'кивнул', 'кивнула', 'кивнули',
  'улыбнулся', 'улыбнулась', 'пожал', 'пожала', 'шагнул', 'шагнула'
])

const DANGLING_PRONOUNS = new Set([
  'он', 'она', 'оно', 'они', 'его', 'ее', 'её', 'их', 'ему', 'ей', 'им',
  'этот', 'эта', 'это', 'эти', 'тот', 'та', 'то', 'те'
])

const DIALOGUE_FILLERS = new Set([
  'сказал', 'сказала', 'спросил', 'спросила', 'ответил', 'ответила',
  'крикнул', 'крикнула', 'прошептал', 'прошептала', 'воскликнул', 'воскликнула',
  'перебил', 'перебила', 'отозвался', 'отозвалась', 'заметил', 'заметила',
  'да', 'нет', 'конечно', 'ладно', 'хорошо', 'здравствуйте', 'привет', 'до свидания'
])

export const HASH_DIMS = 128
export const TOTAL_DIMS = 8 + HASH_DIMS

function fnv1a(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function extractFeatures(rawText = '') {
  const text = String(rawText).trim()
  const vec = new Float32Array(TOTAL_DIMS)
  if (!text) return vec

  const len = text.length
  // 1. Оптимальная длина цитаты (колоколообразная кривая с пиком ~110-180 символов)
  const lenScore = Math.exp(-Math.pow((len - 140) / 110, 2))
  vec[0] = Math.min(1, Math.max(0, lenScore))

  // 2. Пунктуационный ритм (тире, двоеточие, точка с запятой, кавычки)
  const dashes = (text.match(/[—–-]/g) || []).length
  const colons = (text.match(/[:;]/g) || []).length
  const quotes = (text.match(/[«»""]/g) || []).length
  vec[1] = Math.min(1, (dashes * 0.4 + colons * 0.5 + quotes * 0.2))

  // Токенизация слов
  const words = text.toLowerCase().replace(/[^a-zа-яё0-9\s-]/gi, ' ').split(/\s+/).filter(Boolean)
  const wordCount = Math.max(1, words.length)

  let wisdomCount = 0
  let genCount = 0
  let antithesisCount = 0
  let actionCount = 0
  let dialogueCount = 0

  for (const w of words) {
    if (WISDOM_KEYWORDS.has(w)) wisdomCount++
    if (GENERALIZATION_KEYWORDS.has(w)) genCount++
    if (ANTITHESIS_KEYWORDS.has(w)) antithesisCount++
    if (ACTION_VERBS.has(w)) actionCount++
    if (DIALOGUE_FILLERS.has(w)) dialogueCount++
  }

  // 3. Плотность лексики мудрости / философии
  vec[2] = Math.min(1, (wisdomCount / Math.min(10, wordCount)) * 1.8)

  // 4. Обобщающие маркеры (все, никто, никогда, каждый)
  vec[3] = Math.min(1, genCount * 0.5)

  // 5. Антитезы и диалектические конструкции (не... а..., но, однако)
  const hasContrastPattern = /не\s+[а-яёa-z]+,\s*а\s+/i.test(text) || /чем\s+[а-яёa-z]+,\s*тем\s+/i.test(text)
  vec[4] = Math.min(1, antithesisCount * 0.35 + (hasContrastPattern ? 0.6 : 0))

  // 6. Штраф за бытовой диалог
  const startsWithDash = /^[—–-]/.test(text)
  const hasDialogueTags = dialogueCount > 0 && startsWithDash
  vec[5] = Math.min(1, (hasDialogueTags ? 0.7 : 0) + (dialogueCount / wordCount) * 1.5)

  // 7. Штраф за механические глаголы действия
  vec[6] = Math.min(1, (actionCount / wordCount) * 2.2)

  // 8. Автономность высказывания (штраф за висячее местоимение в самом начале)
  const firstWord = words[0] || ''
  const dangling = DANGLING_PRONOUNS.has(firstWord)
  const startsCapitalized = /^[А-ЯЁA-Z«"]/.test(text)
  vec[7] = (dangling ? -0.8 : 0.4) + (startsCapitalized ? 0.3 : 0)

  // Семантический хэш-вектор n-грамм (128 измерений)
  const hashOffset = 8
  const lower = text.toLowerCase()
  let hashNorm = 0

  // Символьные триграммы
  for (let i = 0; i <= lower.length - 3; i++) {
    const trigram = lower.slice(i, i + 3)
    const h = fnv1a(trigram)
    const idx = hashOffset + (h % HASH_DIMS)
    const sign = (h & 0x10000) ? 1 : -1
    vec[idx] += sign * 0.15
  }

  // Словесные униграммы и биграммы
  for (let i = 0; i < words.length; i++) {
    const unigramH = fnv1a(words[i])
    const unigramIdx = hashOffset + (unigramH % HASH_DIMS)
    const signU = (unigramH & 0x10000) ? 1 : -1
    vec[unigramIdx] += signU * 0.4

    if (i < words.length - 1) {
      const bigramH = fnv1a(`${words[i]}_${words[i + 1]}`)
      const bigramIdx = hashOffset + (bigramH % HASH_DIMS)
      const signB = (bigramH & 0x10000) ? 1 : -1
      vec[bigramIdx] += signB * 0.3
    }
  }

  // L2-нормализация хэш-части
  for (let i = hashOffset; i < TOTAL_DIMS; i++) {
    hashNorm += vec[i] * vec[i]
  }
  if (hashNorm > 0) {
    const inv = 1 / Math.sqrt(hashNorm)
    for (let i = hashOffset; i < TOTAL_DIMS; i++) {
      vec[i] *= inv
    }
  }

  return vec
}
