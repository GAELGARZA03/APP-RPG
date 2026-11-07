import type { ReactNode } from 'react'
import { db } from '../data/appDb'
import type { Hud } from '../data/gameStore'
import { saveCosmetics } from '../data/settings'
import {
  CRT_EFFECT,
  effectiveCosmetics,
  nextUnlock,
  SOUNDS,
  THEMES,
  TITLES,
  titleName,
  type CosmeticChoice,
} from '../game/cosmetics'
import { Panel } from './parts'
import { playComplete } from './sound'

function Option(props: {
  label: string
  requiredLevel: number
  level: number
  selected: boolean
  onSelect: () => void
  preview?: ReactNode
}) {
  const locked = props.requiredLevel > props.level

  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={props.selected}
      onClick={props.onSelect}
      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-sm ${
        props.selected
          ? 'border-signal bg-signal/10 text-signal'
          : locked
            ? 'border-line text-muted opacity-60'
            : 'border-line active:border-signal'
      }`}
    >
      <span className="flex items-center gap-2">
        {props.preview}
        {props.label}
      </span>
      {locked ? (
        <span className="shrink-0 text-xs">🔒 Nv. {props.requiredLevel}</span>
      ) : (
        props.selected && <span className="shrink-0 text-xs">✓</span>
      )}
    </button>
  )
}

export function ProfileTab({ hud, choice }: { hud: Hud; choice: CosmeticChoice }) {
  const { level } = hud
  const active = effectiveCosmetics(choice, level)
  const next = nextUnlock(level)
  const select = (changes: Partial<CosmeticChoice>) => void saveCosmetics(db, changes)
  const crtLocked = level < CRT_EFFECT.level

  return (
    <>
      <section aria-label="Perfil" className="rounded-lg border border-line bg-panel p-4">
        <p className="text-xs tracking-widest text-muted">TÍTULO</p>
        <p className="text-2xl leading-tight font-bold text-signal">{titleName(active.title)}</p>
        <p className="mt-1 text-sm">
          Nivel {level} · {hud.totalXp} XP en total
        </p>
        <p className="mt-3 text-sm text-muted">
          {next ? (
            <>
              Próximo desbloqueo en el nivel {next.level}: <span className="text-ember">{next.labels.join(', ')}</span>
            </>
          ) : (
            'Desbloqueaste todas las recompensas.'
          )}
        </p>
      </section>

      <Panel label="Títulos">
        <div className="flex flex-col gap-2">
          {TITLES.map((title) => (
            <Option
              key={title.id}
              label={title.name}
              requiredLevel={title.level}
              level={level}
              selected={active.title === title.id}
              onSelect={() => select({ title: title.id })}
            />
          ))}
        </div>
      </Panel>

      <Panel label="Temas">
        <div className="flex flex-col gap-2">
          {THEMES.map((theme) => (
            <Option
              key={theme.id}
              label={theme.name}
              requiredLevel={theme.level}
              level={level}
              selected={active.theme === theme.id}
              onSelect={() => select({ theme: theme.id })}
              preview={
                <span aria-hidden className="flex overflow-hidden rounded-sm border border-line">
                  <span className="size-4" style={{ background: theme.swatch[0] }} />
                  <span className="size-4" style={{ background: theme.swatch[1] }} />
                </span>
              }
            />
          ))}
        </div>
      </Panel>

      <Panel label="Sonidos">
        <div className="flex flex-col gap-2">
          {SOUNDS.map((sound) => (
            <Option
              key={sound.id}
              label={sound.name}
              requiredLevel={sound.level}
              level={level}
              selected={active.sound === sound.id}
              onSelect={() => {
                select({ sound: sound.id })
                playComplete(sound.id)
              }}
            />
          ))}
        </div>
      </Panel>

      <Panel label="Efectos">
        <label className={`flex min-h-11 items-center justify-between gap-3 text-sm ${crtLocked ? 'text-muted' : ''}`}>
          <span>
            {CRT_EFFECT.name} <span className="text-xs text-muted">(líneas de pantalla retro)</span>
          </span>
          {crtLocked ? (
            <span className="shrink-0 text-xs">🔒 Nv. {CRT_EFFECT.level}</span>
          ) : (
            <input
              type="checkbox"
              role="switch"
              checked={active.crt}
              onChange={(event) => select({ crt: event.target.checked })}
              className="size-6 shrink-0 accent-signal"
            />
          )}
        </label>
      </Panel>
    </>
  )
}
