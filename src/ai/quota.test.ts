import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpRequest } from '../platform/http'
import { generateReply } from '../test/fixtures'
import { askQuestions, checkConnection, listModels, retryConfig } from './gemini'
import {
  applyAvailability,
  getQuota,
  quotaDay,
  recordFailure,
  recordSuccess,
  remaining,
  resetQuota,
  setDailyLimit,
  setUsedToday,
} from './quota'

// Mediodía en México: mismo día en la hora del Pacífico.
const noon = new Date('2026-11-13T18:00:00Z')
const model = (id: string, now = noon) => getQuota(now).models.find((item) => item.id === id)!

beforeEach(() => {
  resetQuota()
  retryConfig.sleep = async () => {}
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('Contador de cuota', () => {
  it('empieza con los cuatro modelos y sus límites del nivel gratuito', () => {
    expect(getQuota(noon).models.map((item) => [item.id, item.dailyLimit, item.perMinute, item.usedToday])).toEqual([
      ['gemini-4-hydrogen', 20, 5, 0],
      ['gemini-3.8-flash', 20, 5, 0],
      ['gemini-3.6-flash', 20, 5, 0],
      ['gemini-3.5-flash-lite', 500, 15, 0],
    ])
    expect(getQuota(noon).lastChecked).toBeNull()
  })

  it('cada petición exitosa suma una llamada y deja el modelo como disponible', () => {
    recordSuccess('gemini-4-hydrogen', noon)
    recordSuccess('gemini-4-hydrogen', noon)

    expect(model('gemini-4-hydrogen')).toMatchObject({ usedToday: 2, status: 'available' })
    expect(remaining(model('gemini-4-hydrogen'))).toBe(18)
    expect(model('gemini-3.8-flash').usedToday).toBe(0)
  })

  it('al llegar al límite diario queda agotado con 0 restantes', () => {
    setUsedToday('gemini-4-hydrogen', 19, noon)
    recordSuccess('gemini-4-hydrogen', noon)

    expect(model('gemini-4-hydrogen')).toMatchObject({ usedToday: 20, status: 'exhausted' })
    expect(remaining(model('gemini-4-hydrogen'))).toBe(0)
  })

  it('un 429 con cuota de sobra es el límite por minuto, no «agotado por hoy»', () => {
    recordSuccess('gemini-4-hydrogen', noon)
    recordFailure('gemini-4-hydrogen', 429, noon)
    expect(model('gemini-4-hydrogen')).toMatchObject({ usedToday: 1, status: 'rate-limited' })

    setUsedToday('gemini-4-hydrogen', 20, noon)
    recordFailure('gemini-4-hydrogen', 429, noon)
    expect(model('gemini-4-hydrogen').status).toBe('exhausted')
  })

  it('un 503 marca saturación temporal y otros errores no tocan la cuota', () => {
    recordFailure('gemini-3.8-flash', 503, noon)
    expect(model('gemini-3.8-flash').status).toBe('busy')

    recordFailure('gemini-3.6-flash', 403, noon)
    recordFailure('gemini-3.6-flash', null, noon)
    expect(model('gemini-3.6-flash')).toMatchObject({ usedToday: 0, status: 'unknown' })
  })

  it('el ajuste manual corrige el contador y el límite', () => {
    setUsedToday('gemini-4-hydrogen', 14, noon)
    expect(remaining(model('gemini-4-hydrogen'))).toBe(6)

    setUsedToday('gemini-4-hydrogen', -5, noon)
    expect(model('gemini-4-hydrogen').usedToday).toBe(0)

    setUsedToday('gemini-4-hydrogen', 30, noon)
    expect(model('gemini-4-hydrogen').status).toBe('exhausted')
    // Subir el límite lo saca de «agotado».
    setDailyLimit('gemini-4-hydrogen', 50, noon)
    expect(model('gemini-4-hydrogen')).toMatchObject({ dailyLimit: 50, status: 'unknown' })
    expect(remaining(model('gemini-4-hydrogen'))).toBe(20)
  })

  it('los contadores se reinician solos al cambiar el día del Pacífico', () => {
    recordSuccess('gemini-4-hydrogen', noon)
    recordFailure('gemini-3.8-flash', 503, noon)
    setDailyLimit('gemini-4-hydrogen', 25, noon)

    // 23:30 del mismo día en el Pacífico: todavía cuenta.
    expect(model('gemini-4-hydrogen', new Date('2026-11-14T07:30:00Z')).usedToday).toBe(1)
    // 00:30 del día siguiente en el Pacífico: contador en cero, límite conservado.
    const next = new Date('2026-11-14T08:30:00Z')
    expect(quotaDay(next)).toBe('2026-11-14')
    expect(model('gemini-4-hydrogen', next)).toMatchObject({ usedToday: 0, dailyLimit: 25, status: 'unknown' })
    expect(model('gemini-3.8-flash', next).status).toBe('unknown')
  })

  it('«Actualizar estado» marca qué modelos ofrece la cuenta sin tocar los contadores', () => {
    setUsedToday('gemini-4-hydrogen', 20, noon)
    setUsedToday('gemini-3.5-flash-lite', 7, noon)

    applyAvailability(['gemini-4-hydrogen', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'otro-modelo'], noon)

    const quota = getQuota(noon)
    expect(quota.lastChecked).toBe(noon.toISOString())
    expect(quota.models.map((item) => [item.id, item.status, item.usedToday])).toEqual([
      ['gemini-4-hydrogen', 'exhausted', 20],
      ['gemini-3.8-flash', 'available', 0],
      ['gemini-3.6-flash', 'unavailable', 0],
      ['gemini-3.5-flash-lite', 'available', 7],
    ])
  })

  it('un modelo escrito a mano en Ajustes se empieza a contar al usarlo', () => {
    recordSuccess('modelo-propio', noon)

    expect(model('modelo-propio')).toMatchObject({ usedToday: 1, dailyLimit: 0, status: 'available' })
    expect(remaining(model('modelo-propio'))).toBeNull()
  })
})

describe('Conexión con las llamadas a Gemini', () => {
  const questions = { questions: [{ question: '¿Nivel?', options: ['Nada', 'Algo'] }] }

  it('cada llamada exitosa suma al modelo que respondió', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue({ status: 200, data: generateReply(questions) })

    await askQuestions(request, { apiKey: 'k', model: 'gemini-3.5-flash-lite', idea: 'x' })
    await checkConnection(request, { apiKey: 'k', model: 'gemini-4-hydrogen' })

    expect(model('gemini-3.5-flash-lite', new Date())).toMatchObject({ usedToday: 1, status: 'available' })
    expect(model('gemini-4-hydrogen', new Date())).toMatchObject({ usedToday: 1, status: 'available' })
  })

  it('los intentos fallidos no gastan cuota: solo cuenta el que respondió, y marca al saturado', async () => {
    const request = vi.fn<HttpRequest>(async (sent) =>
      sent.url.includes('gemini-4-hydrogen')
        ? { status: 503, data: {} }
        : { status: 200, data: generateReply(questions) },
    )

    await askQuestions(request, { apiKey: 'k', model: 'gemini-4-hydrogen', idea: 'x', fallbackModel: 'gemini-3.5-flash-lite' })

    expect(model('gemini-4-hydrogen', new Date())).toMatchObject({ usedToday: 0, status: 'busy' })
    expect(model('gemini-3.5-flash-lite', new Date())).toMatchObject({ usedToday: 1, status: 'available' })
  })

  it('consulta la lista de modelos con la llave en la cabecera, nunca en la URL', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue({
      status: 200,
      data: { models: [{ name: 'models/gemini-4-hydrogen' }, { name: 'models/gemini-3.5-flash-lite' }] },
    })

    expect(await listModels(request, 'llave-secreta')).toEqual(['gemini-4-hydrogen', 'gemini-3.5-flash-lite'])
    const sent = request.mock.calls[0][0]
    expect(sent).toMatchObject({ method: 'GET', headers: { 'x-goog-api-key': 'llave-secreta' } })
    expect(sent.url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000')
    // Consultar la lista no gasta cuota de generación.
    expect(getQuota().models.every((item) => item.usedToday === 0)).toBe(true)
  })

  it('una llave rechazada al verificar se informa como tal', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue({ status: 400, data: { error: { message: 'API key not valid.' } } })
    await expect(listModels(request, 'mala')).rejects.toMatchObject({ kind: 'invalid-key' })
  })
})
