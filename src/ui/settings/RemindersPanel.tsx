import { useLiveQuery } from 'dexie-react-hooks'
import { BellRing, Check } from 'lucide-react'
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
import { Badge } from '../kit/Badge'
import { Button } from '../kit/Button'
import { Card } from '../kit/Card'
import { Input, SettingRow, Switch } from '../kit/controls'

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

function PermissionRow(props: { label: string; description: string; ok: boolean | null; onFix: () => void }) {
  if (props.ok === null) return null

  return (
    <SettingRow label={props.label} description={props.description}>
      {props.ok ? (
        <Badge tone="signal">
          <Check aria-hidden />
          Listo
        </Badge>
      ) : (
        <Button size="sm" variant="outline" onClick={props.onFix}>
          Permitir
        </Button>
      )}
    </SettingRow>
  )
}

const TIMES: Array<{ key: 'morning' | 'afternoon' | 'night'; label: string }> = [
  { key: 'morning', label: 'Mañana' },
  { key: 'afternoon', label: 'Tarde' },
  { key: 'night', label: 'Noche' },
]

export function RemindersPanel({ embedded, headingId }: { embedded?: boolean; headingId?: string } = {}) {
  const settings = useLiveQuery(() => getNotificationSettings(db), [])
  const { status, refresh } = useDeviceStatus()
  const [message, setMessage] = useState<string | null>(null)

  if (!notificationsSupported) {
    return (
      <Card embedded={embedded} headingId={headingId} label="Recordatorios" icon={BellRing}>
        <p className="text-sm text-muted">Los recordatorios funcionan en la app de Android.</p>
      </Card>
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
    <Card embedded={embedded} headingId={headingId} label="Recordatorios" icon={BellRing}>
      <SettingRow label="Trilogía diaria" description="Avisos en la mañana, la tarde y la noche">
        <Switch label="Trilogía diaria" checked={settings.enabled} onChange={(checked) => void toggle(checked)} />
      </SettingRow>

      {permissionLost && (
        <p className="mb-2 text-sm text-ember">
          Las notificaciones están bloqueadas en Android. Actívalas en Ajustes &gt; Aplicaciones &gt; Real Life RPG.
        </p>
      )}

      <div className="my-2 flex flex-col gap-2">
        {TIMES.map(({ key, label }) => (
          <label key={key} className="flex items-center justify-between gap-3 text-sm">
            {label}
            <Input
              type="time"
              value={settings[key]}
              disabled={!settings.enabled}
              onChange={(event) => event.target.value && void save({ [key]: event.target.value })}
              className="w-40"
            />
          </label>
        ))}
      </div>

      <SettingRow label="Respaldo semanal" description="Domingo a las 20:00">
        <Switch
          label="Respaldo semanal"
          checked={settings.weeklyBackupReminder}
          onChange={(checked) => void save({ weeklyBackupReminder: checked })}
        />
      </SettingRow>

      <div className="mt-2 border-t border-line pt-2">
        <PermissionRow
          label="Batería sin límites"
          description="Para que Samsung no retrase los avisos"
          ok={status.battery}
          onFix={() => void requestBatteryUnrestricted()}
        />
        <PermissionRow
          label="Hora exacta"
          description="Para que lleguen a la hora indicada"
          ok={status.exact}
          onFix={() => void openExactAlarmSettings()}
        />
      </div>

      <Button size="sm" onClick={() => void test()} className="mt-2">
        Probar notificación
      </Button>

      {message && <p className="mt-3 text-sm text-muted">{message}</p>}
    </Card>
  )
}
