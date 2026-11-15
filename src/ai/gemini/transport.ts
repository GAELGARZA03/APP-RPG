// Transporte: arma la petición para cada API y extrae el JSON de la respuesta.
import type { HttpRequest } from '../../platform/http'
import { z } from 'zod'
import { API_ROOT, AiError, FAST_TIMEOUT_MS, THINKING_TIMEOUT_MS, type ThinkingLevel } from './types'

function errorMessageOf(data: unknown): string {
  const error = (data as { error?: { message?: unknown } } | null)?.error
  return typeof error?.message === 'string' ? error.message : ''
}

export function errorForStatus(status: number, data?: unknown): AiError {
  const message = errorMessageOf(data)
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
    return new AiError('api-disabled', status)
  }
  if (status === 403) return new AiError('no-permission', status)
  if (status === 401 || (status === 400 && /api.?key/i.test(message))) return new AiError('invalid-key', status)
  // Un 400 sin mención de la llave es un parámetro que el modelo no acepta (por ejemplo, el razonamiento).
  if (status === 400) return new AiError(message ? 'bad-request' : 'invalid-key', status)
  if (status === 404) return new AiError('model', status)
  if (status === 429) return new AiError('quota', status)
  if (status === 503) return new AiError('busy', status)
  return new AiError('server', status)
}

const generateResponseSchema = z.object({
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

const interactionResponseSchema = z.object({
  status: z.string().optional(),
  steps: z
    .array(
      z.object({
        type: z.string().optional(),
        content: z.array(z.object({ type: z.string().optional(), text: z.string().optional() })).optional(),
      }),
    )
    .optional(),
})

function parseJsonText(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new AiError('bad-response')
  }
}

/** Extrae el JSON que `generateContent` devolvió como texto, o lanza el error adecuado. */
export function extractGenerateJson(data: unknown): unknown {
  const response = generateResponseSchema.safeParse(data)
  if (!response.success) throw new AiError('bad-response')
  if (response.data.promptFeedback?.blockReason) throw new AiError('blocked')

  const candidate = response.data.candidates?.[0]
  if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'PROHIBITED_CONTENT') {
    throw new AiError('blocked')
  }
  return parseJsonText(candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '')
}

/** Extrae el JSON de una respuesta de la API Interactions (pasos `thought` y `model_output`). */
export function extractInteractionJson(data: unknown): unknown {
  const response = interactionResponseSchema.safeParse(data)
  // `incomplete`: el modelo agotó sus tokens pensando y no terminó la respuesta.
  if (!response.success || (response.data.status && response.data.status !== 'completed')) {
    throw new AiError('bad-response')
  }
  const output = (response.data.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .map((block) => block.text ?? '')
    .join('')
  return parseJsonText(output)
}

export interface CallOptions {
  apiKey: string
  model: string
  system: string
  input: string
  schema: object
  /** Con nivel de razonamiento se usa la API Interactions, que es donde Google lo documenta. */
  thinking?: ThinkingLevel
  temperature?: number
}

/** Cuerpo de la petición; se exporta para probar que el esquema y el razonamiento siempre viajan. */
export function buildRequest(options: Omit<CallOptions, 'apiKey'>): {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  timeoutMs: number
} {
  if (options.thinking) {
    return {
      url: `${API_ROOT}/interactions`,
      headers: { 'Api-Revision': '2026-05-20' },
      body: {
        model: options.model,
        system_instruction: options.system,
        input: options.input,
        // No hace falta que Google guarde la conversación: cada llamada es independiente.
        store: false,
        generation_config: { thinking_level: options.thinking },
        response_format: { type: 'text', mime_type: 'application/json', schema: options.schema },
      },
      timeoutMs: THINKING_TIMEOUT_MS,
    }
  }
  return {
    url: `${API_ROOT}/models/${encodeURIComponent(options.model)}:generateContent`,
    headers: {},
    body: {
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{ role: 'user', parts: [{ text: options.input }] }],
      generationConfig: {
        // Sin el esquema, el modelo inventa su propia estructura: nunca se quita.
        responseMimeType: 'application/json',
        responseJsonSchema: options.schema,
        temperature: options.temperature ?? 0.7,
      },
    },
    timeoutMs: FAST_TIMEOUT_MS,
  }
}

export async function send(request: HttpRequest, options: Parameters<HttpRequest>[0]) {
  try {
    return await request(options)
  } catch {
    throw new AiError('network')
  }
}
