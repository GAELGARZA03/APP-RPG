import { Capacitor } from '@capacitor/core'
import { LocalNotifications, Weekday, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { NotificationSettings } from '../data/db'

export const notificationsSupported = Capacitor.isNativePlatform()

const CHANNEL_ID = 'recordatorios'
const TEST_NOTIFICATION_ID = 99

const DAILY_SLOTS = [
  {
    id: 1,
    key: 'morning',
    title: 'Misión del día',
    body: 'Revisa tus hábitos de hoy y elige tu primera victoria.',
  },
  {
    id: 2,
    key: 'afternoon',
    title: 'Checkpoint',
    body: '¿Cómo van tus campañas? Completa una Side Quest antes de que acabe el día.',
  },
  {
    id: 3,
    key: 'night',
    title: 'Cierre del día',
    body: 'Registra lo que completaste antes de dormir para cuidar tu racha.',
  },
] as const

const WEEKLY_BACKUP = {
  id: 4,
  title: 'Respaldo semanal',
  body: 'Exporta un respaldo de tu progreso desde Ajustes.',
  schedule: { weekday: Weekday.Sunday, hour: 20, minute: 0 },
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function getNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported'
  const { display } = await LocalNotifications.checkPermissions()
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported'
  const { display } = await LocalNotifications.requestPermissions()
  return display === 'granted' ? 'granted' : 'denied'
}

async function ensureChannel() {
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Recordatorios diarios',
    description: 'Mañana, tarde y noche, más el recordatorio de respaldo.',
    importance: 4,
    visibility: 1,
  })
}

function notification(
  id: number,
  title: string,
  body: string,
  on: { hour: number; minute: number; weekday?: Weekday },
): LocalNotificationSchema {
  return { id, title, body, channelId: CHANNEL_ID, schedule: { on, allowWhileIdle: true } }
}

function parseTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return { hour, minute }
}

/** Reprograma todo desde cero según los ajustes guardados. */
export async function applyNotificationSettings(
  settings: NotificationSettings,
): Promise<'scheduled' | 'off' | 'no-permission' | 'unsupported'> {
  if (!notificationsSupported) return 'unsupported'

  // Solo se reemplazan los recordatorios fijos; la notificación de prueba no se toca.
  const recurringIds = [...DAILY_SLOTS.map((slot) => slot.id), WEEKLY_BACKUP.id]
  await LocalNotifications.cancel({ notifications: recurringIds.map((id) => ({ id })) })

  if (!settings.enabled) return 'off'
  if ((await getNotificationPermission()) !== 'granted') return 'no-permission'

  await ensureChannel()
  const notifications = DAILY_SLOTS.map((slot) =>
    notification(slot.id, slot.title, slot.body, parseTime(settings[slot.key])),
  )
  if (settings.weeklyBackupReminder) {
    notifications.push(notification(WEEKLY_BACKUP.id, WEEKLY_BACKUP.title, WEEKLY_BACKUP.body, WEEKLY_BACKUP.schedule))
  }

  await LocalNotifications.schedule({ notifications })
  return 'scheduled'
}

export async function sendTestNotification(): Promise<void> {
  await ensureChannel()
  await LocalNotifications.schedule({
    notifications: [
      {
        id: TEST_NOTIFICATION_ID,
        title: 'Prueba de Real Life RPG',
        body: 'Así se verán tus recordatorios.',
        channelId: CHANNEL_ID,
        schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
      },
    ],
  })
}

/** Android 12+ pide un permiso aparte para que las alarmas suenen a la hora exacta. */
export async function getExactAlarmGranted(): Promise<boolean | null> {
  if (Capacitor.getPlatform() !== 'android') return null
  const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
  return exact_alarm === 'granted'
}

export async function openExactAlarmSettings(): Promise<void> {
  await LocalNotifications.changeExactNotificationSetting()
}

/** Los recordatorios de hábitos usan los ids 1000 a 1999: así se reemplazan sin tocar los fijos. */
const HABIT_IDS = { from: 1000, to: 1999 }

/**
 * Reprograma los recordatorios de hábitos según el plan (los próximos 7 días). Los de un día en que el hábito
 * ya se marcó no están en el plan, así que quedan cancelados.
 */
export async function scheduleHabitReminders(
  plan: Array<{ title: string; emoji?: string; at: Date[] }>,
): Promise<'scheduled' | 'no-permission' | 'unsupported'> {
  if (!notificationsSupported) return 'unsupported'
  const pending = await LocalNotifications.getPending()
  const old = pending.notifications.filter((item) => item.id >= HABIT_IDS.from && item.id <= HABIT_IDS.to)
  if (old.length > 0) await LocalNotifications.cancel({ notifications: old.map(({ id }) => ({ id })) })

  const total = plan.reduce((sum, item) => sum + item.at.length, 0)
  if (total === 0) return 'scheduled'
  let permission = await getNotificationPermission()
  if (permission === 'prompt') permission = await requestNotificationPermission()
  if (permission !== 'granted') return 'no-permission'

  await ensureChannel()
  let id = HABIT_IDS.from
  const notifications: LocalNotificationSchema[] = []
  for (const item of plan) {
    for (const at of item.at) {
      if (id > HABIT_IDS.to) break
      notifications.push({
        id: id++,
        title: `${item.emoji ? `${item.emoji} ` : ''}${item.title}`,
        body: 'Tu hábito de hoy te espera. Márcalo en la app para cuidar tu racha.',
        channelId: CHANNEL_ID,
        schedule: { at, allowWhileIdle: true },
      })
    }
  }
  await LocalNotifications.schedule({ notifications })
  return 'scheduled'
}
