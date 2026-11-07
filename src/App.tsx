import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db } from './data/appDb'
import type { Campaign, SideQuest } from './data/db'
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
  updateSideQuest,
  type TodayBounty,
} from './data/gameStore'
import { FormSheet, type FormSheetProps } from './ui/FormSheet'
import { GeneratorSheet } from './ui/GeneratorSheet'
import { MissionsTab } from './ui/MissionsTab'
import { effectiveCosmetics, THEMES, titleName, unlocksBetween } from './game/cosmetics'
import { getCosmetics } from './data/settings'
import { ProfileTab } from './ui/ProfileTab'
import { playComplete, playLevelUp, setSoundPack } from './ui/sound'
import { getNotificationSettings } from './data/settings'
import { applyNotificationSettings, notificationsSupported } from './platform/notifications'
import { SettingsTab } from './ui/settings/SettingsTab'
import { TodayTab } from './ui/TodayTab'
import { useGameDay } from './ui/useGameDay'

type Tab = 'today' | 'missions' | 'profile' | 'settings'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'missions', label: 'Misiones' },
  { id: 'profile', label: 'Perfil' },
  { id: 'settings', label: 'Ajustes' },
]

type Sheet =
  | { kind: 'newBounty' }
  | { kind: 'editBounty'; bounty: TodayBounty }
  | { kind: 'newCampaign' }
  | { kind: 'editCampaign'; campaign: Campaign }
  | { kind: 'newQuest'; campaignId: string | null }
  | { kind: 'editQuest'; quest: SideQuest }
  | { kind: 'generate' }

function sheetProps(sheet: Exclude<Sheet, { kind: 'generate' }>): Omit<FormSheetProps, 'onClose'> {
  switch (sheet.kind) {
    case 'newBounty':
      return {
        heading: 'Nuevo contrato diario',
        submitLabel: 'Crear',
        initialDifficulty: 2,
        onSubmit: async (values) => void (await createBounty(db, values)),
      }
    case 'editBounty':
      return {
        heading: 'Editar contrato',
        submitLabel: 'Guardar',
        initialTitle: sheet.bounty.title,
        initialDifficulty: sheet.bounty.difficulty,
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
        onSubmit: async (values) =>
          void (await createSideQuest(db, { ...values, campaignId: sheet.campaignId })),
      }
    case 'editQuest':
      return {
        heading: 'Editar Side Quest',
        submitLabel: 'Guardar',
        initialTitle: sheet.quest.title,
        initialDifficulty: sheet.quest.difficulty,
        onSubmit: (values) => updateSideQuest(db, sheet.quest.id, values),
        danger: {
          label: 'Borrar Side Quest',
          confirmLabel: 'Toca otra vez para borrar (conservas el XP)',
          action: () => deleteSideQuest(db, sheet.quest.id),
        },
      }
  }
}

