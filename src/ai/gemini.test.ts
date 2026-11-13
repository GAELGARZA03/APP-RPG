import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpRequest } from '../platform/http'
import { actTwoMissions, generateReply, guitarDesign, interactionReply } from '../test/fixtures'
import {
  actInput,
  AiError,
  askQuestions,
  buildRequest,
  checkConnection,
  designCampaign,
  designInput,
  detailTask,
  generateAct,
  generateDaily,
  retryConfig,
  type ActBrief,
  type CallStatus,
  type PlayerContext,
} from './gemini'

const context: PlayerContext = {
  level: 3,
  streak: 4,
  campaigns: [{ title: 'El Despertar del Mago', skill: 'Magia › Cartas' }],
  bounties: ['Tomar medicamentos', 'Leer 10 páginas'],
  skillPaths: ['Magia › Cartas › Mezclas falsas'],
}

const credentials = { apiKey: 'llave-secreta', model: 'gemini-4-hydrogen' }
const replying = (data: unknown, status = 200) => vi.fn<HttpRequest>().mockResolvedValue({ status, data })
const design = (request: HttpRequest, thinking: 'high' | null = 'high') =>
  designCampaign(request, { ...credentials, idea: 'Aprender guitarra', answers: [], context, thinking: thinking ?? undefined })

let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>
let warn: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
const realSleep = retryConfig.sleep

beforeEach(() => {
  sleep = vi.fn(async () => {})
  retryConfig.sleep = sleep
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  retryConfig.sleep = realSleep
  vi.restoreAllMocks()
})

async function expectKind(action: Promise<unknown>, kind: AiError['kind']) {
  await expect(action).rejects.toBeInstanceOf(AiError)
  await expect(action).rejects.toMatchObject({ kind })
}

describe('Preguntas previas', () => {
  it('usa generateContent con esquema y devuelve preguntas con opciones', async () => {
    const request = replying(
      generateReply({
        questions: [
          { question: '¿Qué tanto sabes ya de guitarra?', options: ['Nada', 'Algunos acordes', 'Toco canciones'] },
          { question: '¿Cuánto tiempo tienes a la semana?', options: ['2 horas', '4 horas', '4 horas', ''] },
        ],
      }),
    )

    const questions = await askQuestions(request, { apiKey: 'llave-secreta', model: 'gemini-3.5-flash-lite', idea: 'Guitarra' })

    expect(questions).toHaveLength(2)
    expect(questions[1].options).toEqual(['2 horas', '4 horas'])
    const sent = request.mock.calls[0][0]
    expect(sent.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
    expect(sent.body).toMatchObject({ generationConfig: { responseMimeType: 'application/json' } })
  })

  it('descarta preguntas sin opciones suficientes y limita la cantidad', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ question: `¿Pregunta ${index}?`, options: ['Sí', 'No'] }))
    const request = replying(generateReply({ questions: [{ question: '¿Sola?', options: ['Única'] }, ...many] }))

    const questions = await askQuestions(request, { ...credentials, idea: 'x' })

    expect(questions).toHaveLength(4)
    expect(questions[0].question).toBe('¿Pregunta 0?')
  })

  it('una lista vacía no es un error: se diseña sin preguntas', async () => {
    expect(await askQuestions(replying(generateReply({ questions: [] })), { ...credentials, idea: 'x' })).toEqual([])
  })
})

