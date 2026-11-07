import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../data/appDb'
import type { NotificationSettings } from '../../data/db'
import { getNotificationSettings, saveNotificationSettings } from '../../data/settings'
import {
  getExactAlarmGranted,
  getNotificationPermission,
  notificationsSupported,
  openExactAlarmSettings,
  requestNotificationPermission,
  sendTestNotification,
  type PermissionState,
} from '../../platform/notifications'
import { isBatteryUnrestricted, requestBatteryUnrestricted } from '../../platform/power'
import { Panel, SmallButton } from '../parts'

interface DeviceStatus {
  permission: PermissionState
  battery: boolean | null
  exact: boolean | null
}

/** Estado de los permisos de Android. Se relee al volver de los ajustes del sistema. */
function useDeviceStatus() {
  const [status, setStatus] = useState<DeviceStatus | null>(null)

  const refresh = useCallback(() => {
    void Promise.all([
      getNotificationPermission().catch((): PermissionState => 'unsupported'),
      isBatteryUnrestricted().catch(() => null),
      getExactAlarmGranted().catch(() => null),
    ]).then(([permission, battery, exact]) => setStatus({ permission, battery, exact }))
  }, [])

  useEffect(() => {
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [refresh])

  return { status, refresh }
}

function Switch(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>{props.label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="size-6 shrink-0 accent-signal"
      />
    </label>
  )
}

function StatusRow(props: { label: string; ok: boolean | null; onFix: () => void }) {
  if (props.ok === null) return null

  return (
    <div className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>
        {props.label}: <span className={props.ok ? 'text-signal' : 'text-ember'}>{props.ok ? 'sí' : 'no'}</span>
      </span>
      {!props.ok && <SmallButton onClick={props.onFix}>Permitir</SmallButton>}
    </div>
  )
}

const TIMES: Array<{ key: 'morning' | 'afternoon' | 'night'; label: string }> = [
  { key: 'morning', label: 'Mañana' },
  { key: 'afternoon', label: 'Tarde' },
  { key: 'night', label: 'Noche' },
]

export function RemindersPanel() {
  const settings = useLiveQuery(() => getNotificationSettings(db), [])
  const { status, refresh } = useDeviceStatus()
  const [message, setMessage] = useState<string | null>(null)

  if (!notificationsSupported) {
    return (
      <Panel label="Recordatorios">
        <p className="text-sm text-muted">Los recordatorios funcionan en la app de Android.</p>
      </Panel>
    )
  }

  if (!settings || !status) return null

  const save = (changes: Partial<Omit<NotificationSettings, 'id'>>) => saveNotificationSettings(db, changes)

  async function ensurePermission(): Promise<boolean> {
    const permission = status?.permission === 'granted' ? 'granted' : await requestNotificationPermission()
    refresh()
    if (permission === 'granted') return true
    setMessage('Android no dio permiso. Actívalo en Ajustes > Aplicaciones > Real Life RPG > Notificaciones.')
    return false
  }

  async function toggle(enabled: boolean) {
    setMessage(null)
    if (enabled && !(await ensurePermission())) return
    await save({ enabled })
  }

  async function test() {
    if (!(await ensurePermission())) return
    await sendTestNotification()
    setMessage('La notificación de prueba llegará en 5 segundos. Puedes bloquear la pantalla.')
  }

  const permissionLost = settings.enabled && status.permission !== 'granted'

  return (
    <Panel label="Recordatorios">
      <Switch label="Trilogía diaria" checked={settings.enabled} onChange={(checked) => void toggle(checked)} />

      {permissionLost && (
        <p className="mb-2 text-sm text-ember">
          Las notificaciones están bloqueadas en Android. Actívalas en Ajustes &gt; Aplicaciones &gt; Real Life RPG.
        </p>
      )}

      <div className="my-2 flex flex-col gap-2">
        {TIMES.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm">
            {label}
            <input
              type="time"
              value={settings[key]}
              disabled={!settings.enabled}
              onChange={(event) => event.target.value && void save({ [key]: event.target.value })}
              className="min-h-11 w-40 rounded-md border border-line bg-void px-3 text-base text-ink disabled:opacity-40"
            />
          </label>
        ))}
      </div>

      <Switch
        label="Respaldo semanal (domingo 20:00)"
        checked={settings.weeklyBackupReminder}
        onChange={(checked) => void save({ weeklyBackupReminder: checked })}
      />

      <div className="mt-2 border-t border-line pt-2">
        <StatusRow label="Batería sin límites" ok={status.battery} onFix={() => void requestBatteryUnrestricted()} />
        <StatusRow label="Hora exacta" ok={status.exact} onFix={() => void openExactAlarmSettings()} />
      </div>

      <div className="mt-2">
        <SmallButton onClick={() => void test()}>Probar notificación</SmallButton>
      </div>

      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </Panel>
  )
}
