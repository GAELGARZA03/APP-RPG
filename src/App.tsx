import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BellRing,
  ChevronRight,
  Flame,
  Settings,
  Sparkles,
  Sun,
  Swords,
  Trophy,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { motion, MotionConfig } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast, Toaster } from 'sonner'
import { db } from './data/appDb'
import type { Bounty, Campaign, SideQuest } from './data/db'
import {
  archiveBounty,
  createBounty,
  createCampaign,
  createSideQuest,
  deleteCampaign,
  deleteSideQuest,
  getHud,
  renameCampaign,
  updateBounty,
  getTaskDetail,
  updateSideQuest,
  type TaskDetailView,
  type TaskRef,
} from './data/gameStore'
import { getCosmetics, getNotificationSettings, getProfile } from './data/settings'
import { effectiveCosmetics, THEMES, titleName, unlocksBetween } from './game/cosmetics'
import { applyNotificationSettings, notificationsSupported } from './platform/notifications'
import { FormSheet, type FormSheetProps } from './ui/FormSheet'
import { GeneratorSheet } from './ui/GeneratorSheet'
import { cn } from './ui/kit/cn'
import { Logo } from './ui/kit/Logo'
import { MissionsTab } from './ui/MissionsTab'
import { ProfileTab } from './ui/ProfileTab'
import { ProfileSheet } from './ui/settings/ProfileSheet'
import { SettingsSectionSheet, SettingsTab, type SettingsSection } from './ui/settings/SettingsTab'
import { TaskDetail } from './ui/TaskDetail'
import { playComplete, playLevelUp, setSoundPack } from './ui/sound'
import { TodayTab } from './ui/TodayTab'
import { useGameDay } from './ui/useGameDay'

type Tab = 'today' | 'missions' | 'profile' | 'settings'

const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'today', label: 'Hoy', icon: Sun },
  { id: 'missions', label: 'Misiones', icon: Swords },
  { id: 'profile', label: 'Perfil', icon: UserRound },
  { id: 'settings', label: 'Ajustes', icon: Settings },
]

type Sheet =
  | { kind: 'newBounty' }
  | { kind: 'editBounty'; bounty: Bounty }
  | { kind: 'newCampaign' }
  | { kind: 'editCampaign'; campaign: Campaign }
  | { kind: 'newQuest'; campaignId: string | null }
  | { kind: 'editQuest'; quest: SideQuest }
  | { kind: 'generate' }
  | { kind: 'settings'; section: SettingsSection }
  | { kind: 'profile' }

type FormSheetKind = Exclude<Sheet, { kind: 'generate' | 'settings' | 'profile' }>

function sheetProps(sheet: FormSheetKind): Omit<FormSheetProps, 'onClose'> {
  switch (sheet.kind) {
    case 'newBounty':
      return {
        heading: 'Nuevo contrato diario',
        submitLabel: 'Crear',
        initialDifficulty: 2,
        withDetails: true,
        onSubmit: async (values) => void (await createBounty(db, values)),
      }
    case 'editBounty':
      return {
        heading: 'Editar contrato',
        submitLabel: 'Guardar',
        initialTitle: sheet.bounty.title,
        initialDifficulty: sheet.bounty.difficulty,
        withDetails: true,
        initialDescription: sheet.bounty.description,
        initialSteps: sheet.bounty.steps,
        onSubmit: (values) => updateBounty(db, sheet.bounty.id, values),
        danger: {
          label: 'Archivar contrato',
          confirmLabel: 'Toca otra vez para archivar (conservas el XP)',
          action: () => archiveBounty(db, sheet.bounty.id),
        },
      }
    case 'newCampaign':
      return {
        heading: 'Nueva campaña',
        submitLabel: 'Crear',
        onSubmit: async ({ title }) => void (await createCampaign(db, title)),
      }
    case 'editCampaign':
      return {
        heading: 'Editar campaña',
        submitLabel: 'Guardar',
        initialTitle: sheet.campaign.title,
        onSubmit: ({ title }) => renameCampaign(db, sheet.campaign.id, title),
        danger: {
          label: 'Borrar campaña',
          confirmLabel: 'Toca otra vez: se borran sus Side Quests (conservas el XP)',
          action: () => deleteCampaign(db, sheet.campaign.id),
        },
      }
    case 'newQuest':
      return {
        heading: sheet.campaignId ? 'Nueva Side Quest' : 'Nueva Side Quest suelta',
        submitLabel: 'Crear',
        initialDifficulty: 2,
        withDetails: true,
        onSubmit: async (values) =>
          void (await createSideQuest(db, {
            ...values,
            campaignId: sheet.campaignId,
          })),
      }
    case 'editQuest':
      return {
        heading: 'Editar Side Quest',
        submitLabel: 'Guardar',
        initialTitle: sheet.quest.title,
        initialDifficulty: sheet.quest.difficulty,
        withDetails: true,
        initialDescription: sheet.quest.description,
        initialSteps: sheet.quest.steps,
        onSubmit: (values) => updateSideQuest(db, sheet.quest.id, values),
        danger: {
          label: 'Borrar Side Quest',
          confirmLabel: 'Toca otra vez para borrar (conservas el XP)',
          action: () => deleteSideQuest(db, sheet.quest.id),
        },
      }
  }
}