export function App() {
  const today = useGameDay()
  const hud = useLiveQuery(() => getHud(db, today), [today])
  const notificationSettings = useLiveQuery(() => getNotificationSettings(db), [])
  const cosmeticChoice = useLiveQuery(() => getCosmetics(db), [])
  const cosmetics = hud && cosmeticChoice ? effectiveCosmetics(cosmeticChoice, hud.level) : null
  const [tab, setTab] = useState<Tab>('today')
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)
  const previousLevel = useRef<number | null>(null)

  function showToast(text: string) {
    setToast({ id: Date.now(), text })
  }

  function reward(xp: number | null) {
    if (xp === null) return
    playComplete()
    showToast(`+${xp} XP`)
  }

  useEffect(() => {
    if (!toast) return
    // Los avisos largos (desbloqueos) se quedan más tiempo en pantalla.
    const timer = setTimeout(() => setToast(null), Math.min(5000, 1800 + toast.text.length * 30))
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!hud) return
    const previous = previousLevel.current
    if (previous !== null && hud.level > previous) {
      playLevelUp()
      const unlocked = unlocksBetween(previous, hud.level)
      showToast(
        unlocked.length > 0
          ? `¡Nivel ${hud.level}! Desbloqueaste: ${unlocked.join(', ')}`
          : `¡Subiste al nivel ${hud.level}!`,
      )
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

  // Mantiene los recordatorios programados al día con los ajustes guardados.
  useEffect(() => {
    if (notificationSettings) applyNotificationSettings(notificationSettings).catch(console.error)
  }, [notificationSettings])

  // Botón atrás de Android: cierra la hoja, vuelve a "Hoy" o minimiza la app.
  const handleBack = useRef(() => {})
  handleBack.current = () => {
    if (sheet) setSheet(null)
    else if (tab !== 'today') setTab('today')
    else void NativeApp.minimizeApp()
  }

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const listener = NativeApp.addListener('backButton', () => handleBack.current())
    return () => void listener.then((handle) => handle.remove())
  }, [])

  return (
    <>
      {cosmetics?.crt && <div aria-hidden className="crt-overlay" />}
      {/* Fondo bajo la barra de estado para que el contenido no se vea detrás de los iconos. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-10 h-[env(safe-area-inset-top)] bg-void" />
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <header>
          <p className="text-xs tracking-[0.3em] text-muted">REAL LIFE RPG</p>
        </header>

        {tab === 'today' && notificationsSupported && notificationSettings?.enabled === false && (
          <button
            type="button"
            onClick={() => setTab('settings')}
            className="rounded-lg border border-ember bg-ember/10 p-3 text-left text-sm"
          >
            <span className="font-bold text-ember">Activa tus recordatorios</span>
            <span className="block text-muted">Tres avisos al día para no perder tu racha. Toca para configurarlos.</span>
          </button>
        )}
        {hud && tab === 'today' && (
          <TodayTab
            today={today}
            hud={hud}
            title={titleName(cosmetics?.title ?? 'apprentice')}
            onCreate={() => setSheet({ kind: 'newBounty' })}
            onEdit={(bounty) => setSheet({ kind: 'editBounty', bounty })}
            onReward={reward}
          />
        )}
        {tab === 'missions' && (
          <MissionsTab
            onGenerate={() => setSheet({ kind: 'generate' })}
            onCreateCampaign={() => setSheet({ kind: 'newCampaign' })}
            onEditCampaign={(campaign) => setSheet({ kind: 'editCampaign', campaign })}
            onCreateQuest={(campaignId) => setSheet({ kind: 'newQuest', campaignId })}
            onEditQuest={(quest) => setSheet({ kind: 'editQuest', quest })}
            onReward={reward}
          />
        )}
        {tab === 'profile' && hud && cosmeticChoice && <ProfileTab hud={hud} choice={cosmeticChoice} />}
        {tab === 'settings' && <SettingsTab />}
      </main>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] flex justify-center">
        {toast && (
          <p
            key={toast.id}
            className="mx-4 max-w-sm animate-[toast-in_200ms_ease-out] rounded-md border border-signal bg-panel px-4 py-2 text-center font-bold text-signal shadow-lg"
          >
            {toast.text}
          </p>
        )}
      </div>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-void/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
              className={`min-h-14 text-sm tracking-wider ${
                tab === id ? 'border-t-2 border-signal text-signal' : 'border-t-2 border-transparent text-muted'
              }`}
            >
              {label.toUpperCase()}
            </button>
          ))}
        </div>
      </nav>

      {sheet?.kind === 'generate' && (
        <GeneratorSheet
          onClose={() => setSheet(null)}
          onOpenSettings={() => {
            setSheet(null)
            setTab('settings')
          }}
          onCreated={(campaign) => {
            playComplete()
            showToast(`Campaña creada: ${campaign}`)
          }}
        />
      )}
      {sheet && sheet.kind !== 'generate' && (
        <FormSheet key={JSON.stringify(sheet)} {...sheetProps(sheet)} onClose={() => setSheet(null)} />
      )}
    </>
  )
}