describe('Diseñar la campaña', () => {
  it('con razonamiento usa la API Interactions, con esquema y la llave solo en la cabecera', async () => {
    const request = replying(interactionReply(guitarDesign))

    expect(await design(request)).toEqual(guitarDesign)

    const sent = request.mock.calls[0][0]
    expect(sent.url).toBe('https://generativelanguage.googleapis.com/v1beta/interactions')
    expect(sent.headers).toEqual({ 'x-goog-api-key': 'llave-secreta', 'Api-Revision': '2026-05-20' })
    expect(sent.body).toMatchObject({
      model: 'gemini-4-hydrogen',
      store: false,
      generation_config: { thinking_level: 'high' },
      response_format: { type: 'text', mime_type: 'application/json' },
    })
    expect(JSON.stringify(sent.body)).not.toContain('llave-secreta')
    expect(sent.url).not.toContain('llave-secreta')
  })

  it('sin razonamiento (modelo rápido) usa generateContent', async () => {
    const request = replying(generateReply(guitarDesign))

    expect((await design(request, null)).campaign).toBe('Del silencio al escenario')
    expect(request.mock.calls[0][0].url).toContain(':generateContent')
  })

  it('el esquema siempre viaja y exige análisis, actos, jefe y habilidades', () => {
    const thinking = buildRequest({ model: 'm', system: 's', input: 'i', schema: { type: 'object' }, thinking: 'high' })
    const fast = buildRequest({ model: 'm', system: 's', input: 'i', schema: { type: 'object' } })

    expect(thinking.body.response_format).toMatchObject({ schema: { type: 'object' } })
    expect(fast.body.generationConfig).toMatchObject({ responseJsonSchema: { type: 'object' } })
  })

  it('manda la meta, las respuestas y solo el contexto permitido', () => {
    const input = designInput(
      'Quiero aprender guitarra',
      [
        { question: '¿Nivel?', answer: 'Principiante' },
        { question: '¿Fecha?', answer: '  ' },
      ],
      context,
    )

    expect(input).toContain('Quiero aprender guitarra')
    expect(input).toContain('¿Nivel? → Principiante')
    expect(input).not.toContain('¿Fecha?')
    expect(input).toContain('"El Despertar del Mago" [Magia › Cartas]')
    expect(input).toContain('Contratos diarios que ya tiene (2)')
    expect(input).toContain('Magia › Cartas › Mezclas falsas')
    expect(designInput('a'.repeat(20_000), [], context).length).toBeLessThan(9000)
  })

  it('recorta textos larguísimos y corrige dificultades en vez de fallar', async () => {
    const messy = {
      ...guitarDesign,
      campaign: `  ${'x'.repeat(300)}  `,
      analysis: { ...guitarDesign.analysis, diagnosis: 'd'.repeat(5000) },
      missions: [{ title: 't'.repeat(200), difficulty: 9 }, { title: 'Paso', difficulty: '2', steps: ['a', '', 'b'] }],
    }

    const result = await design(replying(interactionReply(messy)))

    expect(result.campaign).toHaveLength(80)
    expect(result.analysis.diagnosis).toHaveLength(700)
    expect(result.missions[0]).toMatchObject({ title: 't'.repeat(80), difficulty: 5, description: '', steps: [], why: '' })
    expect(result.missions[1]).toMatchObject({ difficulty: 2, steps: ['a', 'b'] })
  })

  it('limita misiones, actos y contratos cuando la IA manda demasiados', async () => {
    const result = await design(
      replying(
        interactionReply({
          ...guitarDesign,
          acts: Array.from({ length: 9 }, (_, index) => ({ title: `Acto ${index}`, goal: '', difficulty: 3 })),
          missions: Array.from({ length: 30 }, () => guitarDesign.missions[0]),
          bounties: Array.from({ length: 10 }, () => guitarDesign.bounties[0]),
        }),
      ),
    )

    expect(result.acts).toHaveLength(5)
    expect(result.missions).toHaveLength(8)
    expect(result.bounties).toHaveLength(3)
  })

  it('une habilidades repetidas con otro nombre y amarra cada misión a una que exista', async () => {
    const result = await design(
      replying(
        interactionReply({
          ...guitarDesign,
          skills: { area: 'Música', branch: 'Guitarra', leaves: ['Ritmo', 'RITMO', 'ritmó', 'Guitarra', 'Acordes'] },
          missions: [
            { ...guitarDesign.missions[0], skill: 'ritmo' },
            { ...guitarDesign.missions[1], skill: 'Guitarra › Acordes' },
            { ...guitarDesign.missions[2], skill: 'Algo nuevo' },
            { ...guitarDesign.missions[2], skill: '' },
          ],
        }),
      ),
    )

    // El jefe y el contrato del ejemplo traen sus propias sub-habilidades, que se agregan al final.
    expect(result.skills.leaves).toEqual(['Ritmo', 'Acordes', 'Algo nuevo', 'Repertorio', 'Acordes abiertos'])
    expect(result.missions.map((mission) => mission.skill)).toEqual(['Ritmo', 'Acordes', 'Algo nuevo', 'Ritmo'])
  })

  it('la dificultad de los actos nunca baja', async () => {
    const acts = [3, 2, 4, 1].map((difficulty, index) => ({ title: `Acto ${index + 1}`, goal: '', difficulty }))
    const result = await design(replying(interactionReply({ ...guitarDesign, acts })))

    expect(result.acts.map((act) => act.difficulty)).toEqual([3, 3, 4, 4])
  })

  it('rechaza diseños que no sirven: sin misiones, sin actos, sin jefe o que no son JSON', async () => {
    await expectKind(design(replying(interactionReply({ ...guitarDesign, missions: [] }))), 'bad-response')
    await expectKind(design(replying(interactionReply({ ...guitarDesign, acts: [] }))), 'bad-response')
    await expectKind(design(replying(interactionReply({ ...guitarDesign, boss: undefined }))), 'bad-response')
    await expectKind(design(replying(interactionReply({ ...guitarDesign, campaign: '   ' }))), 'bad-response')
    await expectKind(
      design(replying({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'Hola' }] }] })),
      'bad-response',
    )
    await expectKind(design(replying('error')), 'bad-response')
  })

  it('rechaza una respuesta que se quedó a medias por pensar demasiado', async () => {
    await expectKind(design(replying(interactionReply(guitarDesign, 'incomplete'))), 'bad-response')
  })

  it('detecta respuestas bloqueadas en el modelo rápido', async () => {
    await expectKind(design(replying({ promptFeedback: { blockReason: 'SAFETY' } }), null), 'blocked')
    await expectKind(design(replying(generateReply(guitarDesign, 'SAFETY')), null), 'blocked')
  })
})

