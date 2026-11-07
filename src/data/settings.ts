import { DEFAULT_GEMINI_MODEL } from '../ai/gemini'
import type { AiSettings, BackupInfo, GameDatabase, NotificationSettings } from './db'

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
