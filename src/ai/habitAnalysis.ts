// Análisis a fondo de un hábito: junta su historial, llama al modelo rápido una vez y guarda el resultado en el hábito.
import { db } from '../data/appDb'
import type { HabitAnalysis } from '../data/db'
import { habitAnalysisInput } from '../data/gameStore'
import type { GameDay } from '../game/gameDay'
import { httpRequest } from '../platform/http'
import { AiError, analyzeHabit, type StatusListener } from './gemini'
import { aiSession } from './session'

export async function runHabitAnalysis(
  habitId: string,
  today: GameDay,
  onStatus?: StatusListener,
  now = new Date(),
): Promise<HabitAnalysis> {
  const session = await aiSession()
  if (!session) throw new AiError('invalid-key')
  const input = await habitAnalysisInput(db, habitId, today)
  if (!input) throw new AiError('bad-response')
  // Siempre el modelo rápido: es un consejo, no hace falta el modelo principal.
  const plan = await analyzeHabit(httpRequest, { apiKey: session.apiKey, model: session.fastModel, input, onStatus })
  const analysis: HabitAnalysis = {
    createdAt: now.getTime(),
    model: session.fastModel,
    summary: plan.summary,
    points: plan.points.map(({ title, text, principle }) => ({ title, text, ...(principle ? { principle } : {}) })),
  }
  await db.habits.update(habitId, { analysis })
  return analysis
}
