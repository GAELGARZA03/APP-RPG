import { db } from '../data/appDb'
import { getAiSettings } from '../data/settings'
import { getSecret } from '../platform/secrets'
import { GEMINI_KEY_SECRET } from './gemini'

/** Llave y modelos configurados, o `null` si aún no hay llave. */
export async function aiSession() {
  const apiKey = await getSecret(GEMINI_KEY_SECRET).catch(() => null)
  if (!apiKey) return null
  const { fastModel, mainModel } = await getAiSettings(db)
  return { apiKey, fastModel, mainModel }
}

export type AiSession = NonNullable<Awaited<ReturnType<typeof aiSession>>>
