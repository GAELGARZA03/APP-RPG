import { describe, expect, it, vi } from 'vitest'
import type { HttpRequest } from '../platform/http'
import { AiError, buildRequestBody, checkConnection, generatePlan, parseGeminiResponse } from './gemini'

const geminiReply = (payload: unknown, finishReason = 'STOP') => ({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(payload) }] } }],
})

const plan = {
  campaign: 'Aprender magia con cartas',
  sideQuests: [
    { title: 'Comprar una baraja', difficulty: 1 },
    { title: 'Practicar el doble lift', difficulty: 3 },
  ],
  bounties: [{ title: 'Practicar 10 minutos', difficulty: 1 }],
}

function expectAiError(action: () => unknown, kind: AiError['kind']) {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(AiError)
    expect((error as AiError).kind).toBe(kind)
    return
  }
  throw new Error('No lanzó error')
}

describe('Respuesta de Gemini', () => {
  it('extrae y valida el plan', () => {
    expect(parseGeminiResponse(geminiReply(plan))).toEqual(plan)
  })

  it('corrige valores fuera de rango en vez de fallar', () => {
    const messy = {
      campaign: '  Meta  ',
      sideQuests: [{ title: 'x'.repeat(200), difficulty: 9 }, { title: 'Paso', difficulty: '2' }],
    }

    const result = parseGeminiResponse(geminiReply(messy))

    expect(result.campaign).toBe('Meta')
    expect(result.sideQuests[0]).toEqual({ title: 'x'.repeat(80), difficulty: 5 })
    expect(result.sideQuests[1].difficulty).toBe(2)
    expect(result.bounties).toEqual([])
  })

  it('rechaza texto que no es JSON o planes sin tareas', () => {
    expectAiError(
      () => parseGeminiResponse({ candidates: [{ content: { parts: [{ text: 'Hola' }] } }] }),
      'bad-response',
    )
    expectAiError(() => parseGeminiResponse(geminiReply({ campaign: 'Meta', sideQuests: [] })), 'bad-response')
    expectAiError(() => parseGeminiResponse('error'), 'bad-response')
  })

  it('detecta respuestas bloqueadas', () => {
    expectAiError(() => parseGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }), 'blocked')
    expectAiError(() => parseGeminiResponse(geminiReply(plan, 'SAFETY')), 'blocked')
  })
})

describe('Petición a Gemini', () => {
  it('envía la llave solo en la cabecera y pide JSON con esquema', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue({ status: 200, data: geminiReply(plan) })

    await generatePlan(request, { apiKey: 'llave-secreta', model: 'gemini-3.5-flash-lite', idea: 'Magia' })

    const sent = request.mock.calls[0][0]
    expect(sent.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    )
    expect(sent.headers['x-goog-api-key']).toBe('llave-secreta')
    expect(JSON.stringify(sent.body)).not.toContain('llave-secreta')
    expect(sent.url).not.toContain('llave-secreta')
    expect(buildRequestBody('Magia').generationConfig.responseMimeType).toBe('application/json')
  })

  it('traduce errores de red y de estado', async () => {
    const offline = vi.fn<HttpRequest>().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(generatePlan(offline, { apiKey: 'k', model: 'm', idea: 'x' })).rejects.toMatchObject({
      kind: 'network',
    })

    const disabled = {
      error: { message: 'Gemini API has not been used in project 123 before or it is disabled. Enable it by visiting...' },
    }
    for (const [status, data, kind] of [
      [400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, 'invalid-key'],
      [403, disabled, 'api-disabled'],
      [403, { error: { message: 'The caller does not have permission' } }, 'no-permission'],
      [404, {}, 'model'],
      [429, {}, 'quota'],
      [503, {}, 'busy'],
      [500, {}, 'server'],
    ] as const) {
      const failing = vi.fn<HttpRequest>().mockResolvedValue({ status, data })
      await expect(checkConnection(failing, { apiKey: 'k', model: 'm' })).rejects.toMatchObject({ kind })
    }
  })

  it('probar conexión hace una generación mínima con el modelo configurado', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue({ status: 200, data: {} })

    await checkConnection(request, { apiKey: 'k', model: 'gemini-3.5-flash-lite' })

    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
    })
  })

  it('recorta ideas demasiado largas', () => {
    expect(buildRequestBody('a'.repeat(20_000)).contents[0].parts[0].text).toHaveLength(8000)
  })
})