const TOAST_OFFSET = { bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }

export function App() {
  const today = useGameDay()
  const hud = useLiveQuery(() => getHud(db, today), [today])
  const notificationSettings = useLiveQuery(() => getNotificationSettings(db), [])
  const cosmeticChoice = useLiveQuery(() => getCosmetics(db), [])
  const profile = useLiveQuery(() => getProfile(db), [])
  const cosmetics = hud && cosmeticChoice ? effectiveCosmetics(cosmeticChoice, hud.level) : null
  const [tab, setTab] = useState<Tab>('today')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [detail, setDetail] = useState<{ ref: TaskRef; initial: TaskDetailView } | null>(null)
  const previousLevel = useRef<number | null>(null)

  const closeDetail = useCallback(() => setDetail(null), [])

  // Se cargan los datos antes de abrir: así la tarjeta crece una sola vez, ya con su contenido.
  async function openDetail(ref: TaskRef) {
    const initial = await getTaskDetail(db, ref, today)
    if (initial) setDetail({ ref, initial })
  }

  function reward(xp: number | null) {
    if (xp === null) return
    playComplete()
    toast(`+${xp} XP`, {
      icon: <Sparkles aria-hidden className="size-5 text-signal" />,
      duration: 1800,
    })
  }

  useEffect(() => {
    if (!hud) return
    const previous = previousLevel.current
    if (previous !== null && hud.level > previous) {
      playLevelUp()
      const unlocked = unlocksBetween(previous, hud.level)
      toast(`¡Subiste al nivel ${hud.level}!`, {
        description: unlocked.length > 0 ? `Desbloqueaste: ${unlocked.join(', ')}` : undefined,
        icon: <Trophy aria-hidden className="size-5 text-signal" />,
        duration: 5000,
      })
    }
    previousLevel.current = hud.level
  }, [hud])

  // Aplica el tema y los sonidos elegidos (solo si están desbloqueados).
  const themeId = cosmetics?.theme
  const soundId = cosmetics?.sound
  useEffect(() => {
    if (!themeId) return
    document.documentElement.dataset.theme = themeId
    const background = THEMES.find((theme) => theme.id === themeId)?.swatch[0]
    if (background) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', background)
  }, [themeId])
  useEffect(() => {
    if (soundId) setSoundPack(soundId)
  }, [soundId])

  // Cada pestaña empieza desde arriba, no donde se quedó la anterior.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  // Mantiene los recordatorios programados al día con los ajustes guardados.
  useEffect(() => {
    if (notificationSettings) applyNotificationSettings(notificationSettings).catch(console.error)
  }, [notificationSettings])

  // Botón atrás de Android: cierra la hoja, vuelve a "Hoy" o minimiza la app.
  const handleBack = useRef(() => {})
  handleBack.current = () => {
    if (sheet) setSheet(null)
    else if (detail) setDetail(null)
    else if (tab !== 'today') setTab('today')
    else void NativeApp.minimizeApp()
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = NativeApp.addListener('backButton', () => handleBack.current())
    return () => void listener.then((handle) => handle.remove())
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      {cosmetics?.crt && <div aria-hidden className="crt-overlay" />}
      {/* Fondo bajo la barra de estado para que el contenido no se vea detrás de los iconos. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-10 h-[env(safe-area-inset-top)] bg-void" />

      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
        <header className="flex items-center py-1">
          <Logo />
        </header>

        {/* Solo animación de entrada: esperar la salida hacía que cambiar de pestaña se sintiera lento. */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex flex-col gap-4"
        >
          {tab === 'today' && notificationsSupported && notificationSettings?.enabled === false && (
            <button
              type="button"
              onClick={() => setTab('settings')}
              className="flex items-center gap-3 rounded-2xl border border-ember/50 bg-ember/10 p-3 text-left text-sm active:bg-ember/20"
            >
              <BellRing aria-hidden className="size-5 shrink-0 text-ember" />
              <span className="flex-1">
                <span className="block font-semibold text-ember">Activa tus recordatorios</span>
                <span className="block text-muted">Tres avisos al día para cuidar tu racha.</span>
              </span>
              <ChevronRight aria-hidden className="size-5 text-ember" />
            </button>
          )}
          {hud && tab === 'today' && (
            <TodayTab
              today={today}
              hud={hud}
              title={titleName(cosmetics?.title ?? 'apprentice')}
              profile={profile}
              onProfile={() => setTab('profile')}
              onCreate={() => setSheet({ kind: 'newBounty' })}
              onOpen={(ref) => void openDetail(ref)}
              onStreakInfo={() =>
                toast('Cómo funciona la racha', {
                  description:
                    'Completa todos tus contratos de hoy para sumar un día. Cada día de racha da +5% de XP en contratos, hasta +50%. Fallar un día la reduce a la mitad.',
                  icon: <Flame aria-hidden className="size-5 text-signal" />,
                  duration: 6000,
                })
              }
              onReward={reward}
            />
          )}
          {tab === 'missions' && (
            <MissionsTab
              onGenerate={() => setSheet({ kind: 'generate' })}
              onCreateCampaign={() => setSheet({ kind: 'newCampaign' })}
              onEditCampaign={(campaign) => setSheet({ kind: 'editCampaign', campaign })}
              onCreateQuest={(campaignId) => setSheet({ kind: 'newQuest', campaignId })}
              onOpen={(ref) => void openDetail(ref)}
              onReward={reward}
            />
          )}
          {tab === 'profile' && hud && cosmeticChoice && <ProfileTab hud={hud} choice={cosmeticChoice} />}
          {tab === 'settings' && (
            <SettingsTab
              hud={hud}
              title={titleName(cosmetics?.title ?? 'apprentice')}
              onOpenSection={(section) => setSheet({ kind: 'settings', section })}
              onEditProfile={() => setSheet({ kind: 'profile' })}
            />
          )}
        </motion.div>
      </main>

      <Toaster
        position="bottom-center"
        offset={TOAST_OFFSET}
        mobileOffset={TOAST_OFFSET}
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'flex w-full items-center gap-3 rounded-2xl border border-signal/50 bg-panel px-4 py-3 text-ink shadow-xl shadow-black/40',
            title: 'font-display text-base font-semibold',
            description: 'text-sm text-muted',
          },
        }}
      />

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-white/[0.06] bg-void/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold tracking-wide transition-colors',
                tab === id ? 'text-signal' : 'text-muted',
              )}
            >
              <span className="relative grid h-8 w-14 place-items-center">
                {tab === id && (
                  <motion.span
                    layoutId="tab-indicator"
                    className="absolute inset-0 rounded-full bg-signal/15 ring-1 ring-signal/30"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <Icon aria-hidden className="relative size-5" />
              </span>
              {label}
            </button>
          ))}
        </div>
      </nav>

      {detail && (
        <TaskDetail
          key={detail.ref.id}
          taskRef={detail.ref}
          initialView={detail.initial}
          today={today}
          onClose={closeDetail}
          onReward={reward}
          onEdit={(view) =>
            setSheet(
              view.kind === 'bounty'
                ? { kind: 'editBounty', bounty: view.task }
                : { kind: 'editQuest', quest: view.task },
            )
          }
        />
      )}

      {sheet?.kind === 'generate' && (
        <GeneratorSheet
          onClose={() => setSheet(null)}
          onOpenSettings={() => {
            setSheet(null)
            setTab('settings')
          }}
          onCreated={(campaign) => {
            playComplete()
            toast('Campaña creada', {
              description: campaign,
              icon: <Sparkles aria-hidden className="size-5 text-signal" />,
            })
          }}
        />
      )}
      {sheet?.kind === 'settings' && <SettingsSectionSheet section={sheet.section} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'profile' && <ProfileSheet onClose={() => setSheet(null)} />}
      {sheet && sheet.kind !== 'generate' && sheet.kind !== 'settings' && sheet.kind !== 'profile' && (
        <FormSheet key={JSON.stringify(sheet)} {...sheetProps(sheet)} onClose={() => setSheet(null)} />
      )}
    </MotionConfig>
  )
}
