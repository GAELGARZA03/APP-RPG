import { db } from '../data/appDb'
import type { WeeklyReview } from '../data/db'
import { getReview, getWeekReport, planToReview, saveReview } from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { httpRequest } from '../platform/http'
import { AiError, generateWeeklyReview, type StatusListener } from './gemini'
import { aiSession } from './session'

/**
 * Genera y guarda la revisión de una semana; si ya existe, devuelve la guardada sin llamar a la IA.
 * `fast`: el jugador eligió el modelo rápido tras un error (o está activo el modo ahorro).
 */
export async function createWeeklyReview(
  weekStart: GameDay,
  options: { fast?: boolean; onStatus?: StatusListener } = {},
): Promise<WeeklyReview> {
  const saved = await getReview(db, weekStart)
  if (saved) return saved

  const session = await aiSession()
  if (!session) throw new AiError('invalid-key')
  const fast = Boolean(options.fast) || session.saver
  const report = await getWeekReport(db, weekStart)
  const model = fast ? session.fastModel : session.mainModel
  const plan = await generateWeeklyReview(httpRequest, {
    apiKey: session.apiKey,
    model,
    // Es una llamada por semana: la calidad importa más que el costo.
    thinking: fast ? undefined : 'medium',
    fallbackModel: fast ? null : session.fastModel,
    onStatus: options.onStatus,
    report,
  })
  const review = planToReview(plan, report, model)
  // Si mientras tanto se guardó otra (por ejemplo, en otra pestaña), se conserva la primera.
  const existing = await getReview(db, weekStart)
  if (existing) return existing
  await saveReview(db, review)
  return review
}
