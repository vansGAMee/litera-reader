import { beforeEach, describe, expect, it } from 'vitest'
import {
  calculateEstimatedMinutes,
  clearReadingStorage,
  countWords,
  evaluateInterval,
  getReadingProfile,
  recordReadingSample,
  resetReadingProfile,
} from './readingTracker.js'

describe('readingTracker module', () => {
  beforeEach(() => {
    clearReadingStorage()
  })

  it('counts words accurately', () => {
    expect(countWords('Первое слово, второе и третье.')).toBe(5)
    expect(countWords('')).toBe(0)
    expect(countWords('   много    пробелов   ')).toBe(2)
  })

  it('rejects outliers for fast skims and long AFK pauses', () => {
    // Too fast (skimming in 1.5 seconds)
    expect(evaluateInterval(200, 1.5).valid).toBe(false)
    // Superhuman speed (> 800 WPM, e.g. 500 words in 10s = 3000 WPM)
    expect(evaluateInterval(500, 10).valid).toBe(false)
    // Distracted / AFK (< 50 WPM, e.g. 15 words in 60s = 15 WPM)
    expect(evaluateInterval(15, 60).valid).toBe(false)
    // Too long on single page (> 300s)
    expect(evaluateInterval(200, 350).valid).toBe(false)
    // Valid interval: 220 words in 55s -> 240 WPM
    const valid = evaluateInterval(220, 55)
    expect(valid.valid).toBe(true)
    expect(valid.intervalWpm).toBe(240)
  })

  it('updates profile and personal WPM smoothly with valid samples', () => {
    const profile = getReadingProfile()
    expect(profile.wpm).toBe(215)
    expect(profile.sampleCount).toBe(0)

    // User reads a 240 words page in 48 seconds -> 300 WPM
    const result1 = recordReadingSample(240, 48, profile)
    expect(result1.updated).toBe(true)
    expect(result1.intervalWpm).toBe(300)
    expect(result1.profile.wpm).toBeGreaterThan(215)
    expect(result1.profile.sampleCount).toBe(1)
    expect(result1.profile.totalWords).toBe(240)

    // Second sample: 200 words in 60 seconds -> 200 WPM
    const result2 = recordReadingSample(200, 60, result1.profile)
    expect(result2.updated).toBe(true)
    expect(result2.profile.sampleCount).toBe(2)
    expect(result2.profile.totalWords).toBe(440)
  })

  it('calculates remaining reading time based on personal WPM', () => {
    expect(calculateEstimatedMinutes(430, 215)).toBe(2)
    expect(calculateEstimatedMinutes(1000, 250)).toBe(4)
    expect(calculateEstimatedMinutes(0, 250)).toBe(0)
  })

  it('resets calibration on demand', () => {
    recordReadingSample(240, 48)
    const reset = resetReadingProfile()
    expect(reset.wpm).toBe(215)
    expect(reset.sampleCount).toBe(0)
  })
})
