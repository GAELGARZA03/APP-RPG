import { db } from '../data/appDb'
import type { AiSettings } from '../data/db'
import { getAiSettings } from '../data/settings'
import { isTestBuild } from '../platform/build'
import { getSecret } from '../platform/secrets'
import { GEMINI_KEY_SECRET } from './gemini'

/** Modo ahorro efectivo: lo que eligió el jugador o, si no eligió, activo solo en la app de pruebas. */
export async function saverMode(settings: Pick<AiSettings, 'saver'>): Promise<boolean> {
  return settings.saver ?? (await isTestBuild())
}

/**
 * Llave y modelos configurados, o `null` si aún no hay llave.
 * Con `saver`, las llamadas de diseño usan el modelo rápido sin razonamiento, como al elegir «usar el rápido».
 */
export async function aiSession() {
  const apiKey = await getSecret(GEMINI_KEY_SECRET).catch(() => null)
  if (!apiKey) return null
  const settings = await getAiSettings(db)
  return { apiKey, fastModel: settings.fastModel, mainModel: settings.mainModel, saver: await saverMode(settings) }
}

export type AiSession = NonNullable<Awaited<ReturnType<typeof aiSession>>>
