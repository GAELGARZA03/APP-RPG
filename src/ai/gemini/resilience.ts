// Reintentos, modelo de respaldo y estados que ve el jugador.
import type { HttpRequest } from '../../platform/http'
import { recordFailure, recordSuccess } from '../quota'
import { z } from 'zod'
import {
  type CallOptions,
  buildRequest,
  errorForStatus,
  extractGenerateJson,
  extractInteractionJson,
  send,
} from './transport'
import { AiError } from './types'

export type CallStage = 'start' | 'retry' | 'fallback' | 'done' | 'failed'

/** Lo que está pasando con la llamada, en lenguaje para el jugador (nunca códigos técnicos). */
export interface CallStatus {
  stage: CallStage
  message: string
}

export type StatusListener = (status: CallStatus) => void

/** Opciones comunes a todas las llamadas que pueden reintentarse. */
export interface Resilience {
  /** Recibe cada cambio de etapa para mostrarlo en la interfaz. */
  onStatus?: StatusListener
  /** Modelo para un último intento si el principal sigue saturado. `null`: sin respaldo. */
  fallbackModel?: string | null
  /** `false` para llamadas de fondo que no deben insistir (misión del día). */
  retry?: boolean
}

/** Esperas entre reintentos. Las pruebas las ponen en cero para no tardar. */
export const retryConfig = {
  delaysMs: [1500, 3000, 5000],
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}

export const STATUS_MESSAGES = {
  start: 'Procesando tu solicitud...',
  busy: (attempt: number, total: number) =>
    `Los servidores de IA están un poco saturados, reintentando automáticamente (intento ${attempt} de ${total})...`,
  quota: 'Demasiadas peticiones seguidas, esperando unos segundos para continuar...',
  network: (attempt: number, total: number) =>
    `La conexión falló un momento, reintentando automáticamente (intento ${attempt} de ${total})...`,
  fallback: 'Activando el motor rápido de respaldo para darte respuesta...',
  done: '¡Listo!',
}

function describe(error: AiError, model: string, attempt: string) {
  return `[Gemini] ${attempt} · modelo ${model} · ${error.status === null ? 'sin respuesta HTTP' : `HTTP ${error.status}`} · ${error.kind}`
}

/**
 * Hace la llamada con reintentos automáticos y, si el modelo sigue saturado, un último intento
 * con el modelo de respaldo. Los errores de llave, permiso o formato (400, 401, 403) no se reintentan.
 * Los detalles técnicos van a la consola; al jugador solo le llegan los mensajes de `onStatus`.
 */
export async function callJson(request: HttpRequest, options: CallOptions & Resilience): Promise<unknown> {
  const { onStatus, fallbackModel = null, retry = true, ...call } = options
  const delays = retry ? retryConfig.delaysMs : []
  onStatus?.({ stage: 'start', message: STATUS_MESSAGES.start })

  let last: AiError
  for (let attempt = 0; ; attempt += 1) {
    try {
      const json = await callOnce(request, call)
      onStatus?.({ stage: 'done', message: STATUS_MESSAGES.done })
      return json
    } catch (error) {
      last = error instanceof AiError ? error : new AiError('server')
      if (!last.transient) {
        console.error(describe(last, call.model, `intento ${attempt + 1}, sin reintento`))
        onStatus?.({ stage: 'failed', message: last.message })
        throw last
      }
      console.warn(describe(last, call.model, `intento ${attempt + 1} de ${delays.length + 1}`))
      if (attempt >= delays.length) break

      const message =
        last.kind === 'quota'
          ? STATUS_MESSAGES.quota
          : STATUS_MESSAGES[last.kind === 'network' ? 'network' : 'busy'](attempt + 1, delays.length)
      onStatus?.({ stage: 'retry', message })
      await retryConfig.sleep(delays[attempt])
    }
  }

  // Sin conexión no ayuda cambiar de modelo: el respaldo es solo para saturación o límite de frecuencia.
  if (retry && last.kind !== 'network' && fallbackModel && fallbackModel !== call.model) {
    onStatus?.({ stage: 'fallback', message: STATUS_MESSAGES.fallback })
    try {
      // El respaldo va por generateContent y sin nivel de razonamiento, que no todos los modelos aceptan.
      const json = await callOnce(request, { ...call, model: fallbackModel, thinking: undefined })
      console.warn(`[Gemini] respondió el modelo de respaldo ${fallbackModel} en lugar de ${call.model}`)
      onStatus?.({ stage: 'done', message: STATUS_MESSAGES.done })
      return json
    } catch (error) {
      last = error instanceof AiError ? error : new AiError('server')
      console.error(describe(last, fallbackModel, 'intento de respaldo'))
    }
  }

  const final = last.kind === 'network' ? last : new AiError('overloaded', last.status)
  console.error(describe(final, call.model, 'se agotaron los intentos'))
  onStatus?.({ stage: 'failed', message: final.message })
  throw final
}

async function callOnce(request: HttpRequest, options: CallOptions): Promise<unknown> {
  const { apiKey, ...rest } = options
  const built = buildRequest(rest)
  const response = await send(request, {
    method: 'POST',
    url: built.url,
    // La llave viaja solo en esta cabecera, nunca en la URL ni en el cuerpo.
    headers: { 'x-goog-api-key': apiKey, ...built.headers },
    body: built.body,
    timeoutMs: built.timeoutMs,
  })
  // Cada respuesta alimenta el contador de cuota de su modelo (Ajustes › Inteligencia artificial).
  if (response.status !== 200) {
    recordFailure(options.model, response.status)
    throw errorForStatus(response.status, response.data)
  }
  recordSuccess(options.model)
  return options.thinking ? extractInteractionJson(response.data) : extractGenerateJson(response.data)
}

export function validated<Output>(schema: z.ZodType<Output>, json: unknown): Output {
  const result = schema.safeParse(json)
  if (!result.success) throw new AiError('bad-response')
  return result.data
}