describe('Errores de Gemini', () => {
  it('los errores de llave, permiso o formato no se reintentan', async () => {
    const disabled = {
      error: { message: 'Gemini API has not been used in project 123 before or it is disabled. Enable it by visiting...' },
    }
    for (const [status, data, kind] of [
      [400, { error: { message: 'API key not valid. Please pass a valid API key.' } }, 'invalid-key'],
      [400, { error: { message: 'thinking_level is not supported by this model' } }, 'bad-request'],
      [400, {}, 'invalid-key'],
      [401, {}, 'invalid-key'],
      [403, disabled, 'api-disabled'],
      [403, { error: { message: 'The caller does not have permission' } }, 'no-permission'],
      [404, {}, 'model'],
      [500, {}, 'server'],
    ] as const) {
      const failing = replying(data, status)
      const action = designCampaign(failing, { ...credentials, idea: 'x', answers: [], context, fallbackModel: 'respaldo' })
      await expectKind(action, kind)
      // Ni reintentos ni modelo de respaldo: el error se muestra directamente.
      expect(failing).toHaveBeenCalledTimes(1)
    }
    expect(sleep).not.toHaveBeenCalled()
  })

  it('distingue los errores en los que ayuda probar el modelo rápido', () => {
    expect(new AiError('busy').modelRelated).toBe(true)
    expect(new AiError('quota').modelRelated).toBe(true)
    expect(new AiError('network').modelRelated).toBe(false)
    expect(new AiError('invalid-key').modelRelated).toBe(false)
  })

  it('probar conexión hace una generación mínima con el modelo indicado', async () => {
    const request = replying({})

    await checkConnection(request, { apiKey: 'k', model: 'gemini-4-hydrogen' })

    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent',
    })
  })
})

