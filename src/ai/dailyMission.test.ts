// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generateDailies = vi.fn()
vi.mock('./session', () => ({ aiSession: async () => ({ apiKey: 'k', fastModel: 'rapido', mainModel: 'principal' }) }))
vi.mock('./gemini', async (original) => ({ ...(await original<object>()), generateDailies }))
vi.mock('../data/gameStore', async (original) => ({
  ...(await original<object>()),
  getDailies: async () => [],
  getDailyContext: async () => ({ campaignId: null, branchId: null }),
  saveDailies: async () => [],
}))

const { AUTO_RETRY_GAP_MS, MAX_AUTO_ATTEMPTS, ensureDailyMission, resetDailyAttempts } = await import('./dailyMission')

beforeEach(() => {
  resetDailyAttempts()
  generateDailies.mockReset()
})
afterEach(() => resetDailyAttempts())

describe('Misiones del día: reintentos automáticos', () => {
  it('si falla, vuelve a intentar sola cada 20 minutos, hasta 6 veces al día', async () => {
    generateDailies.mockRejectedValue(new Error('saturado'))
    const start = new Date(2026, 10, 18, 9, 0)
    expect(await ensureDailyMission(start)).toBe('failed')
    expect(generateDailies.mock.calls[0][1]).toMatchObject({ retry: true })
    // Antes de 20 minutos no vuelve a llamar.
    expect(await ensureDailyMission(new Date(start.getTime() + 5 * 60 * 1000))).toBe('waiting')
    for (let attempt = 1; attempt < MAX_AUTO_ATTEMPTS; attempt += 1) {
      expect(await ensureDailyMission(new Date(start.getTime() + attempt * AUTO_RETRY_GAP_MS))).toBe('failed')
    }
    expect(generateDailies).toHaveBeenCalledTimes(MAX_AUTO_ATTEMPTS)
    expect(await ensureDailyMission(new Date(start.getTime() + 10 * AUTO_RETRY_GAP_MS))).toBe('waiting')
    // A mano siempre se puede.
    generateDailies.mockResolvedValue([])
    expect(await ensureDailyMission(new Date(start.getTime() + 10 * AUTO_RETRY_GAP_MS), true)).toBe('ready')
  })

  it('un día nuevo (después de las 4:00 a. m.) vuelve a tener sus intentos', async () => {
    generateDailies.mockRejectedValue(new Error('saturado'))
    for (let attempt = 0; attempt < MAX_AUTO_ATTEMPTS; attempt += 1) {
      await ensureDailyMission(new Date(2026, 10, 18, 9 + attempt, 0))
    }
    expect(await ensureDailyMission(new Date(2026, 10, 18, 23, 0))).toBe('waiting')
    generateDailies.mockResolvedValue([])
    expect(await ensureDailyMission(new Date(2026, 10, 19, 5, 0))).toBe('ready')
  })
})
