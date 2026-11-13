import { DEFAULT_FAST_MODEL, DEFAULT_MAIN_MODEL } from '../ai/models'
import { DEFAULT_COSMETICS, type CosmeticChoice } from '../game/cosmetics'
import type {
  AiSettings,
  BackupInfo,
  CosmeticSettings,
  GameDatabase,
  NotificationSettings,
  PrefsSettings,
  ProfileSettings,
} from './db'

export const DEFAULT_PROFILE: ProfileSettings = { id: 'profile', name: '', photo: null }

export async function getProfile(db: GameDatabase): Promise<ProfileSettings> {
  const saved = await db.settings.get('profile')
  return saved?.id === 'profile' ? saved : DEFAULT_PROFILE
}

export async function saveProfile(
  db: GameDatabase,
  changes: Partial<Omit<ProfileSettings, 'id'>>,
): Promise<void> {
  const profile: ProfileSettings = { ...(await getProfile(db)), ...changes }
  await db.settings.put(profile)
}

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
  const stored = saved?.id === 'ai' ? saved : null
  return {
    id: 'ai',
    fastModel: stored?.fastModel?.trim() || DEFAULT_FAST_MODEL,
    mainModel: stored?.mainModel?.trim() || DEFAULT_MAIN_MODEL,
  }
}

export async function saveAiModels(
  db: GameDatabase,
  changes: Partial<Pick<AiSettings, 'fastModel' | 'mainModel'>>,
): Promise<void> {
  const current = await getAiSettings(db)
  const settings: AiSettings = {
    id: 'ai',
    fastModel: (changes.fastModel ?? current.fastModel).trim() || DEFAULT_FAST_MODEL,
    mainModel: (changes.mainModel ?? current.mainModel).trim() || DEFAULT_MAIN_MODEL,
  }
  await db.settings.put(settings)
}

export const DEFAULT_PREFS: PrefsSettings = { id: 'prefs', haptics: true }

export async function getPrefs(db: GameDatabase): Promise<PrefsSettings> {
  const saved = await db.settings.get('prefs')
  return saved?.id === 'prefs' ? saved : DEFAULT_PREFS
}

export async function savePrefs(db: GameDatabase, changes: Partial<Omit<PrefsSettings, 'id'>>): Promise<void> {
  await db.settings.put({ ...(await getPrefs(db)), ...changes })
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
