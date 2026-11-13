import { Capacitor } from '@capacitor/core'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BellRing,
  ChevronRight,
  Cpu,
  DatabaseBackup,
  Pencil,
  RotateCcw,
  ScrollText,
  Sparkles,
  Vibrate,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { GEMINI_KEY_SECRET } from '../../ai/gemini'
import { db } from '../../data/appDb'
import type { Hud } from '../../data/gameStore'
import { getLastBackupAt, getNotificationSettings, getPrefs, getProfile, savePrefs } from '../../data/settings'
import { haptic, setHapticsEnabled } from '../../platform/haptics'
import { baseXp, type Difficulty } from '../../game/rules'
import { getSecret } from '../../platform/secrets'
import { Avatar } from '../kit/Avatar'
import { Button } from '../kit/Button'
import { Card, cardSurface } from '../kit/Card'
import { cn } from '../kit/cn'
import { Switch } from '../kit/controls'
import { Sheet } from '../Sheet'
import { BackupPanel } from './BackupPanel'
import { GeminiPanel } from './GeminiPanel'
import { RemindersPanel } from './RemindersPanel'
import { ResetPanel } from './ResetPanel'

export type SettingsSection = 'reminders' | 'backup' | 'ai' | 'rules' | 'about' | 'reset'

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5]

const RULES = [
  'Completa todos tus contratos diarios para sumar un día de racha.',
  'Cada día de racha da +5% de XP en contratos, hasta +50%.',
  'Fallar un día reduce la racha a la mitad.',
  'El día cierra a las 4:00 a. m.',
  'En una campaña solo está abierto el primer acto sin terminar; nunca se bloquea por tu nivel.',
  'La misión jefe da el doble de XP y pide una foto o una nota como evidencia.',
  'Saltar una misión («Ya sé hacer esto») cuenta para avanzar, pero no da XP.',
  'La misión del día da 50% más de XP y no afecta tu racha.',
]

function RulesPanel({ headingId }: { headingId: string }) {
  return (
    <Card embedded headingId={headingId} label="Reglas del juego" icon={ScrollText}>
      <div className="mb-4 grid grid-cols-5 gap-1.5">
        {DIFFICULTIES.map((difficulty) => (
          <div key={difficulty} className="rounded-2xl border border-white/[0.06] bg-void/50 py-2 text-center">
            <p className="font-display text-base font-bold text-info">{difficulty}</p>
            <p className="text-[10px] text-muted">{baseXp(difficulty)} XP</p>
          </div>
        ))}
      </div>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted marker:text-signal">
        {RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </Card>
  )
}

function AboutPanel({ headingId }: { headingId: string }) {
  return (
    <Card embedded headingId={headingId} label="Acerca de" icon={Cpu}>
      <p className="text-sm text-muted">
        Real Life RPG · plataforma <span className="text-ink">{Capacitor.getPlatform()}</span>
      </p>
      <p className="mt-2 text-sm text-muted">Tus datos se guardan solo en este teléfono.</p>
    </Card>
  )
}

/** Hoja con el contenido de una sección de Ajustes. */
export function SettingsSectionSheet({ section, onClose }: { section: SettingsSection; onClose: () => void }) {
  const headingId = useId()

  return (
    <Sheet labelledBy={headingId} focusSheet onClose={onClose}>
      {section === 'reminders' && <RemindersPanel embedded headingId={headingId} />}
      {section === 'backup' && <BackupPanel embedded headingId={headingId} />}
      {section === 'ai' && <GeminiPanel embedded headingId={headingId} />}
      {section === 'rules' && <RulesPanel headingId={headingId} />}
      {section === 'about' && <AboutPanel headingId={headingId} />}
      {section === 'reset' && <ResetPanel headingId={headingId} onDone={onClose} />}
      <Button onClick={onClose} className="mt-5 w-full">
        Listo
      </Button>
    </Sheet>
  )
}

function MenuRow(props: { icon: LucideIcon; tone: string; label: string; summary: string; onClick: () => void }) {
  const Icon = props.icon
  return (
    <motion.button
      type="button"
      onClick={props.onClick}
      whileTap={{ scale: 0.98 }}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.04]"
    >
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-2xl', props.tone)}>
        <Icon aria-hidden className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{props.label}</span>
        <span className="block truncate text-sm text-muted">{props.summary}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 text-muted" />
    </motion.button>
  )
}

