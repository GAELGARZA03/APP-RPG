import { useSyncExternalStore } from 'react'

/**
 * Contador local de llamadas a Gemini por modelo, para saber cuántas quedan hoy sin abrir
 * Google AI Studio. Es una estimación: Google no expone la cuota restante, así que aquí se
 * cuenta lo que hace esta app y el jugador puede corregirlo a mano.
 */

export type ModelStatus =
  | 'unknown'
  | 'available'
  /** El contador local llegó al límite diario. */
  | 'exhausted'
  /** Un 429 con cuota diaria de sobra: es el límite por minuto. */
  | 'rate-limited'
  /** Un 503: el modelo está saturado por ahora. */
  | 'busy'
  /** La cuenta no lo ofrece (no aparece en la lista de modelos). */
  | 'unavailable'

export interface ModelQuota {
  id: string
  name: string
  /** Llamadas por día del nivel gratuito. Editable: Google no publica este dato por modelo. */
  dailyLimit: number
  perMinute: number
  usedToday: number
  status: ModelStatus
}

export interface QuotaState {
  /** Día al que corresponden los contadores (hora del Pacífico, que es cuando Google los reinicia). */
  day: string
  /** Última vez que se consultó la lista de modelos, en ISO; `null` si nunca. */
  lastChecked: string | null
  models: ModelQuota[]
}

/** Valores iniciales del nivel gratuito, dados por el usuario. Se pueden corregir desde Ajustes. */
export const DEFAULT_MODELS: ReadonlyArray<Pick<ModelQuota, 'id' | 'name' | 'dailyLimit' | 'perMinute'>> = [
  { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen', dailyLimit: 20, perMinute: 5 },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', dailyLimit: 20, perMinute: 5 },
  { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', dailyLimit: 20, perMinute: 5 },
  { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', dailyLimit: 500, perMinute: 15 },
]

const STORAGE_KEY = 'gemini-quota'

/** La cuota diaria de Gemini se reinicia a medianoche del Pacífico, no a la hora local. */
export function quotaDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now)
}

