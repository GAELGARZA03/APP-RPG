import { DEFAULT_GEMINI_MODEL } from '../ai/gemini'
import { DEFAULT_COSMETICS, type CosmeticChoice } from '../game/cosmetics'
import type { AiSettings, BackupInfo, CosmeticSettings, GameDatabase, NotificationSettings } from './db'

/** Lo elegido por el jugador; la app aplica solo lo que está desbloqueado (ver effectiveCosmetics). */
export async function getCosmetics(db: GameDatabase): Promise<CosmeticChoice> {
  const saved = await db.settings.get('cosmetics')
  if (saved?.id !== 'cosmetics') return DEFAULT_COSMETICS
  const { theme, title, sound, crt } = saved
  return { theme, title, sound, crt }
}

export async function saveCosmetics(db: GameDatabase, changes: Partial<CosmeticChoice>): Promise<void> {
  const settings: CosmeticSettings = { id: 'cosmetics', ...(await getCosmetics(db)), ...changes }
  await db.settings.put(settings)
}

export async function getAiSettings(db: GameDatabase): Promise<AiSettings> {
  const saved = await db.settings.get('ai')
  return saved?.id === 'ai' && saved.model.trim() ? saved : { id: 'ai', model: DEFAULT_GEMINI_MODEL }
}

export async function saveAiModel(db: GameDatabase, model: string): Promise<void> {
  const settings: AiSettings = { id: 'ai', model: model.trim() || DEFAULT_GEMINI_MODEL }
  await db.settings.put(settings)
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  id: 'notifications',
  enabled: false,
  morning: '08:00',
  afternoon: '15:00',
  night: '22:30',
  weeklyBackupReminder: true,
}

export async function getNotificationSettings(db: GameDatabase): Promise<NotificationSettings> {
  const saved = await db.settings.get('notifications')
  return saved?.id === 'notifications' ? saved : DEFAULT_NOTIFICATION_SETTINGS
}

export async function saveNotificationSettings(
  db: GameDatabase,
  changes: Partial<Omit<NotificationSettings, 'id'>>,
): Promise<void> {
  const current = await getNotificationSettings(db)
  await db.settings.put({ ...current, ...changes })
}

export async function getLastBackupAt(db: GameDatabase): Promise<string | null> {
  const saved = await db.settings.get('backup')
  return saved?.id === 'backup' ? saved.lastBackupAt : null
}

export async function markBackupDone(db: GameDatabase, at: Date | string): Promise<void> {
  const backup: BackupInfo = {
    id: 'backup',
    lastBackupAt: typeof at === 'string' ? at : at.toISOString(),
  }
  await db.settings.put(backup)
}
