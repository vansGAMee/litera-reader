/**
 * Smart E-reader Reading Tracker with Idle/AFK Detection and Outlier Filtering.
 * Calibrates personal reading speed (WPM) using robust statistical moving averages.
 */

const STORAGE_KEY = 'litera-reading-profile-v1'
export const DEFAULT_WPM = 215
export const IDLE_TIMEOUT_SECONDS = 60
export const MIN_READING_SECONDS = 3
export const MAX_READING_SECONDS = 300
export const MIN_VALID_WPM = 50
export const MAX_VALID_WPM = 800

// In-memory fallback if localStorage is unavailable
const memoryStore = new Map()

function getStorageItem(key) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      return localStorage.getItem(key)
    }
  } catch {
    /* fallback */
  }
  return memoryStore.get(key) ?? null
}

function setStorageItem(key, val) {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem(key, val)
      return
    }
  } catch {
    /* fallback */
  }
  memoryStore.set(key, val)
}

export function clearReadingStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.removeItem) {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
  memoryStore.delete(STORAGE_KEY)
}

export function getReadingProfile() {
  try {
    const raw = getStorageItem(STORAGE_KEY)
    if (!raw) return createDefaultProfile()
    const parsed = JSON.parse(raw)
    return {
      wpm: Math.max(80, Math.min(600, Math.round(Number(parsed.wpm) || DEFAULT_WPM))),
      totalWords: Math.max(0, Math.round(Number(parsed.totalWords) || 0)),
      totalSeconds: Math.max(0, Math.round(Number(parsed.totalSeconds) || 0)),
      sampleCount: Math.max(0, Math.round(Number(parsed.sampleCount) || 0)),
      samples: Array.isArray(parsed.samples) ? parsed.samples.slice(-20) : [],
      isCustom: Boolean(parsed.isCustom),
    }
  } catch {
    return createDefaultProfile()
  }
}

export function saveReadingProfile(profile) {
  try {
    setStorageItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    /* ignore storage errors */
  }
}

export function createDefaultProfile() {
  return {
    wpm: DEFAULT_WPM,
    totalWords: 0,
    totalSeconds: 0,
    sampleCount: 0,
    samples: [],
    isCustom: false,
  }
}

export function resetReadingProfile() {
  const profile = createDefaultProfile()
  saveReadingProfile(profile)
  return profile
}

export function countWords(text = '') {
  return String(text).trim().split(/\s+/).filter(Boolean).length
}

/**
 * Validates a single page reading interval and returns whether it is a valid reading sample.
 * Outliers (flipping too fast, staying AFK too long, impossible speeds) are rejected.
 */
export function evaluateInterval(words, seconds) {
  if (words < 10 || seconds < MIN_READING_SECONDS || seconds > MAX_READING_SECONDS) {
    return { valid: false, reason: 'duration_outlier' }
  }

  const intervalWpm = Math.round((words / seconds) * 60)
  if (intervalWpm < MIN_VALID_WPM || intervalWpm > MAX_VALID_WPM) {
    return { valid: false, intervalWpm, reason: 'wpm_outlier' }
  }

  return { valid: true, intervalWpm }
}

/**
 * Records a completed page reading session.
 * Updates EMA smoothed WPM and saves to localStorage.
 */
export function recordReadingSample(words, seconds, currentProfile = getReadingProfile()) {
  const evaluation = evaluateInterval(words, seconds)
  if (!evaluation.valid) {
    return { profile: currentProfile, updated: false, reason: evaluation.reason }
  }

  const { intervalWpm } = evaluation

  // EMA smoothing: alpha = 0.22 gives stable yet adaptive response
  const alpha = 0.22
  const newWpm = Math.round(alpha * intervalWpm + (1 - alpha) * currentProfile.wpm)
  const boundedWpm = Math.max(100, Math.min(500, newWpm))

  const newSamples = [
    ...(currentProfile.samples || []),
    { words, seconds, wpm: intervalWpm, timestamp: Date.now() },
  ].slice(-25)

  const updatedProfile = {
    wpm: boundedWpm,
    totalWords: (currentProfile.totalWords || 0) + words,
    totalSeconds: (currentProfile.totalSeconds || 0) + Math.round(seconds),
    sampleCount: (currentProfile.sampleCount || 0) + 1,
    samples: newSamples,
    isCustom: currentProfile.isCustom,
  }

  saveReadingProfile(updatedProfile)
  return { profile: updatedProfile, updated: true, intervalWpm }
}

export function calculateEstimatedMinutes(remainingWords, wpm = DEFAULT_WPM) {
  const effectiveWpm = Math.max(80, Number(wpm) || DEFAULT_WPM)
  const words = Math.max(0, Number(remainingWords) || 0)
  if (!words) return 0
  return Math.max(1, Math.ceil(words / effectiveWpm))
}
