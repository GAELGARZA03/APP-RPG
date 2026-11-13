import { db } from '../data/appDb'
import { getDaily, getDailyContext, saveDaily } from '../data/gameStore'
import { gameDayOf } from '../game/gameDay'
import { httpRequest } from '../platform/http'
import { generateDaily } from './gemini'
import { aiSession } from './session'

/**
 * `ready`: ya hay misión de hoy. `none`: no hay de dónde generarla (sin llave, sin campañas ni habilidades).
 * `failed`: la llamada falló; se puede reintentar a mano. `waiting`: ya se intentó hoy y no se repite sola.
 */
export type DailyStatus = 'ready' | 'none' | 'failed' | 'waiting'

const ATTEMPT_KEY = 'daily-attempt-day'
let inFlight: { day: string; promise: Promise<DailyStatus> } | null = null

function attemptedToday(today: string): boolean {
  try {
    return localStorage.getItem(ATTEMPT_KEY) === today
  } catch {
    return false
  }
}

function markAttempt(today: string) {
  try {
    localStorage.setItem(ATTEMPT_KEY, today)
  } catch {
    // Sin almacenamiento local: como mucho se reintenta en la siguiente apertura.
  }
}

async function run(now: Date, manual: boolean): Promise<DailyStatus> {
  const today = gameDayOf(now)
  if (await getDaily(db, today)) return 'ready'
  // Una sola llamada automática por día de juego; el botón de reintentar sí puede repetirla.
  if (!manual && attemptedToday(today)) return 'waiting'

  const context = await getDailyContext(db, today)
  if (!context) return 'none'
  const session = await aiSession()
  if (!session) return 'none'

  markAttempt(today)
  try {
    const plan = await generateDaily(httpRequest, {
      apiKey: session.apiKey,
      model: session.fastModel,
      context,
      // Es una llamada de fondo y sigue siendo una sola por día: si falla, se ofrece reintentar a mano.
      retry: false,
    })
    await saveDaily(db, { ...plan, campaignId: context.campaignId, branchId: context.branchId }, now)
    return 'ready'
  } catch {
    return 'failed'
  }
}

/**
 * Genera la misión del día si hace falta. Las llamadas simultáneas (por ejemplo, el doble
 * montaje de React o abrir la app dos veces seguidas) comparten la misma petición.
 */
export function ensureDailyMission(now = new Date(), manual = false): Promise<DailyStatus> {
  // Si el día de juego cambió (4:00 a. m.) mientras había una petición, la del día nuevo va aparte.
  const day = gameDayOf(now)
  if (inFlight?.day === day) return inFlight.promise
  const promise = run(now, manual).finally(() => {
    if (inFlight?.promise === promise) inFlight = null
  })
  inFlight = { day, promise }
  return promise
}

/** Solo para pruebas. */
export function resetDailyAttempts() {
  inFlight = null
  try {
    localStorage.removeItem(ATTEMPT_KEY)
  } catch {
    // Nada que limpiar.
  }
}
