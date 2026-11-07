import { z } from 'zod'
import type { Difficulty } from '../game/rules'
import type { HttpRequest } from '../platform/http'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'
/** Nombre del secreto cifrado que guarda la API key. */
export const GEMINI_KEY_SECRET = 'gemini_api_key'
export const MAX_IDEA_LENGTH = 8000

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 45_000
const MAX_TITLE_LENGTH = 80
const MAX_DESCRIPTION_LENGTH = 400
const MAX_STEP_LENGTH = 120

export interface TaskDetailPlan {
  description: string
  steps: string[]
}

export interface PlanItem extends TaskDetailPlan {
  title: string
  difficulty: Difficulty
}

export interface GeneratedPlan {
  campaign: string
  sideQuests: PlanItem[]
  bounties: PlanItem[]
}

export type AiErrorKind =
  | 'invalid-key'
  | 'api-disabled'
  | 'no-permission'
  | 'model'
  | 'quota'
  | 'busy'
  | 'network'
  | 'blocked'
  | 'bad-response'
  | 'server'

const MESSAGES: Record<AiErrorKind, string> = {
  'invalid-key': 'Gemini rechazó la API key. Revísala en Ajustes.',
  'api-disabled':
    'La API de Gemini no está activada en el proyecto de Google de tu llave. Actívala y espera unos minutos.',
  'no-permission':
    'Tu llave no tiene permiso para usar este modelo. Revisa en Google AI Studio que la API de Gemini esté activa en su proyecto.',
  model: 'El modelo configurado no existe o no está disponible. Revísalo en Ajustes.',
  quota: 'Se alcanzó el límite de uso de Gemini. Espera un momento e intenta de nuevo.',
  busy: 'El modelo de Gemini está saturado. Intenta de nuevo en un momento o cambia el modelo en Ajustes.',
  network: 'No hay conexión con Gemini. Revisa tu internet.',
  blocked: 'Gemini no quiso responder a ese texto. Prueba a escribirlo de otra forma.',
  'bad-response': 'Gemini respondió algo inesperado. Intenta generar de nuevo.',
  server: 'Gemini tuvo un problema. Intenta de nuevo en unos minutos.',
}

export class AiError extends Error {
  readonly kind: AiErrorKind

  constructor(kind: AiErrorKind) {
    super(MESSAGES[kind])
    this.kind = kind
  }
}

const MISSION_RULES = `Cada misión debe ser concreta y medible, como una misión de videojuego: qué hacer exactamente, cuántas veces o cuánto tiempo, y con qué.
- Mal: "Repasar los fundamentos de mezclas falsas y cortes".
- Bien: "Practicar 3 cortes falsos, 10 veces cada uno".
- description: 1 o 2 frases que expliquen el objetivo y cómo saber que terminaste.
- steps: de 2 a 4 objetivos concretos con cantidades, nombres o tiempos (por ejemplo "Practica el swing cut 10 veces sin mirar las manos"). Empieza cada uno con un verbo.
- Títulos de máximo 70 caracteres, en español, con tono de videojuego pero claros.`

const SYSTEM_PROMPT = `Eres el diseñador de misiones de Real Life RPG, una app que convierte metas reales en un juego de rol.
Convierte la idea del usuario en un plan accionable.

Reglas:
- campaign: nombre corto y motivador de la meta (máximo 60 caracteres).
- sideQuests: entre 3 y 8 misiones únicas, en orden lógico. Cada una se puede completar en una sola sesión.
- bounties: de 0 a 3 hábitos diarios pequeños que sostengan la meta. Inclúyelos solo si tiene sentido repetirlos todos los días.
- difficulty, de 1 a 5: 1 = menos de 15 minutos y sin esfuerzo; 2 = hasta 30 minutos; 3 = alrededor de una hora o esfuerzo moderado; 4 = varias horas o salir de la zona de confort; 5 = un día completo o un gran reto.
${MISSION_RULES}
- Si el texto es largo o es una transcripción, extrae la meta principal.
- No inventes datos personales del usuario.`

const DETAIL_PROMPT = `Eres el diseñador de misiones de Real Life RPG, una app que convierte metas reales en un juego de rol.
Te doy el título de una misión que ya existe. Escribe su descripción y sus objetivos para que sea concreta.
${MISSION_RULES}
- Respeta la intención del título; no lo cambies por otra cosa.
- No inventes datos personales del usuario.`

const detailProperties = {
  description: { type: 'string' },
  steps: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
}

const itemSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    difficulty: { type: 'integer', minimum: 1, maximum: 5 },
    ...detailProperties,
  },
  required: ['title', 'difficulty', 'description', 'steps'],
}

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    campaign: { type: 'string' },
    sideQuests: { type: 'array', items: itemSchema, minItems: 1, maxItems: 8 },
    bounties: { type: 'array', items: itemSchema, maxItems: 3 },
  },
  required: ['campaign', 'sideQuests', 'bounties'],
}

const DETAIL_JSON_SCHEMA = {
  type: 'object',
  properties: detailProperties,
  required: ['description', 'steps'],
}

