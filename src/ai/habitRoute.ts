import { httpRequest } from '../platform/http'
import { AiError, generateHabitRoute, type RoutePlan, type StatusListener } from './gemini'
import { aiSession } from './session'

/**
 * Pide a la IA la ruta de hábitos (sin guardarla: el jugador la revisa antes).
 * Usa el modelo principal con razonamiento medio; con el modo ahorro o `fast`, el rápido.
 */
export async function planHabitRoute(
  wishes: string,
  context: string,
  options: { fast?: boolean; onStatus?: StatusListener } = {},
): Promise<RoutePlan> {
  const session = await aiSession()
  if (!session) throw new AiError('invalid-key')
  const fast = Boolean(options.fast) || session.saver
  return generateHabitRoute(httpRequest, {
    apiKey: session.apiKey,
    model: fast ? session.fastModel : session.mainModel,
    thinking: fast ? undefined : 'medium',
    fallbackModel: fast ? null : session.fastModel,
    onStatus: options.onStatus,
    wishes,
    context,
  })
}