function fresh(now: Date): QuotaState {
  return {
    day: quotaDay(now),
    lastChecked: null,
    models: DEFAULT_MODELS.map((model) => ({ ...model, usedToday: 0, status: 'unknown' })),
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function isModel(value: unknown): value is ModelQuota {
  const model = value as ModelQuota | null
  return (
    typeof model?.id === 'string' &&
    typeof model.name === 'string' &&
    Number.isFinite(model.dailyLimit) &&
    Number.isFinite(model.perMinute) &&
    Number.isFinite(model.usedToday) &&
    typeof model.status === 'string'
  )
}

function load(now: Date): QuotaState {
  try {
    const saved = JSON.parse(storage()?.getItem(STORAGE_KEY) ?? 'null') as QuotaState | null
    if (saved && typeof saved.day === 'string' && Array.isArray(saved.models) && saved.models.every(isModel)) {
      // Si se agregó un modelo a la lista inicial después de guardar, aparece también.
      const missing = DEFAULT_MODELS.filter((model) => !saved.models.some((item) => item.id === model.id))
      return {
        day: saved.day,
        lastChecked: typeof saved.lastChecked === 'string' ? saved.lastChecked : null,
        models: [...saved.models, ...missing.map((model) => ({ ...model, usedToday: 0, status: 'unknown' as const }))],
      }
    }
  } catch {
    // Datos dañados: se empieza de cero.
  }
  return fresh(now)
}

let state: QuotaState | null = null
const listeners = new Set<() => void>()

/** Al cambiar el día se reinician los contadores; los estados pasajeros dejan de valer. */
function current(now = new Date()): QuotaState {
  state ??= load(now)
  if (state.day !== quotaDay(now)) {
    state = {
      ...state,
      day: quotaDay(now),
      models: state.models.map((model) => ({
        ...model,
        usedToday: 0,
        status: model.status === 'unavailable' ? 'unavailable' : 'unknown',
      })),
    }
    persist()
  }
  return state
}

function persist() {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Sin almacenamiento: el contador dura lo que dure la app abierta.
  }
  listeners.forEach((listener) => listener())
}

function update(modelId: string, change: (model: ModelQuota) => ModelQuota, now = new Date()) {
  const base = current(now)
  // Un modelo que no está en la lista (por ejemplo, uno escrito a mano en Ajustes) se empieza a contar al usarlo.
  const models = base.models.some((model) => model.id === modelId)
    ? base.models
    : [...base.models, { id: modelId, name: modelId, dailyLimit: 0, perMinute: 0, usedToday: 0, status: 'unknown' as const }]
  state = { ...base, models: models.map((model) => (model.id === modelId ? change(model) : model)) }
  persist()
}

const exhausted = (model: ModelQuota) => model.dailyLimit > 0 && model.usedToday >= model.dailyLimit

export function getQuota(now = new Date()): QuotaState {
  return current(now)
}

/** Llamadas que quedan hoy; `null` si no se conoce el límite de ese modelo. */
export function remaining(model: ModelQuota): number | null {
  return model.dailyLimit > 0 ? Math.max(0, model.dailyLimit - model.usedToday) : null
}

/** Una petición respondida con éxito cuenta contra la cuota de su modelo. */
export function recordSuccess(modelId: string, now = new Date()) {
  update(
    modelId,
    (model) => {
      const next = { ...model, usedToday: model.usedToday + 1 }
      return { ...next, status: exhausted(next) ? 'exhausted' : 'available' }
    },
    now,
  )
}

/**
 * Un 429 solo significa «agotado por hoy» si el contador ya llegó al límite; con cuota de sobra
 * es el límite por minuto. Un 503 es saturación pasajera. Los demás errores no dicen nada de la cuota.
 */
export function recordFailure(modelId: string, httpStatus: number | null, now = new Date()) {
  if (httpStatus === 429) {
    update(modelId, (model) => ({ ...model, status: exhausted(model) ? 'exhausted' : 'rate-limited' }), now)
  } else if (httpStatus === 503) {
    update(modelId, (model) => ({ ...model, status: exhausted(model) ? 'exhausted' : 'busy' }), now)
  }
}

/** Ajuste manual, por si se usó la llave desde otra herramienta. */
export function setUsedToday(modelId: string, used: number, now = new Date()) {
  update(
    modelId,
    (model) => {
      const next = { ...model, usedToday: Math.max(0, Math.min(100_000, Math.round(used) || 0)) }
      const status = exhausted(next) ? 'exhausted' : model.status === 'exhausted' ? 'unknown' : model.status
      return { ...next, status }
    },
    now,
  )
}

export function setDailyLimit(modelId: string, limit: number, now = new Date()) {
  update(
    modelId,
    (model) => {
      const next = { ...model, dailyLimit: Math.max(0, Math.min(100_000, Math.round(limit) || 0)) }
      const status = exhausted(next) ? 'exhausted' : model.status === 'exhausted' ? 'unknown' : model.status
      return { ...next, status }
    },
    now,
  )
}

/** Resultado de «Actualizar estado»: qué modelos ofrece la cuenta. No cambia los contadores. */
export function applyAvailability(availableIds: ReadonlyArray<string>, now = new Date()) {
  const base = current(now)
  const available = new Set(availableIds)
  state = {
    ...base,
    lastChecked: now.toISOString(),
    models: base.models.map((model) => ({
      ...model,
      status: !available.has(model.id) ? 'unavailable' : exhausted(model) ? 'exhausted' : 'available',
    })),
  }
  persist()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function useQuota(): QuotaState {
  return useSyncExternalStore(subscribe, () => current())
}

/** Solo para pruebas: olvida lo guardado. */
export function resetQuota() {
  state = null
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nada que borrar.
  }
}