// La respuesta de la IA nunca se usa sin validarla. Se recortan textos largos en vez de rechazarlos.
const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.slice(0, max))
const title = clipped(MAX_TITLE_LENGTH).pipe(z.string().min(1))
const detailSchema = z.object({
  description: clipped(MAX_DESCRIPTION_LENGTH).default(''),
  steps: z
    .array(clipped(MAX_STEP_LENGTH))
    .default([])
    .transform((steps) => steps.filter(Boolean).slice(0, 6)),
})
const item = detailSchema.extend({
  title,
  difficulty: z.coerce
    .number()
    .transform((value) => Math.min(5, Math.max(1, Math.round(value))) as Difficulty),
})
const planSchema = z.object({
  campaign: title,
  sideQuests: z
    .array(item)
    .min(1)
    .transform((items) => items.slice(0, 12)),
  bounties: z
    .array(item)
    .default([])
    .transform((items) => items.slice(0, 5)),
})

export function buildRequestBody(idea: string) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: idea.slice(0, MAX_IDEA_LENGTH) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: RESPONSE_JSON_SCHEMA,
      temperature: 0.7,
    },
  }
}

function errorMessageOf(data: unknown): string {
  const error = (data as { error?: { message?: unknown } } | null)?.error
  return typeof error?.message === 'string' ? error.message : ''
}

export function errorForStatus(status: number, data?: unknown): AiError {
  const message = errorMessageOf(data)
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
    return new AiError('api-disabled')
  }
  if (status === 403) return new AiError('no-permission')
  if (status === 400 && /api key/i.test(message)) return new AiError('invalid-key')
  if (status === 400 || status === 401) return new AiError('invalid-key')
  if (status === 404) return new AiError('model')
  if (status === 429) return new AiError('quota')
  if (status === 503) return new AiError('busy')
  return new AiError('server')
}

const responseSchema = z.object({
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })).optional() }).optional(),
      }),
    )
    .optional(),
})

/** Extrae el JSON que Gemini devolvió como texto, o lanza el error adecuado. */
function extractJson(data: unknown): unknown {
  const response = responseSchema.safeParse(data)
  if (!response.success) throw new AiError('bad-response')
  if (response.data.promptFeedback?.blockReason) throw new AiError('blocked')

  const candidate = response.data.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new AiError('blocked')
  }

  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  try {
    return JSON.parse(text)
  } catch {
    throw new AiError('bad-response')
  }
}

export function parseGeminiResponse(data: unknown): GeneratedPlan {
  const plan = planSchema.safeParse(extractJson(data))
  if (!plan.success) throw new AiError('bad-response')
  return plan.data
}

export function parseDetailResponse(data: unknown): TaskDetailPlan {
  const detail = detailSchema.safeParse(extractJson(data))
  if (!detail.success || (!detail.data.description && detail.data.steps.length === 0)) {
    throw new AiError('bad-response')
  }
  return detail.data
}

function headers(apiKey: string) {
  return { 'x-goog-api-key': apiKey }
}

async function send(request: HttpRequest, options: Parameters<HttpRequest>[0]) {
  try {
    return await request(options)
  } catch {
    throw new AiError('network')
  }
}

function generateUrl(model: string) {
  return `${API_BASE}/${encodeURIComponent(model)}:generateContent`
}

export async function generatePlan(
  request: HttpRequest,
  options: { apiKey: string; model: string; idea: string },
): Promise<GeneratedPlan> {
  const response = await send(request, {
    method: 'POST',
    url: generateUrl(options.model),
    headers: headers(options.apiKey),
    body: buildRequestBody(options.idea),
    timeoutMs: TIMEOUT_MS,
  })
  if (response.status !== 200) throw errorForStatus(response.status, response.data)
  return parseGeminiResponse(response.data)
}

/** Escribe la descripción y los objetivos de una misión que ya existe. */
export async function detailTask(
  request: HttpRequest,
  options: { apiKey: string; model: string; title: string; campaign: string | null; daily: boolean },
): Promise<TaskDetailPlan> {
  const context = [
    `Misión: ${options.title}`,
    options.campaign ? `Campaña a la que pertenece: ${options.campaign}` : null,
    options.daily ? 'Es un hábito diario que se repite todos los días.' : 'Es una misión que se completa una sola vez.',
  ]
    .filter(Boolean)
    .join('\n')

  const response = await send(request, {
    method: 'POST',
    url: generateUrl(options.model),
    headers: headers(options.apiKey),
    body: {
      systemInstruction: { parts: [{ text: DETAIL_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: context }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: DETAIL_JSON_SCHEMA,
        temperature: 0.6,
      },
    },
    timeoutMs: TIMEOUT_MS,
  })
  if (response.status !== 200) throw errorForStatus(response.status, response.data)
  return parseDetailResponse(response.data)
}

/**
 * Hace una generación mínima (unos pocos tokens). Consultar el modelo no basta:
 * una llave puede leer modelos y aun así no tener permiso para generar.
 */
export async function checkConnection(
  request: HttpRequest,
  options: { apiKey: string; model: string },
): Promise<void> {
  const response = await send(request, {
    method: 'POST',
    url: generateUrl(options.model),
    headers: headers(options.apiKey),
    body: {
      contents: [{ role: 'user', parts: [{ text: 'Responde solo: OK' }] }],
      generationConfig: { maxOutputTokens: 16 },
    },
    timeoutMs: 20_000,
  })
  if (response.status !== 200) throw errorForStatus(response.status, response.data)
}