describe('Reintentos y modelo de respaldo', () => {
  const busy = { status: 503, data: { error: { message: 'The model is overloaded' } } }
  const limited = { status: 429, data: { error: { message: 'Resource exhausted' } } }
  const success = { status: 200, data: interactionReply(guitarDesign) }
  const run = (request: HttpRequest, extra: object = {}) => {
    const statuses: CallStatus[] = []
    const result = designCampaign(request, {
      ...credentials,
      idea: 'Guitarra',
      answers: [],
      context,
      thinking: 'high',
      onStatus: (status) => statuses.push(status),
      ...extra,
    })
    return { result, statuses }
  }

  it('reintenta hasta 3 veces esperando 1.5, 3 y 5 segundos, y sigue en cuanto responde', async () => {
    const request = vi
      .fn<HttpRequest>()
      .mockResolvedValueOnce(busy)
      .mockResolvedValueOnce(limited)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(success)
    const { result, statuses } = run(request)

    expect((await result).campaign).toBe('Del silencio al escenario')
    expect(request).toHaveBeenCalledTimes(4)
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1500, 3000, 5000])
    expect(statuses.map((status) => status.message)).toEqual([
      'Procesando tu solicitud...',
      'Los servidores de IA están un poco saturados, reintentando automáticamente (intento 1 de 3)...',
      'Demasiadas peticiones seguidas, esperando unos segundos para continuar...',
      'La conexión falló un momento, reintentando automáticamente (intento 3 de 3)...',
      '¡Listo!',
    ])
    // Todos los intentos van al mismo modelo: aún no se activó el respaldo.
    expect(request.mock.calls.every(([sent]) => sent.url.endsWith('/interactions'))).toBe(true)
  })

  it('si sigue saturado tras los reintentos, hace un último intento con el modelo de respaldo', async () => {
    const request = vi.fn<HttpRequest>(async (sent) =>
      sent.url.endsWith('/interactions') ? busy : { status: 200, data: generateReply(guitarDesign) },
    )
    const { result, statuses } = run(request, { fallbackModel: 'gemini-3.5-flash-lite' })

    expect((await result).campaign).toBe('Del silencio al escenario')
    expect(request).toHaveBeenCalledTimes(5)
    const last = request.mock.calls[4][0]
    expect(last.url).toContain('gemini-3.5-flash-lite:generateContent')
    expect(JSON.stringify(last.body)).not.toContain('thinking_level')
    expect(statuses.at(-2)).toEqual({ stage: 'fallback', message: 'Activando el motor rápido de respaldo para darte respuesta...' })
    expect(statuses.at(-1)).toEqual({ stage: 'done', message: '¡Listo!' })
  })

  it('si también falla el respaldo, termina con un mensaje amigable y sin códigos técnicos', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue(limited)
    const { result, statuses } = run(request, { fallbackModel: 'gemini-3.5-flash-lite' })

    await expectKind(result, 'overloaded')
    expect(request).toHaveBeenCalledTimes(5)
    expect(statuses.at(-1)).toEqual({
      stage: 'failed',
      message: 'El servicio de IA está muy saturado en este momento. Por favor, intenta de nuevo en unos segundos.',
    })
    // Al jugador nunca le llegan códigos HTTP ni nombres técnicos del error.
    for (const { message } of statuses) expect(message).not.toMatch(/503|429|HTTP|exhausted|overloaded/i)
  })

  it('sin modelo de respaldo, o si es el mismo modelo, se rinde tras los reintentos', async () => {
    const without = vi.fn<HttpRequest>().mockResolvedValue(busy)
    await expectKind(run(without).result, 'overloaded')
    expect(without).toHaveBeenCalledTimes(4)

    const same = vi.fn<HttpRequest>().mockResolvedValue(busy)
    await expectKind(run(same, { fallbackModel: credentials.model }).result, 'overloaded')
    expect(same).toHaveBeenCalledTimes(4)
  })

  it('sin conexión reintenta, pero no cambia de modelo: el aviso sigue siendo de red', async () => {
    const offline = vi.fn<HttpRequest>().mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = run(offline, { fallbackModel: 'gemini-3.5-flash-lite' })

    await expectKind(result, 'network')
    expect(offline).toHaveBeenCalledTimes(4)
  })

  it('las llamadas de fondo pueden pedir que no se insista', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValue(busy)
    await expectKind(run(request, { retry: false, fallbackModel: 'gemini-3.5-flash-lite' }).result, 'overloaded')
    expect(request).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('deja en la consola el código HTTP, el modelo y el número de intento', async () => {
    const request = vi.fn<HttpRequest>().mockResolvedValueOnce(busy).mockResolvedValueOnce(success)
    await run(request).result

    expect(warn).toHaveBeenCalledWith('[Gemini] intento 1 de 4 · modelo gemini-4-hydrogen · HTTP 503 · busy')
    // La llave nunca aparece en los registros.
    expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).not.toContain('llave-secreta')
  })
})

