import { db } from '../data/appDb'
import { getDailies, getDailyContext, saveDailies } from '../data/gameStore'
import { gameDayOf } from '../game/gameDay'
import { httpRequest } from '../platform/http'
import { generateDailies } from './gemini'
import { aiSession } from './session'

/**
 * `ready`: ya hay misiones de hoy. `none`: no hay de dónde generarlas (sin llave, sin campañas, hábitos ni habilidades).
 * `failed`: la llamada falló. `waiting`: falló hace poco; se reintenta sola más tarde (o a mano).
 */
export type DailyStatus = 'ready' | 'none' | 'failed' | 'waiting'

/** Intentos automáticos por día de juego y tiempo mínimo entre uno y otro (si Gemini está saturado). */
export const MAX_AUTO_ATTEMPTS = 6
export const AUTO_RETRY_GAP_MS = 20 * 60 * 1000

const ATTEMPTS_KEY = 'daily-attempts'
let inFlight: { day: string; promise: Promise<DailyStatus> } | null = null

interface Attempts {
  day: string
  count: number
  last: number
}

function readAttempts(today: string): Attempts {
  try {
    const saved = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? 'null') as Attempts | null
    if (saved && saved.day === today) return saved
  } catch {
    // Sin almacenamiento o dato dañado: se empieza de cero.
  }
  return { day: today, count: 0, last: 0 }
}

/** ¿Toca un intento automático? Hasta 6 por día, con al menos 20 minutos entre uno y otro. */
function canAutoAttempt(today: string, now: number): boolean {
  const attempts = readAttempts(today)
  return attempts.count < MAX_AUTO_ATTEMPTS && now - attempts.last >= AUTO_RETRY_GAP_MS
}

function markAttempt(today: string, now: number) {
  const attempts = readAttempts(today)
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ day: today, count: attempts.count + 1, last: now }))
  } catch {
    // Sin almacenamiento local: como mucho se reintenta en la siguiente apertura.
  }
}

async function run(now: Date, manual: boolean): Promise<DailyStatus> {
  const today = gameDayOf(now)
  if ((await getDailies(db, today)).length > 0) return 'ready'
  // Si Gemini falló, los intentos automáticos se espacian (el botón de reintentar sí puede repetirla ya).
  if (!manual && !canAutoAttempt(today, now.getTime())) return 'waiting'

  const context = await getDailyContext(db, today)
  if (!context) return 'none'
  const session = await aiSession()
  if (!session) return 'none'

  markAttempt(today, now.getTime())
  try {
    const missions = await generateDailies(httpRequest, {
      apiKey: session.apiKey,
      model: session.fastModel,
      context,
      // Si el modelo está saturado, unos reintentos cortos; si aun así falla, se vuelve a intentar más tarde.
      retry: true,
    })
    await saveDailies(db, missions, { campaignId: context.campaignId, branchId: context.branchId }, now)
    return 'ready'
  } catch {
    return 'failed'
  }
}

/**
 * Genera las tres misiones del día si hace falta (una sola llamada). Las llamadas simultáneas (por ejemplo, el doble
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
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    // Nada que limpiar.
  }
}