function lastBackupText(lastBackupAt: string | null | undefined) {
  if (!lastBackupAt) return 'Nunca has respaldado'
  const days = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000)
  return days <= 0 ? 'Último respaldo: hoy' : days === 1 ? 'Último respaldo: ayer' : `Último respaldo: hace ${days} días`
}

export function SettingsTab(props: {
  hud: Hud | undefined
  title: string
  onOpenSection: (section: SettingsSection) => void
  onEditProfile: () => void
}) {
  const profile = useLiveQuery(() => getProfile(db), [])
  const notifications = useLiveQuery(() => getNotificationSettings(db), [])
  const lastBackupAt = useLiveQuery(() => getLastBackupAt(db), [])
  const prefs = useLiveQuery(() => getPrefs(db), [])
  const [hasKey, setHasKey] = useState<boolean | null>(null)

  useEffect(() => {
    const refresh = () =>
      void getSecret(GEMINI_KEY_SECRET)
        .then((key) => setHasKey(key !== null))
        .catch(() => setHasKey(false))
    refresh()
    // Al cerrar la hoja de IA, el resumen se actualiza.
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])

  const reminders = notifications?.enabled
    ? `Activos · ${notifications.morning}, ${notifications.afternoon} y ${notifications.night}`
    : 'Apagados'

  return (
    <>
      <motion.button
        type="button"
        onClick={props.onEditProfile}
        whileTap={{ scale: 0.985 }}
        className={cn(cardSurface, 'flex items-center gap-4 p-5 text-left')}
      >
        <Avatar photo={profile?.photo ?? null} name={profile?.name ?? ''} size="md" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-xl font-semibold">
            {profile?.name || 'Tu perfil'}
          </span>
          <span className="block text-sm text-muted">
            {props.title} · Nivel {props.hud?.level ?? 1}
          </span>
        </span>
        <span className="grid size-10 place-items-center rounded-full bg-white/[0.06] text-muted">
          <Pencil aria-hidden className="size-4" />
        </span>
      </motion.button>

      <nav aria-label="Ajustes" className={cn(cardSurface, 'divide-y divide-white/[0.05] overflow-hidden')}>
        <MenuRow
          icon={BellRing}
          tone="bg-signal/15 text-signal"
          label="Recordatorios"
          summary={reminders}
          onClick={() => props.onOpenSection('reminders')}
        />
        <MenuRow
          icon={DatabaseBackup}
          tone="bg-info/15 text-info"
          label="Respaldo"
          summary={lastBackupText(lastBackupAt)}
          onClick={() => props.onOpenSection('backup')}
        />
        <MenuRow
          icon={Sparkles}
          tone="bg-violet-400/15 text-violet-300"
          label="Inteligencia artificial"
          summary={hasKey === null ? 'Gemini' : hasKey ? 'Gemini conectado' : 'Falta tu API key'}
          onClick={() => props.onOpenSection('ai')}
        />
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-signal/15 text-signal">
            <Vibrate aria-hidden className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Vibración</span>
            <span className="block truncate text-sm text-muted">Al completar, desbloquear y subir de nivel</span>
          </span>
          <Switch
            label="Vibración"
            checked={prefs?.haptics ?? true}
            onChange={(haptics) => {
              // Se aplica de inmediato para que el interruptor mismo ya vibre (o deje de vibrar).
              setHapticsEnabled(haptics)
              if (haptics) haptic('complete')
              void savePrefs(db, { haptics })
            }}
          />
        </div>
      </nav>

      <nav aria-label="Información" className={cn(cardSurface, 'divide-y divide-white/[0.05] overflow-hidden')}>
        <MenuRow
          icon={ScrollText}
          tone="bg-ember/15 text-ember"
          label="Reglas del juego"
          summary="XP, rachas, actos y cierre del día"
          onClick={() => props.onOpenSection('rules')}
        />
        <MenuRow
          icon={Cpu}
          tone="bg-white/[0.08] text-muted"
          label="Acerca de"
          summary="Versión y datos"
          onClick={() => props.onOpenSection('about')}
        />
        <MenuRow
          icon={RotateCcw}
          tone="bg-ember/15 text-ember"
          label="Restablecer progreso"
          summary="Empezar de cero: misiones, árbol, XP y nivel"
          onClick={() => props.onOpenSection('reset')}
        />
      </nav>
    </>
  )
}
