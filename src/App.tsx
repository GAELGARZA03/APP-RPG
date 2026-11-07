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
import { MissionsTab } from './ui/MissionsTab'
import { playComplete, playLevelUp } from './ui/sound'
import { SystemTab } from './ui/SystemTab'
import { TodayTab } from './ui/TodayTab'
import { useGameDay } from './ui/useGameDay'

type Tab = 'today' | 'missions' | 'system'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'today', label: 'Hoy' },
  { id: 'missions', label: 'Misiones' },
  { id: 'system', label: 'Sistema' },
]

type Sheet =
  | { kind: 'newBounty' }
  | { kind: 'editBounty'; bounty: TodayBounty }
  | { kind: 'newCampaign' }
  | { kind: 'editCampaign'; campaign: Campaign }
  | { kind: 'newQuest'; campaignId: string | null }
  | { kind: 'editQuest'; quest: SideQuest }

function sheetProps(sheet: Sheet): Omit<FormSheetProps, 'onClose'> {
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
    const timer = setTimeout(() => setToast(null), 1800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!hud) return
    if (previousLevel.current !== null && hud.level > previousLevel.current) {
      playLevelUp()
      showToast(`¡Subiste al nivel ${hud.level}!`)
    }
    previousLevel.current = hud.level
  }, [hud])

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
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+6rem)]">
        <header>
          <p className="text-xs tracking-[0.3em] text-muted">REAL LIFE RPG</p>
        </header>

        {hud && tab === 'today' && (
          <TodayTab
            today={today}
            hud={hud}
            onCreate={() => setSheet({ kind: 'newBounty' })}
            onEdit={(bounty) => setSheet({ kind: 'editBounty', bounty })}
            onReward={reward}
          />
        )}
        {tab === 'missions' && (
          <MissionsTab
            onCreateCampaign={() => setSheet({ kind: 'newCampaign' })}
            onEditCampaign={(campaign) => setSheet({ kind: 'editCampaign', campaign })}
            onCreateQuest={(campaignId) => setSheet({ kind: 'newQuest', campaignId })}
            onEditQuest={(quest) => setSheet({ kind: 'editQuest', quest })}
            onReward={reward}
          />
        )}
        {tab === 'system' && <SystemTab />}
      </main>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] flex justify-center">
        {toast && (
          <p
            key={toast.id}
            className="animate-[toast-in_200ms_ease-out] rounded-md border border-signal bg-panel px-4 py-2 font-bold text-signal shadow-lg"
          >
            {toast.text}
          </p>
        )}
      </div>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-void/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-md grid-cols-3">
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

      {sheet && <FormSheet key={JSON.stringify(sheet)} {...sheetProps(sheet)} onClose={() => setSheet(null)} />}
    </>
  )
}