describe('Generar el siguiente acto', () => {
  const brief: ActBrief = {
    campaign: 'Del silencio al escenario',
    idea: 'Quiero aprender guitarra',
    answers: [{ question: '¿Nivel?', answer: 'Principiante' }],
    diagnosis: 'Sin bases.',
    successCriteria: 'Tocas 3 canciones.',
    acts: [
      { number: 1, title: 'Primeros acordes', goal: 'Sonar limpio', difficulty: 2 },
      { number: 2, title: 'Ritmo y cambios', goal: 'Cambiar a tiempo', difficulty: 3 },
    ],
    nextAct: 2,
    previous: [
      {
        number: 1,
        title: 'Primeros acordes',
        days: 9,
        missions: [
          { title: 'Afina tu guitarra', difficulty: 1, skipped: true, undone: 0 },
          { title: 'Domina Em y Am', difficulty: 2, skipped: false, undone: 2 },
        ],
      },
    ],
    boss: 'El concierto',
    skills: ['Fundamentos', 'Ritmo'],
  }

  it('le cuenta al modelo cómo le fue al jugador', () => {
    const input = actInput(brief)

    expect(input).toContain('Acto 1 "Primeros acordes": lo terminó en 9 días.')
    expect(input).toContain('"Afina tu guitarra" (dificultad 1): SALTADA (ya lo sabía)')
    expect(input).toContain('"Domina Em y Am" (dificultad 2): completada, la deshizo 2 veces')
    expect(input).toContain('MISIÓN JEFE AL FINAL DE LA CAMPAÑA: "El concierto"')
    expect(input).toContain('Diseña ahora las misiones del Acto 2.')
    expect(input).toContain('¿Nivel? → Principiante')
  })

  it('devuelve las misiones validadas y rechaza una lista vacía', async () => {
    const request = replying(interactionReply({ missions: actTwoMissions }))

    expect(await generateAct(request, { ...credentials, brief, thinking: 'medium' })).toEqual(actTwoMissions)
    expect(request.mock.calls[0][0].body).toMatchObject({ generation_config: { thinking_level: 'medium' } })
    await expectKind(generateAct(replying(interactionReply({ missions: [] })), { ...credentials, brief, thinking: 'medium' }), 'bad-response')
  })
})

describe('Detallar una misión existente', () => {
  it('pide descripción y objetivos con el título y la campaña', async () => {
    const request = replying(
      generateReply({
        description: 'Practica los cortes básicos hasta hacerlos sin mirar.',
        steps: ['Practica el swing cut 10 veces', 'Practica el corte Charlier 10 veces', '  '],
      }),
    )

    const detail = await detailTask(request, {
      apiKey: 'k',
      model: 'gemini-3.5-flash-lite',
      title: 'Repasar mezclas falsas y cortes',
      campaign: 'El Despertar del Mago',
      daily: false,
    })

    expect(detail).toEqual({
      description: 'Practica los cortes básicos hasta hacerlos sin mirar.',
      steps: ['Practica el swing cut 10 veces', 'Practica el corte Charlier 10 veces'],
    })
    const sent = JSON.stringify(request.mock.calls[0][0].body)
    expect(sent).toContain('Repasar mezclas falsas y cortes')
    expect(sent).toContain('El Despertar del Mago')
  })

  it('rechaza respuestas vacías', async () => {
    const empty = replying(generateReply({ description: '', steps: [] }))
    await expectKind(detailTask(empty, { apiKey: 'k', model: 'm', title: 'x', campaign: null, daily: true }), 'bad-response')
  })
})

describe('Misión del día', () => {
  const dailyContext = {
    campaign: 'Del silencio al escenario',
    act: { number: 1, title: 'Primeros acordes', goal: 'Sonar limpio' },
    pending: ['Domina Em y Am'],
    skills: ['Fundamentos', 'Ritmo'],
  }

  it('pide un reto pequeño ligado al acto actual, con el modelo rápido', async () => {
    const request = replying(
      generateReply({ title: 'Reto de 60 cambios', difficulty: 4, description: 'Hazlo.', steps: ['Haz 60 cambios'], estimate: '20 min', skill: 'Ritmo' }),
    )

    const daily = await generateDaily(request, { apiKey: 'k', model: 'gemini-3.5-flash-lite', context: dailyContext })

    // La dificultad se limita a 1 o 2: es un reto de 15 a 30 minutos.
    expect(daily).toMatchObject({ title: 'Reto de 60 cambios', difficulty: 2, skill: 'Ritmo' })
    const sent = request.mock.calls[0][0]
    expect(sent.url).toContain('gemini-3.5-flash-lite:generateContent')
    expect(JSON.stringify(sent.body)).toContain('Primeros acordes')
    expect(JSON.stringify(sent.body)).toContain('Domina Em y Am')
  })

  it('rechaza una misión sin título', async () => {
    const request = replying(generateReply({ title: '', difficulty: 1 }))
    await expectKind(generateDaily(request, { apiKey: 'k', model: 'm', context: dailyContext }), 'bad-response')
  })
})
